/**
 * Callback log: every call that needed a call back, from every source, one row per call.
 * Pure functions over the Dataset.
 */
import { normalizePhone } from "@/lib/callbacks/engine";
import type { Dataset, InboundCall } from "@/lib/types";
import { RETURN_WINDOW_MS } from "./abandoned";

export type CallbackType = "Abandoned" | "Broccoli" | "Missed";
export const CALLBACK_TYPES: CallbackType[] = ["Abandoned", "Broccoli", "Missed"];

/** Minimum talk time for an outbound call to count as reaching the customer */
export const REACHED_MIN_SECONDS = 20;
/** After this many tries without reaching the customer, we stop calling */
export const MAX_ATTEMPTS = 3;

export type ActionNeeded = "Call back" | "Try again" | "No more attempts" | "None";

export interface CallbackRow {
  id: string;
  callId: string;
  at: number;
  type: CallbackType;
  phone: string;
  customerId: string;
  customerName: string;
  /** Number of different CSRs who called or spoke with the customer about this call */
  reviewedBy: number;
  reviewerIds: string[];
  lengthSec: number;
  attempts: number;
  reachedCsr: boolean;
  reachedAt: number | null;
  booked: boolean;
  action: ActionNeeded;
  /** Done by the data (reached, booked, or out of attempts), before any manual change */
  doneByData: boolean;
}

export function typeOf(c: InboundCall): CallbackType | null {
  if (c.outcome === "abandoned") return "Abandoned";
  if (c.outcome === "ai_agent" && !c.booked) return "Broccoli";
  if (c.outcome === "missed") return "Missed";
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
  return { touches, bookings, names: new Map(data.customers.map((c) => [c.id, c.name])) };
}

export function callbackLog(data: Dataset, index: LogIndex, from: number, to: number): CallbackRow[] {
  const rows: CallbackRow[] = [];
  for (const c of data.calls) {
    if (c.direction !== "inbound" || c.startedAt < from || c.startedAt > to) continue;
    const type = typeOf(c);
    if (!type) continue;

    let attempts = 0;
    let reachedAt: number | null = null;
    const reviewers = new Set<string>();
    for (const t of index.touches.get(c.customerId) ?? []) {
      if (t.at <= c.startedAt) continue;
      if (t.at - c.startedAt > RETURN_WINDOW_MS) break;
      if (t.outbound) attempts++;
      if (t.csrId) reviewers.add(t.csrId);
      if (t.reached) {
        reachedAt = t.at;
        break;
      }
    }
    const booked = (index.bookings.get(c.customerId) ?? []).some((b) => b > c.startedAt && b - c.startedAt <= RETURN_WINDOW_MS);
    const reached = reachedAt !== null;
    const action: ActionNeeded = reached || booked ? "None" : attempts === 0 ? "Call back" : attempts >= MAX_ATTEMPTS ? "No more attempts" : "Try again";
    rows.push({
      id: `log_${c.id}`,
      callId: c.id,
      at: c.startedAt,
      type,
      phone: c.phone,
      customerId: c.customerId,
      customerName: index.names.get(c.customerId) ?? "Unknown caller",
      reviewedBy: reviewers.size,
      reviewerIds: [...reviewers],
      lengthSec: c.durationSec,
      attempts,
      reachedCsr: reached,
      reachedAt,
      booked,
      action,
      doneByData: action === "None" || action === "No more attempts",
    });
  }
  return rows.sort((a, b) => b.at - a.at);
}
