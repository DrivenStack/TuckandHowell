/**
 * Calls that need a call back, and how well we followed up:
 *  - "abandoned": callers who hung up while waiting in the queue
 *  - "ai_agent": callers the AI Voice Agent (Broccoli) answered who did not book
 * Pure functions over the Dataset, so real ServiceTitan data can drop in later.
 */
import { clockStart, normalizePhone } from "@/lib/callbacks/engine";
import { DAY, HOUR, MINUTE, nyAddDays, nyParts, nyStartOfDay } from "@/lib/time";
import type { Dataset, InboundCall } from "@/lib/types";

/** A return only counts if it happens within this window after the hang-up. */
export const RETURN_WINDOW_MS = 3 * DAY;

export interface AbandonedCall {
  call: InboundCall;
  /** First outbound call to any of the customer's numbers, or the customer reaching a CSR, after the hang-up */
  returnedAt: number | null;
  /** Wait from hang-up to return, counted from when the call center is open (7 am to 7 pm) */
  returnMs: number | null;
  /** A job was booked for this customer after the hang-up */
  booked: boolean;
}

/** Index of later contacts and bookings per customer, built once per dataset. */
export interface ContactIndex {
  returnsByCustomer: Map<string, number[]>;
  bookingsByCustomer: Map<string, number[]>;
}

export function buildContactIndex(data: Dataset): ContactIndex {
  const phoneToCustomer = new Map<string, string>();
  for (const c of data.customers) for (const p of c.phones) phoneToCustomer.set(normalizePhone(p), c.id);
  const returnsByCustomer = new Map<string, number[]>();
  const push = (m: Map<string, number[]>, k: string, t: number) => {
    const arr = m.get(k);
    if (arr) arr.push(t);
    else m.set(k, [t]);
  };
  for (const c of data.calls) {
    const customerId = phoneToCustomer.get(normalizePhone(c.phone)) ?? c.customerId;
    // We called them (any outcome counts as calling back), or they called in and a CSR answered
    if (c.direction === "outbound" || c.outcome === "csr_answered") push(returnsByCustomer, customerId, c.startedAt);
  }
  const bookingsByCustomer = new Map<string, number[]>();
  for (const j of data.jobs) if (j.status !== "Canceled") push(bookingsByCustomer, j.customerId, j.bookedAt);
  for (const arr of returnsByCustomer.values()) arr.sort((a, b) => a - b);
  for (const arr of bookingsByCustomer.values()) arr.sort((a, b) => a - b);
  return { returnsByCustomer, bookingsByCustomer };
}

function firstAfter(times: number[] | undefined, after: number, within: number): number | null {
  if (!times) return null;
  for (const t of times) if (t > after && t - after <= within) return t;
  return null;
}

export type FollowUpKind = "abandoned" | "ai_agent";

/** Does this call need a call back? Booked AI calls do not. */
export function needsFollowUp(c: InboundCall, kind: FollowUpKind): boolean {
  return kind === "abandoned" ? c.outcome === "abandoned" : c.outcome === "ai_agent" && !c.booked;
}

export function followUpCalls(data: Dataset, index: ContactIndex, from: number, to: number, kind: FollowUpKind): AbandonedCall[] {
  const out: AbandonedCall[] = [];
  for (const c of data.calls) {
    if (c.direction !== "inbound" || !needsFollowUp(c, kind)) continue;
    if (c.startedAt < from || c.startedAt > to) continue;
    const returnedAt = firstAfter(index.returnsByCustomer.get(c.customerId), c.startedAt, RETURN_WINDOW_MS);
    const booked = firstAfter(index.bookingsByCustomer.get(c.customerId), c.startedAt, RETURN_WINDOW_MS) !== null;
    out.push({
      call: c,
      returnedAt,
      returnMs: returnedAt === null ? null : Math.max(0, returnedAt - clockStart(c.startedAt)),
      booked: returnedAt !== null && booked,
    });
  }
  return out;
}

export function abandonedCalls(data: Dataset, index: ContactIndex, from: number, to: number): AbandonedCall[] {
  return followUpCalls(data, index, from, to, "abandoned");
}

/** AI Voice Agent calls in a range that booked on the call (no call back needed). */
export function aiBookedCount(data: Dataset, from: number, to: number): number {
  let n = 0;
  for (const c of data.calls) {
    if (c.direction === "inbound" && c.outcome === "ai_agent" && c.booked && c.startedAt >= from && c.startedAt <= to) n++;
  }
  return n;
}

export interface AbandonedSummary {
  total: number;
  calledBack: number;
  stillOpen: number;
  calledBackRate: number;
}

export function summarize(items: AbandonedCall[]): AbandonedSummary {
  const calledBack = items.filter((i) => i.returnedAt !== null).length;
  return {
    total: items.length,
    calledBack,
    stillOpen: items.length - calledBack,
    calledBackRate: items.length ? calledBack / items.length : 0,
  };
}

/* ---------------- Time bins for the little line graphs ---------------- */

export interface Bins {
  starts: number[];
  labels: string[];
  unit: "hour" | "day";
}

/** Hourly bins for a range of up to 2 days, daily bins otherwise. */
export function timeBins(from: number, to: number): Bins {
  const starts: number[] = [];
  const labels: string[] = [];
  if (to - from <= 2 * DAY) {
    for (let t = Math.floor(from / HOUR) * HOUR; t <= to; t += HOUR) {
      starts.push(t);
      const h = nyParts(t).hour;
      labels.push(h === 0 ? "12 am" : h < 12 ? `${h} am` : h === 12 ? "12 pm" : `${h - 12} pm`);
    }
    return { starts, labels, unit: "hour" };
  }
  for (let d = nyStartOfDay(from), guard = 0; d <= to && guard < 400; d = nyAddDays(d, 1), guard++) {
    starts.push(d);
    const p = nyParts(d + HOUR);
    labels.push(`${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][p.month - 1]} ${p.day}`);
  }
  return { starts, labels, unit: "day" };
}

export function binCounts(bins: Bins, times: number[]): number[] {
  const counts = new Array(bins.starts.length).fill(0) as number[];
  for (const t of times) {
    let lo = 0;
    let hi = bins.starts.length - 1;
    if (t < bins.starts[0]) continue;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (bins.starts[mid] <= t) lo = mid;
      else hi = mid - 1;
    }
    counts[lo]++;
  }
  return counts;
}

/* ---------------- How fast are we calling back? ---------------- */

export interface Bucket {
  id: string;
  label: string;
  /** 1 (best) to 5 (worst), drives the green-to-red color */
  level: 1 | 2 | 3 | 4 | 5;
  test: (v: number) => boolean;
}

export const SPEED_BUCKETS: Bucket[] = [
  { id: "5m", label: "Within 5 minutes", level: 1, test: (ms) => ms <= 5 * MINUTE },
  { id: "15m", label: "Within 15 minutes", level: 2, test: (ms) => ms > 5 * MINUTE && ms <= 15 * MINUTE },
  { id: "1h", label: "Within 1 hour", level: 3, test: (ms) => ms > 15 * MINUTE && ms <= HOUR },
  { id: "4h", label: "Within 4 hours", level: 4, test: (ms) => ms > HOUR && ms <= 4 * HOUR },
  { id: "slow", label: "Slower than 4 hours", level: 5, test: (ms) => ms > 4 * HOUR },
];

export interface SpeedRow {
  bucket: Bucket;
  count: number;
  shareOfReturned: number;
  booked: number;
  bookRate: number;
  series: number[];
}

export function speedTable(items: AbandonedCall[], bins: Bins): { rows: SpeedRow[]; total: SpeedRow } {
  const returned = items.filter((i) => i.returnMs !== null);
  const rows = SPEED_BUCKETS.map((bucket) => {
    const mine = returned.filter((i) => bucket.test(i.returnMs!));
    const booked = mine.filter((i) => i.booked).length;
    return {
      bucket,
      count: mine.length,
      shareOfReturned: returned.length ? mine.length / returned.length : 0,
      booked,
      bookRate: mine.length ? booked / mine.length : 0,
      series: binCounts(bins, mine.map((i) => i.call.startedAt)),
    };
  });
  const booked = returned.filter((i) => i.booked).length;
  return {
    rows,
    total: {
      bucket: { id: "total", label: "All called back", level: 1, test: () => true },
      count: returned.length,
      shareOfReturned: returned.length ? 1 : 0,
      booked,
      bookRate: returned.length ? booked / returned.length : 0,
      series: binCounts(bins, returned.map((i) => i.call.startedAt)),
    },
  };
}

/* ---------------- Call length ---------------- */

/** Rule of thumb: abandoned calls should all be 10 seconds or less. */
export const HANG_UP_TARGET_SEC = 10;

export const LENGTH_BUCKETS: Bucket[] = [
  { id: "10s", label: "10 seconds or less", level: 1, test: (s) => s <= 10 },
  { id: "30s", label: "11 to 30 seconds", level: 2, test: (s) => s > 10 && s <= 30 },
  { id: "60s", label: "31 to 60 seconds", level: 3, test: (s) => s > 30 && s <= 60 },
  { id: "2m", label: "1 to 2 minutes", level: 4, test: (s) => s > 60 && s <= 120 },
  { id: "long", label: "Over 2 minutes", level: 5, test: (s) => s > 120 },
];

export interface LengthRow {
  bucket: Bucket;
  count: number;
  shareOfAbandoned: number;
  series: number[];
}

/** How long callers talked with the AI Voice Agent. No good or bad direction, so no target. */
export const AI_LENGTH_BUCKETS: Bucket[] = [
  { id: "30s", label: "Under 30 seconds", level: 1, test: (s) => s < 30 },
  { id: "60s", label: "30 to 60 seconds", level: 2, test: (s) => s >= 30 && s < 60 },
  { id: "2m", label: "1 to 2 minutes", level: 3, test: (s) => s >= 60 && s < 120 },
  { id: "4m", label: "2 to 4 minutes", level: 4, test: (s) => s >= 120 && s < 240 },
  { id: "long", label: "Over 4 minutes", level: 5, test: (s) => s >= 240 },
];

export function lengthTable(items: AbandonedCall[], bins: Bins, buckets: Bucket[] = LENGTH_BUCKETS): LengthRow[] {
  return buckets.map((bucket) => {
    const mine = items.filter((i) => bucket.test(i.call.durationSec));
    return {
      bucket,
      count: mine.length,
      shareOfAbandoned: items.length ? mine.length / items.length : 0,
      series: binCounts(bins, mine.map((i) => i.call.startedAt)),
    };
  });
}
