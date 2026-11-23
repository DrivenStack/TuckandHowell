/**
 * Live demo simulator. Each tick produces one realistic event: a new missed call,
 * an AI Voice Agent call with no booking, a CSR calling someone back, a customer
 * calling in again, or a booking. The engine then moves items between lists.
 *
 * Pure: takes state + a random source, returns new raw events. The runner decides when to tick.
 */
import { AI_ISSUES, AI_NO_BOOK_REASONS, CAMPAIGNS, JOB_TYPE_WEIGHTS } from "@/lib/data/mock/fixtures";
import { aiCallSeconds, hangUpSeconds, jobAmount } from "@/lib/data/mock/generate";
import { Rng } from "@/lib/data/mock/rng";
import { HOUR, nyAddDays, nyStartOfDay } from "@/lib/time";
import type { Call, Callback, CallbackAction, Csr, Customer, InboundCall, Job, OutboundCall, TextMessage } from "@/lib/types";
import { sortByPriority } from "./engine";

export interface SimState {
  customers: Customer[];
  csrs: Csr[];
  callbacks: Callback[];
  goLiveAt: number;
  now: number;
}

export interface SimEvent {
  kind: "missed" | "ai_no_booking" | "outbound" | "called_in" | "booking" | "claim";
  calls: Call[];
  jobs: Job[];
  texts: TextMessage[];
  actions: CallbackAction[];
}

export const SIM_MIN_DELAY_MS = 20_000;
export const SIM_MAX_DELAY_MS = 40_000;

let counter = 0;
const uid = (prefix: string, now: number) => `${prefix}_sim_${now.toString(36)}_${(counter++).toString(36)}`;

export function nextDelay(rng: Rng): number {
  return Math.round(rng.range(SIM_MIN_DELAY_MS, SIM_MAX_DELAY_MS));
}

function emptyEvent(kind: SimEvent["kind"]): SimEvent {
  return { kind, calls: [], jobs: [], texts: [], actions: [] };
}

export function simulateTick(state: SimState, rng: Rng): SimEvent {
  const { callbacks, now, goLiveAt } = state;
  const open = callbacks.filter((c) => c.firstMissedAt >= goLiveAt && (c.list === "needs_callback" || c.list === "attempted"));
  const needs = sortByPriority(open.filter((c) => c.list === "needs_callback"));
  const recentCalledBack = callbacks.filter((c) => c.list === "called_back" && c.resolvedAt !== null && now - c.resolvedAt < 3 * HOUR);

  // Keep the demo balanced: more new calls when the line is short, more callbacks when it is long.
  const pressure = Math.min(1, needs.length / 12);
  const kind = rng.weighted([
    ["missed", 26 * (1 - pressure) + 6],
    ["ai_no_booking", 16 * (1 - pressure) + 4],
    ["outbound", needs.length ? 22 + 30 * pressure : 0],
    ["called_in", open.length ? 9 : 0],
    ["booking", recentCalledBack.length || open.length ? 10 : 0],
    ["claim", needs.some((n) => !n.claim) ? 8 : 0],
  ] as const);

  switch (kind) {
    case "missed":
    case "ai_no_booking":
      return newIncoming(state, rng, kind);
    case "outbound":
      return outboundAttempt(state, rng, needs);
    case "called_in":
      return calledIn(state, rng, rng.pick(open));
    case "booking": {
      const target = recentCalledBack.length && rng.chance(0.7) ? rng.pick(recentCalledBack) : rng.pick(open.length ? open : recentCalledBack);
      return booking(state, rng, target);
    }
    case "claim": {
      const target = needs.find((n) => !n.claim);
      const e = emptyEvent("claim");
      if (target) e.actions.push({ id: uid("act", now), kind: "claim", callbackId: target.id, csrId: rng.pick(state.csrs).id, at: now });
      return e;
    }
  }
}

function newIncoming(state: SimState, rng: Rng, kind: "missed" | "ai_no_booking"): SimEvent {
  const { now } = state;
  // Sometimes the same customer calls again (grouping), otherwise a random customer
  const waiting = state.callbacks.filter((c) => c.list === "needs_callback" && c.firstMissedAt >= state.goLiveAt);
  const repeat = waiting.length && rng.chance(0.18) ? rng.pick(waiting) : null;
  const customer = repeat ? state.customers.find((c) => c.id === repeat.customerId) ?? rng.pick(state.customers) : rng.pick(state.customers);
  const jobType = repeat ? repeat.jobType : rng.weighted(JOB_TYPE_WEIGHTS);
  const ai = kind === "ai_no_booking";
  const reason = rng.pick(AI_NO_BOOK_REASONS);
  const abandoned = !ai && rng.chance(0.6);
  const call: InboundCall = {
    id: uid("call", now),
    direction: "inbound",
    customerId: customer.id,
    phone: customer.phones.length > 1 && rng.chance(0.3) ? customer.phones[1] : customer.phones[0],
    startedAt: now,
    durationSec: ai ? aiCallSeconds(rng, false) : abandoned ? hangUpSeconds(rng) : 0,
    jobType,
    outcome: ai ? "ai_agent" : abandoned ? "abandoned" : "missed",
    campaignId: rng.weighted(CAMPAIGNS.map((c) => [c.id, c.weight] as const)),
    csrId: !ai && !abandoned && rng.chance(0.4) ? rng.pick(state.csrs).id : null,
    booked: false,
    jobId: null,
    aiSummary: ai ? `${rng.pick(AI_ISSUES[jobType])} ${reason.text}` : null,
    hotLead: ai && reason.hot,
    source: "ServiceTitan",
  };
  const e = emptyEvent(kind);
  e.calls.push(call);
  return e;
}

function outboundAttempt(state: SimState, rng: Rng, needs: Callback[]): SimEvent {
  const { now } = state;
  // CSRs work from the top of the list; claimed items are called by their claimer
  const target = rng.chance(0.75) ? needs[0] : rng.pick(needs);
  const customer = state.customers.find((c) => c.id === target.customerId);
  const e = emptyEvent("outbound");
  if (!customer) return e;
  const csrId = target.claim?.csrId ?? rng.pick(state.csrs).id;
  const r = rng.float();
  const kind = r < 0.58 ? "real" : r < 0.66 ? "short" : r < 0.86 ? "no_answer" : "voicemail";
  const call: OutboundCall = {
    id: uid("out", now),
    direction: "outbound",
    customerId: customer.id,
    phone: customer.phones.length > 1 && rng.chance(0.4) ? customer.phones[1] : customer.phones[0],
    startedAt: now,
    durationSec: kind === "real" ? rng.int(60, 300) : kind === "short" ? rng.int(5, 16) : kind === "voicemail" ? rng.int(25, 45) : 0,
    jobType: target.jobType,
    outcome: kind === "real" || kind === "short" ? "answered" : kind,
    csrId,
    source: "ServiceTitan",
  };
  e.calls.push(call);
  return e;
}

function calledIn(state: SimState, rng: Rng, target: Callback): SimEvent {
  const { now } = state;
  const customer = state.customers.find((c) => c.id === target.customerId);
  const e = emptyEvent("called_in");
  if (!customer) return e;
  const csr = rng.pick(state.csrs);
  e.calls.push({
    id: uid("call", now),
    direction: "inbound",
    customerId: customer.id,
    phone: customer.phones[0],
    startedAt: now,
    durationSec: rng.int(120, 400),
    jobType: target.jobType,
    outcome: "csr_answered",
    campaignId: target.campaignId,
    csrId: csr.id,
    booked: false,
    jobId: null,
    aiSummary: null,
    hotLead: false,
    source: "ServiceTitan",
  });
  return e;
}

export function makeBookedJob(
  rng: Rng,
  target: Pick<Callback, "customerId" | "jobType" | "campaignId">,
  csrId: string,
  now: number,
): Job {
  const { amount, isReplacement } = jobAmount(rng, target.jobType);
  return {
    id: uid("job", now),
    customerId: target.customerId,
    jobType: target.jobType,
    bookedAt: now,
    scheduledFor: nyAddDays(nyStartOfDay(now), 1) + rng.int(8, 15) * HOUR,
    completedAt: null,
    paidAt: null,
    status: "Booked",
    bookedByCsrId: csrId,
    bookedBy: "csr",
    campaignId: target.campaignId,
    originCallId: null,
    amount,
    isReplacement,
  };
}

function booking(state: SimState, rng: Rng, target: Callback): SimEvent {
  const e = emptyEvent("booking");
  const csrId = target.resolvedByCsrId ?? target.claim?.csrId ?? rng.pick(state.csrs).id;
  if (target.list !== "called_back") {
    // Reached and booked on the same call
    const customer = state.customers.find((c) => c.id === target.customerId);
    if (customer) {
      e.calls.push({
        id: uid("out", state.now),
        direction: "outbound",
        customerId: customer.id,
        phone: customer.phones[0],
        startedAt: state.now - 4 * 60_000,
        durationSec: rng.int(180, 360),
        jobType: target.jobType,
        outcome: "answered",
        csrId,
        source: "ServiceTitan",
      });
    }
  }
  e.jobs.push(makeBookedJob(rng, target, csrId, state.now));
  return e;
}
