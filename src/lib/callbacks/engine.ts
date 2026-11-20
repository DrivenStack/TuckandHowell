/**
 * Callback engine. Pure functions only.
 *
 * The five callback lists are not stored: they are derived from the raw event log
 * (calls, texts, jobs and user actions) every time. That keeps the rules in one place,
 * makes them testable, and means real ServiceTitan / Dialpad events can be fed in later
 * without changing this file.
 *
 * Rules (brief section 5):
 *  1. Outbound calls match by ANY phone on the customer's record.
 *  2. Only outbound calls after the missed call count.
 *  3. Answered and at least the minimum length            -> Called back
 *  4. No answer, voicemail or shorter than the minimum     -> Attempted (attempts + 1)
 *  5. Customer calls in again and a CSR answers            -> Called back
 *  6. A job is booked after the missed call                -> Booked (wins over every other list)
 *  7. Max attempts reached with no contact                 -> Closed "No answer after X attempts"
 *  8. "Texts count as contact" on: a text counts like an answered call
 *  9. Several missed calls from one customer group into one item
 * Attempted returns to Needs callback after the retry wait.
 * Claims lock an item to a CSR and expire if no call is made.
 */
import {
  EMERGENCY_JOB_TYPES,
  type Call,
  type Callback,
  type CallbackAction,
  type CallbackList,
  type CallbackSettings,
  type CallbackTrigger,
  type Customer,
  type InboundCall,
  type Job,
  type OutboundCall,
  type Priority,
  type TextMessage,
  type TimelineEvent,
} from "@/lib/types";

import { DAY, HOUR, MINUTE, nyAddDays, nyParts, nyStartOfDay } from "@/lib/time";

/** Outbound calls, texts and repeat calls only match an item within this window of its last missed call. */
export const MATCH_WINDOW_MS = 3 * DAY;
/** A booking after an item was called back or closed still counts as Booked within this window. */
export const BOOKING_AFTER_RESOLVE_MS = 3 * DAY;

export interface EngineInput {
  customers: Customer[];
  calls: Call[];
  texts: TextMessage[];
  jobs: Job[];
  actions: CallbackAction[];
  settings: CallbackSettings;
  now: number;
  /** Optional, used for readable timeline titles */
  csrNames?: Record<string, string>;
}

export const callbackIdFor = (firstTriggerCallId: string) => `cb_${firstTriggerCallId}`;

/** Missed, abandoned, or AI Voice Agent calls with no booking need a callback. */
export function isTriggerCall(call: Call): boolean {
  return (
    call.direction === "inbound" &&
    (call.outcome === "missed" ||
      call.outcome === "abandoned" ||
      (call.outcome === "ai_agent" && !call.booked))
  );
}

export function triggerOf(call: InboundCall): CallbackTrigger {
  if (call.outcome === "ai_agent") return "ai_agent";
  return call.outcome === "abandoned" ? "abandoned" : "missed";
}

/** Rule 3/4: does this outbound call count as real contact? */
export function isRealContact(call: OutboundCall, minCallSeconds: number): boolean {
  return call.outcome === "answered" && call.durationSec >= minCallSeconds;
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Rule 1: index every phone on every customer record. */
export function buildPhoneIndex(customers: Customer[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const c of customers) for (const p of c.phones) index.set(normalizePhone(p), c.id);
  return index;
}

type EngineEvent =
  | { at: number; order: number; type: "trigger"; call: InboundCall }
  | { at: number; order: number; type: "outbound"; call: OutboundCall }
  | { at: number; order: number; type: "inbound_answered"; call: InboundCall }
  | { at: number; order: number; type: "text"; text: TextMessage }
  | { at: number; order: number; type: "job"; job: Job }
  | { at: number; order: number; type: "action"; action: CallbackAction };

const OPEN_LISTS: CallbackList[] = ["needs_callback", "attempted"];
export const isOpen = (cb: Pick<Callback, "list">) => OPEN_LISTS.includes(cb.list);

const TRIGGER_TITLES: Record<CallbackTrigger, string> = {
  missed: "Missed call",
  abandoned: "Hung up while waiting",
  ai_agent: "AI Voice Agent took the call, no booking",
};

export function deriveCallbacks(input: EngineInput): Callback[] {
  const { settings, now } = input;
  const names = input.csrNames ?? {};
  const nameOf = (id: string | null | undefined) => (id ? (names[id] ?? "a CSR") : "a CSR");

  const phoneIndex = buildPhoneIndex(input.customers);
  const customerById = new Map(input.customers.map((c) => [c.id, c]));
  const rawIndex = new Map<string, string>();
  for (const c of input.customers) for (const p of c.phones) rawIndex.set(p, c.id);
  const resolveCustomer = (phone: string, fallback: string) =>
    rawIndex.get(phone) ?? phoneIndex.get(normalizePhone(phone)) ?? fallback;

  // Map callback ids to customers so actions can be routed.
  const callCustomer = new Map<string, string>();

  // Group raw events by customer.
  const byCustomer = new Map<string, EngineEvent[]>();
  const push = (customerId: string, ev: EngineEvent) => {
    const list = byCustomer.get(customerId);
    if (list) list.push(ev);
    else byCustomer.set(customerId, [ev]);
  };

  for (const call of input.calls) {
    const customerId = resolveCustomer(call.phone, call.customerId);
    if (call.direction === "inbound") {
      if (isTriggerCall(call)) {
        callCustomer.set(callbackIdFor(call.id), customerId);
        push(customerId, { at: call.startedAt, order: 0, type: "trigger", call });
      } else if (call.outcome === "csr_answered") {
        push(customerId, { at: call.startedAt, order: 1, type: "inbound_answered", call });
      }
    } else if (call.startedAt <= now) {
      push(customerId, { at: call.startedAt, order: 1, type: "outbound", call });
    }
  }
  for (const text of input.texts) {
    if (text.sentAt > now) continue;
    push(resolveCustomer(text.phone, text.customerId), { at: text.sentAt, order: 1, type: "text", text });
  }
  for (const job of input.jobs) {
    if (job.bookedAt > now || job.status === "Canceled") continue;
    push(job.customerId, { at: job.bookedAt, order: 2, type: "job", job });
  }
  for (const action of input.actions) {
    if (action.at > now) continue;
    const customerId = callCustomer.get(action.callbackId);
    if (customerId) push(customerId, { at: action.at, order: 3, type: "action", action });
  }

  const results: Callback[] = [];

  for (const [customerId, events] of byCustomer) {
    if (!events.some((e) => e.type === "trigger")) continue;
    events.sort((a, b) => a.at - b.at || a.order - b.order);

    const episodes: Callback[] = [];
    const byId = new Map<string, Callback>();
    let open: Callback | null = null;
    let evSeq = 0;

    const addEvent = (cb: Callback, e: Omit<TimelineEvent, "id">) => {
      cb.events.push({ ...e, id: `${cb.id}_${evSeq++}` });
    };

    /** Time-based transitions: claim expiry and the retry wait. */
    const advance = (cb: Callback, t: number) => {
      if (cb.claim && t >= cb.claim.expiresAt) {
        addEvent(cb, {
          at: cb.claim.expiresAt,
          kind: "claim_expired",
          title: `Claim by ${nameOf(cb.claim.csrId)} expired`,
          detail: `No call was made within ${settings.claimExpiryMinutes} minutes.`,
          csrId: cb.claim.csrId,
        });
        cb.claim = null;
      }
      if (cb.list === "attempted" && cb.lastAttemptAt !== null) {
        const due = cb.lastAttemptAt + settings.retryWaitMinutes * MINUTE;
        if (t >= due) {
          cb.list = "needs_callback";
          addEvent(cb, {
            at: due,
            kind: "back_to_needs",
            title: "Back in Needs callback",
            detail: `Retry wait of ${formatWait(settings.retryWaitMinutes)} has passed.`,
          });
        }
      }
    };

    const resolve = (
      cb: Callback,
      list: "called_back" | "booked" | "closed",
      at: number,
      csrId: string | null,
    ) => {
      cb.list = list;
      cb.resolvedAt = at;
      cb.resolvedByCsrId = csrId;
      cb.claim = null;
      if (open === cb) open = null;
    };

    const withinWindow = (cb: Callback, at: number) =>
      at > cb.firstMissedAt && at - cb.lastMissedAt <= MATCH_WINDOW_MS;

    for (const ev of events) {
      if (open) advance(open, ev.at);

      switch (ev.type) {
        case "trigger": {
          const call = ev.call;
          const trig = triggerOf(call);
          if (open && ev.at - open.lastMissedAt <= MATCH_WINDOW_MS) {
            // Rule 9: group repeat missed calls into one item.
            open.missedCount += 1;
            open.lastMissedAt = call.startedAt;
            open.triggerCallIds.push(call.id);
            open.hotLead = open.hotLead || call.hotLead;
            addEvent(open, {
              at: call.startedAt,
              kind: "missed_call",
              title: `${TRIGGER_TITLES[trig]} (call ${open.missedCount})`,
              detail: `From ${call.phone}`,
            });
            if (call.aiSummary) {
              addEvent(open, { at: call.startedAt + 1, kind: "ai_summary", title: "AI Voice Agent summary", detail: call.aiSummary });
            }
            if (open.list === "attempted") {
              open.list = "needs_callback";
              addEvent(open, { at: call.startedAt + 2, kind: "back_to_needs", title: "Back in Needs callback", detail: "The customer called again." });
            }
          } else {
            const cb: Callback = {
              id: callbackIdFor(call.id),
              customerId,
              trigger: trig,
              triggerCallIds: [call.id],
              missedCount: 1,
              firstMissedAt: call.startedAt,
              lastMissedAt: call.startedAt,
              jobType: call.jobType,
              campaignId: call.campaignId,
              hotLead: call.hotLead,
              list: "needs_callback",
              attempts: 0,
              lastAttemptAt: null,
              firstAttemptAt: null,
              resolvedAt: null,
              resolvedByCsrId: null,
              contactAt: null,
              closeReason: null,
              claim: null,
              jobId: null,
              priority: "Normal",
              priorityReasons: [],
              events: [],
            };
            addEvent(cb, {
              at: call.startedAt,
              kind: "missed_call",
              title: TRIGGER_TITLES[trig],
              detail:
                trig === "missed" && call.csrId
                  ? `From ${call.phone}. Rang ${nameOf(call.csrId)} while available.`
                  : `From ${call.phone}`,
            });
            if (call.aiSummary) {
              addEvent(cb, { at: call.startedAt + 1, kind: "ai_summary", title: "AI Voice Agent summary", detail: call.aiSummary });
            }
            episodes.push(cb);
            byId.set(cb.id, cb);
            open = cb;
          }
          break;
        }

        case "outbound": {
          const cb = open;
          if (!cb || !withinWindow(cb, ev.at)) break; // Rule 2
          const call = ev.call;
          if (cb.firstAttemptAt === null) cb.firstAttemptAt = call.startedAt;
          if (isRealContact(call, settings.minCallSeconds)) {
            // Rule 3
            cb.contactAt = call.startedAt;
            addEvent(cb, {
              at: call.startedAt,
              kind: "spoke",
              title: `Spoke with customer`,
              detail: `${nameOf(call.csrId)} called ${call.phone}, talked ${Math.round(call.durationSec / 60) || 1} min.`,
              csrId: call.csrId,
            });
            resolve(cb, "called_back", call.startedAt, call.csrId);
          } else {
            // Rule 4
            cb.attempts += 1;
            cb.lastAttemptAt = call.startedAt;
            cb.claim = null;
            const why =
              call.outcome === "voicemail"
                ? "left voicemail"
                : call.outcome === "no_answer"
                  ? "no answer"
                  : `call under ${settings.minCallSeconds} sec`;
            addEvent(cb, {
              at: call.startedAt,
              kind: "attempt",
              title: `Attempt ${cb.attempts}: ${why}`,
              detail: `${nameOf(call.csrId)} called ${call.phone}.`,
              csrId: call.csrId,
            });
            if (cb.attempts >= settings.maxAttempts) {
              // Rule 7
              cb.closeReason = `No answer after ${settings.maxAttempts} attempts`;
              addEvent(cb, { at: call.startedAt + 1, kind: "closed", title: `Closed: ${cb.closeReason}` });
              resolve(cb, "closed", call.startedAt, null);
            } else {
              cb.list = "attempted";
            }
          }
          break;
        }

        case "inbound_answered": {
          const cb = open;
          if (!cb || !withinWindow(cb, ev.at)) break;
          // Rule 5
          cb.contactAt = ev.call.startedAt;
          addEvent(cb, {
            at: ev.call.startedAt,
            kind: "called_in",
            title: "Customer called in again",
            detail: `Answered by ${nameOf(ev.call.csrId)}.`,
            csrId: ev.call.csrId,
          });
          resolve(cb, "called_back", ev.call.startedAt, ev.call.csrId);
          break;
        }

        case "text": {
          const cb = open;
          if (!cb || !withinWindow(cb, ev.at)) break;
          addEvent(cb, {
            at: ev.text.sentAt,
            kind: "text",
            title: settings.textsCountAsContact ? "Text sent, counts as contact" : "Text sent",
            detail: `${nameOf(ev.text.csrId)}: "${ev.text.body}"`,
            csrId: ev.text.csrId,
          });
          if (settings.textsCountAsContact) {
            // Rule 8
            cb.contactAt = ev.text.sentAt;
            if (cb.firstAttemptAt === null) cb.firstAttemptAt = ev.text.sentAt;
            resolve(cb, "called_back", ev.text.sentAt, ev.text.csrId);
          }
          break;
        }

        case "job": {
          // Rule 6: a booking wins over every other list.
          const job = ev.job;
          let cb: Callback | null = open && withinWindow(open, ev.at) ? open : null;
          if (!cb) {
            const last = episodes[episodes.length - 1];
            if (
              last &&
              last.list !== "booked" &&
              last.resolvedAt !== null &&
              job.bookedAt > last.firstMissedAt &&
              job.bookedAt - last.resolvedAt <= BOOKING_AFTER_RESOLVE_MS
            ) {
              cb = last;
            }
          }
          if (!cb) break;
          if (cb.contactAt === null) cb.contactAt = job.bookedAt;
          cb.jobId = job.id;
          cb.closeReason = null;
          addEvent(cb, {
            at: job.bookedAt,
            kind: "booked",
            title: `Job booked: ${job.jobType}`,
            detail: job.bookedByCsrId
              ? `Booked by ${nameOf(job.bookedByCsrId)}.`
              : job.bookedBy === "ai_agent"
                ? "Booked by the AI Voice Agent."
                : "Booked online.",
            csrId: job.bookedByCsrId,
          });
          resolve(cb, "booked", job.bookedAt, job.bookedByCsrId ?? cb.resolvedByCsrId);
          break;
        }

        case "action": {
          const a = ev.action;
          const cb = byId.get(a.callbackId);
          if (!cb) break;
          if (cb !== open) advance(cb, a.at);
          if (a.kind === "claim") {
            if (cb.list === "needs_callback" && !cb.claim) {
              cb.claim = { csrId: a.csrId, at: a.at, expiresAt: a.at + settings.claimExpiryMinutes * MINUTE };
              addEvent(cb, { at: a.at, kind: "claimed", title: `Claimed by ${nameOf(a.csrId)}`, csrId: a.csrId });
            }
          } else if (a.kind === "release") {
            if (cb.claim && cb.claim.csrId === a.csrId) {
              cb.claim = null;
              addEvent(cb, { at: a.at, kind: "released", title: `Released by ${nameOf(a.csrId)}`, csrId: a.csrId });
            }
          } else if (a.kind === "close") {
            if (isOpen(cb)) {
              cb.closeReason = a.reason;
              addEvent(cb, { at: a.at, kind: "closed", title: `Closed: ${a.reason}`, detail: `Marked by ${nameOf(a.csrId)}.`, csrId: a.csrId });
              resolve(cb, "closed", a.at, a.csrId);
            }
          }
          break;
        }
      }
    }

    // Bring open items up to "now".
    for (const cb of episodes) {
      if (isOpen(cb)) advance(cb, now);
      cb.events.sort((a, b) => a.at - b.at);
      const pr = computePriority(cb, customerById.get(customerId), now);
      cb.priority = pr.priority;
      cb.priorityReasons = pr.reasons;
      results.push(cb);
    }
  }

  return results;
}

function formatWait(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = mins / 60;
  return Number.isInteger(h) ? `${h} hr` : `${h.toFixed(1)} hr`;
}

/* ---------- Priority ---------- */

export function computePriority(
  cb: Pick<Callback, "jobType" | "missedCount" | "firstMissedAt" | "hotLead">,
  customer: Pick<Customer, "isVip"> | undefined,
  now: number,
): { priority: Priority; score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  if (EMERGENCY_JOB_TYPES.includes(cb.jobType)) {
    score += 3;
    reasons.push(`Emergency: ${cb.jobType}`);
  }
  if (customer?.isVip) {
    score += 2;
    reasons.push("VIP member");
  }
  if (cb.missedCount >= 2) {
    score += 2;
    reasons.push(`Called ${cb.missedCount} times`);
  }
  const waitMin = (now - cb.firstMissedAt) / MINUTE;
  if (waitMin >= 60) {
    score += 3;
    reasons.push("Waiting over an hour");
  } else if (waitMin >= 30) {
    score += 2;
    reasons.push("Waiting over 30 minutes");
  } else if (waitMin >= 15) {
    score += 1;
    reasons.push("Waiting over 15 minutes");
  }
  if (cb.hotLead) {
    score += 2;
    reasons.push("Ready to book");
  }
  const priority: Priority = score >= 6 ? "Urgent" : score >= 3 ? "High" : "Normal";
  return { priority, score, reasons };
}

const PRIORITY_RANK: Record<Priority, number> = { Urgent: 0, High: 1, Normal: 2 };

/** Needs callback order: priority first, then oldest wait. */
export function sortByPriority(items: Callback[]): Callback[] {
  return [...items].sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.firstMissedAt - b.firstMissedAt,
  );
}

/** Most recent activity first, for the resolved lists. */
export function sortByResolved(items: Callback[]): Callback[] {
  return [...items].sort(
    (a, b) => (b.resolvedAt ?? b.lastAttemptAt ?? b.lastMissedAt) - (a.resolvedAt ?? a.lastAttemptAt ?? a.lastMissedAt),
  );
}

export function countByList(items: Callback[]): Record<CallbackList, number> {
  const counts: Record<CallbackList, number> = {
    needs_callback: 0,
    attempted: 0,
    called_back: 0,
    booked: 0,
    closed: 0,
  };
  for (const cb of items) counts[cb.list] += 1;
  return counts;
}

/** CSRs staff the phones 7 am to 7 pm New York time. */
export const OPEN_HOUR = 7;
export const CLOSE_HOUR = 19;

/**
 * When the callback clock starts: the missed call itself during open hours,
 * otherwise 7 am the next time the call center opens.
 */
export function clockStart(ts: number): number {
  const p = nyParts(ts);
  if (p.hour >= OPEN_HOUR && p.hour < CLOSE_HOUR) return ts;
  const day = p.hour >= CLOSE_HOUR ? nyAddDays(ts, 1) : nyStartOfDay(ts);
  return day + OPEN_HOUR * HOUR;
}

/** Wait from first missed call (during open hours) to first attempt or contact, in ms. Null if never attempted. */
export function timeToCallback(cb: Callback): number | null {
  const first = [cb.firstAttemptAt, cb.contactAt].filter((v): v is number => v !== null);
  if (!first.length) return null;
  return Math.max(0, Math.min(...first) - clockStart(cb.firstMissedAt));
}

/** After this long, a callback is too late: most callers have hired someone else. */
export const RETURN_WINDOW_MS = DAY;

/**
 * Unreturned: nobody tried to reach the customer within 24 hours of the missed call.
 * Items still waiting count too, because they are at risk right now.
 */
export function neverReturned(cb: Callback): boolean {
  const first = [cb.firstAttemptAt, cb.contactAt].filter((v): v is number => v !== null);
  if (!first.length) return true;
  return Math.min(...first) - cb.firstMissedAt > RETURN_WINDOW_MS;
}

export interface ListMove {
  callbackId: string;
  from: CallbackList | null;
  to: CallbackList;
}

/** Compare two derivations and report which items changed list. */
export function diffLists(prev: Callback[], next: Callback[]): ListMove[] {
  const before = new Map(prev.map((c) => [c.id, c.list]));
  const moves: ListMove[] = [];
  for (const cb of next) {
    const from = before.get(cb.id) ?? null;
    if (from !== cb.list) moves.push({ callbackId: cb.id, from, to: cb.list });
  }
  return moves;
}

export const LIST_LABELS: Record<CallbackList, string> = {
  needs_callback: "Needs callback",
  attempted: "Attempted",
  called_back: "Called back",
  booked: "Booked",
  closed: "Closed",
};
