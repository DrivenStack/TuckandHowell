/**
 * Callback log: every call back the call center owes, from every platform, one row each.
 * Pure functions over the Dataset.
 */
import { clockStart, normalizePhone } from "@/lib/callbacks/engine";
import type { Dataset, InboundCall, JobType } from "@/lib/types";
import { RETURN_WINDOW_MS } from "./abandoned";

export type CallbackType = "Abandoned" | "Missed" | "Broccoli" | "Web form" | "Lace flag";
export const CALLBACK_TYPES: CallbackType[] = ["Abandoned", "Missed", "Broccoli", "Web form", "Lace flag"];

export type Platform = "Broccoli" | "Dialpad" | "ServiceTitan" | "Lace";
/** Fixed order so each platform always keeps its color */
export const PLATFORMS: Platform[] = ["Broccoli", "Dialpad", "ServiceTitan", "Lace"];

/**
 * Which platform a call back comes from. One place to change if the call center sees it differently.
 *  - Dialpad: the phone system (caller hung up in the queue, or the call rang a CSR and nobody answered)
 *  - Broccoli: the AI Voice Agent took the call and the caller did not book
 *  - ServiceTitan: a web form request that needs a call
 *  - Lace: Lace AI flagged an answered call that did not book for a follow-up
 */
export const PLATFORM_OF: Record<CallbackType, Platform> = {
  Abandoned: "Dialpad",
  Missed: "Dialpad",
  Broccoli: "Broccoli",
  "Web form": "ServiceTitan",
  "Lace flag": "Lace",
};

export const PLATFORM_INFO: Record<Platform, string> = {
  Broccoli: "AI Voice Agent calls where the caller did not book.",
  Dialpad: "Phone calls nobody answered: callers who hung up on hold, and calls that rang a CSR with no pick-up.",
  ServiceTitan: "Web form requests that need someone to call the customer.",
  Lace: "Calls a CSR answered that did not book, flagged by Lace AI for a follow-up.",
};

/** Minimum talk time for an outbound call to count as reaching the customer */
export const REACHED_MIN_SECONDS = 20;

/** Open until someone calls the customer back; any call back (or the customer reaching a CSR) makes it done. */
export type ActionNeeded = "Call back" | "None";

export interface CallbackRow {
  id: string;
  /** The call or web form this call back is for */
  callId: string;
  at: number;
  type: CallbackType;
  platform: Platform;
  phone: string;
  customerId: string;
  customerName: string;
  jobType: JobType;
  /** The CSR whose line rang and did not pick up, or who took the call Lace flagged. Null when nobody did. */
  assignedCsrId: string | null;
  /** Lace AI's reason, for Lace flags */
  note: string | null;
  /** Length of the original call; null for web forms */
  lengthSec: number | null;
  attempts: number;
  reachedCsr: boolean;
  reachedAt: number | null;
  /** First call back (or the customer reaching a CSR), and who made it */
  calledBackAt: number | null;
  calledBackBy: string | null;
  /** Wait from the request to the first call back, counted from 7 am for overnight requests */
  returnMs: number | null;
  booked: boolean;
  action: ActionNeeded;
  /** Done by the data (called back, reached, or booked), before any manual change */
  doneByData: boolean;
}

export function typeOf(c: InboundCall): CallbackType | null {
  if (c.outcome === "abandoned") return "Abandoned";
  if (c.outcome === "ai_agent" && !c.booked) return "Broccoli";
  if (c.outcome === "missed") return "Missed";
  if (c.outcome === "csr_answered" && c.laceFlag) return "Lace flag";
  return null;
}

interface Touch {
  at: number;
  csrId: string | null;
  reached: boolean;
  outbound: boolean;
}

export interface LogIndex {
  touches: Map<string, Touch[]>;
  bookings: Map<string, number[]>;
  names: Map<string, string>;
  phones: Map<string, string>;
}

export function buildLogIndex(data: Dataset): LogIndex {
  const phoneToCustomer = new Map<string, string>();
  for (const c of data.customers) for (const p of c.phones) phoneToCustomer.set(normalizePhone(p), c.id);
  const touches = new Map<string, Touch[]>();
  const add = (k: string, t: Touch) => {
    const arr = touches.get(k);
    if (arr) arr.push(t);
    else touches.set(k, [t]);
  };
  for (const c of data.calls) {
    const customerId = phoneToCustomer.get(normalizePhone(c.phone)) ?? c.customerId;
    if (c.direction === "outbound") {
      add(customerId, { at: c.startedAt, csrId: c.csrId, outbound: true, reached: c.outcome === "answered" && c.durationSec >= REACHED_MIN_SECONDS });
    } else if (c.outcome === "csr_answered") {
      // The customer called again and a CSR answered: that is reaching a CSR too
      add(customerId, { at: c.startedAt, csrId: c.csrId, outbound: false, reached: true });
    }
  }
  for (const arr of touches.values()) arr.sort((a, b) => a.at - b.at);
  const bookings = new Map<string, number[]>();
  for (const j of data.jobs) {
    if (j.status === "Canceled") continue;
    const arr = bookings.get(j.customerId) ?? [];
    arr.push(j.bookedAt);
    bookings.set(j.customerId, arr);
  }
  return {
    touches,
    bookings,
    names: new Map(data.customers.map((c) => [c.id, c.name])),
    phones: new Map(data.customers.map((c) => [c.id, c.phones[0]])),
  };
}

interface Request {
  id: string;
  at: number;
  type: CallbackType;
  customerId: string;
  phone: string;
  jobType: JobType;
  assignedCsrId: string | null;
  note: string | null;
  lengthSec: number | null;
}

function followUp(index: LogIndex, q: Request): CallbackRow {
  let attempts = 0;
  let reachedAt: number | null = null;
  let calledBackAt: number | null = null;
  let calledBackBy: string | null = null;
  for (const t of index.touches.get(q.customerId) ?? []) {
    // The flagged call itself is the CSR's own answered call; only later contact counts
    if (t.at <= q.at) continue;
    if (t.at - q.at > RETURN_WINDOW_MS) break;
    if (t.outbound) attempts++;
    if (calledBackAt === null) {
      calledBackAt = t.at;
      calledBackBy = t.csrId;
    }
    if (t.reached) {
      reachedAt = t.at;
      break;
    }
  }
  const booked = (index.bookings.get(q.customerId) ?? []).some((b) => b > q.at && b - q.at <= RETURN_WINDOW_MS);
  const reached = reachedAt !== null;
  const done = calledBackAt !== null || reached || booked;
  return {
    id: `log_${q.id}`,
    callId: q.id,
    at: q.at,
    type: q.type,
    platform: PLATFORM_OF[q.type],
    phone: q.phone,
    customerId: q.customerId,
    customerName: index.names.get(q.customerId) ?? "Unknown caller",
    jobType: q.jobType,
    assignedCsrId: q.assignedCsrId,
    note: q.note,
    lengthSec: q.lengthSec,
    attempts,
    reachedCsr: reached,
    reachedAt,
    calledBackAt,
    calledBackBy,
    returnMs: calledBackAt === null ? null : Math.max(0, calledBackAt - clockStart(q.at)),
    booked,
    action: done ? "None" : "Call back",
    doneByData: done,
  };
}

export function callbackLog(data: Dataset, index: LogIndex, from: number, to: number): CallbackRow[] {
  const rows: CallbackRow[] = [];
  for (const c of data.calls) {
    if (c.direction !== "inbound" || c.startedAt < from || c.startedAt > to) continue;
    const type = typeOf(c);
    if (!type) continue;
    rows.push(
      followUp(index, {
        id: c.id,
        // A Lace flag is raised once the call ends
        at: type === "Lace flag" ? c.startedAt + c.durationSec * 1000 : c.startedAt,
        type,
        customerId: c.customerId,
        phone: c.phone,
        jobType: c.jobType,
        assignedCsrId: c.csrId,
        note: c.laceFlag ?? null,
        lengthSec: c.durationSec,
      }),
    );
  }
  for (const l of data.inboundLeads) {
    if (l.channel !== "Web Form" || l.receivedAt < from || l.receivedAt > to) continue;
    rows.push(
      followUp(index, {
        id: l.id,
        at: l.receivedAt,
        type: "Web form",
        customerId: l.customerId,
        phone: index.phones.get(l.customerId) ?? "",
        jobType: l.jobType,
        assignedCsrId: null,
        note: l.message,
        lengthSec: null,
      }),
    );
  }
  return rows.sort((a, b) => b.at - a.at);
}
