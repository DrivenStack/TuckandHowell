/**
 * Call backs from real ServiceTitan calls. Pure functions, safe on server and client.
 *
 * A call back is owed for every inbound call nobody answered:
 *  - Abandoned: ServiceTitan call type "Abandoned" (the caller hung up before anyone answered).
 *    Calls typed Abandoned that have an agent on them are left out, matching the team's report.
 *  - Missed: any other inbound call with no agent on it
 * Calls ServiceTitan types "Not a lead" are left out completely.
 * It is done once someone calls that number back (any outbound call within 3 days), or the
 * customer calls us again and a CSR answers (any time later: the customer got through).
 */
import { clockStart, DAY, HOUR, MINUTE, nyAddDays, nyParts, nyStartOfDay } from "@/lib/time";

/** The parts of a ServiceTitan call this app uses (no recordings, no internal ids) */
export interface LiveCall {
  id: number;
  at: number;
  direction: "inbound" | "outbound";
  callType: string | null;
  durationSec: number;
  from: string;
  to: string;
  /** Agent on the call; null when nobody answered */
  agentName: string | null;
  customerName: string | null;
  voicemail: boolean;
  active: boolean;
}

export type CallbackType = "Abandoned" | "Missed";
export const CALLBACK_TYPES: CallbackType[] = ["Abandoned", "Missed"];

/** Our outbound call back only counts within this window after the missed call.
 *  The customer calling again and a CSR answering counts at any time. */
export const RETURN_WINDOW_MS = 3 * DAY;
/** An outbound call this long or longer counts as reaching the customer */
export const REACHED_MIN_SECONDS = 20;

export type ActionNeeded = "Call back" | "None";

export interface CallbackRow {
  id: string;
  callId: number;
  at: number;
  type: CallbackType;
  phone: string;
  customerName: string;
  lengthSec: number;
  voicemail: boolean;
  attempts: number;
  reachedCsr: boolean;
  /** When it was sorted: our first call back, or the customer's answered call to us */
  calledBackAt: number | null;
  /** The CSR on that call */
  calledBackBy: string | null;
  /** Who closed it: we called them ("us"), or they called us and a CSR answered ("customer") */
  doneBy: "us" | "customer" | null;
  /** Wait from the missed call to OUR first call back, counted from 7 am for overnight calls.
   *  Null when we never called (still open, or the customer called us instead). */
  returnMs: number | null;
  booked: boolean;
  action: ActionNeeded;
  /** Done by the data (called back, reached, or booked), before any manual tick */
  doneByData: boolean;
}

export const phoneKey = (p: string) => p.replace(/\D/g, "").slice(-10);

export function formatPhone(p: string): string {
  const d = phoneKey(p);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p || "Unknown number";
}

/** "Small, Lexa" -> "Lexa", "Kielah Bersano" -> "Kielah" */
export function firstName(name: string): string {
  const n = name.trim();
  if (n.includes(",")) return n.split(",")[1].trim().split(/\s+/)[0] || n;
  return n.split(/\s+/)[0];
}

/** ServiceTitan's call type for calls that are not leads (spam, vendors, wrong numbers...) */
export const NOT_A_LEAD = "NotLead";

export function typeOf(c: LiveCall): CallbackType | null {
  if (c.direction !== "inbound") return null;
  // ServiceTitan already decided these are not leads (and hides them), so no call back is owed
  if (c.callType === NOT_A_LEAD) return null;
  // Typed Abandoned but a CSR is on it: the team's report does not count these
  if (c.callType === "Abandoned") return c.agentName ? null : "Abandoned";
  if (!c.agentName) return "Missed";
  return null;
}

interface Touch {
  at: number;
  outbound: boolean;
  reached: boolean;
  by: string | null;
  booked: boolean;
}

export function buildCallbackRows(calls: LiveCall[], from: number, to: number): CallbackRow[] {
  // Every later contact with a phone number: our outbound calls, and answered inbound calls
  const touches = new Map<string, Touch[]>();
  const add = (k: string, t: Touch) => {
    if (!k) return;
    const arr = touches.get(k);
    if (arr) arr.push(t);
    else touches.set(k, [t]);
  };
  for (const c of calls) {
    if (c.direction === "outbound") {
      add(phoneKey(c.to), { at: c.at, outbound: true, reached: c.durationSec >= REACHED_MIN_SECONDS, by: c.agentName, booked: c.callType === "Booked" });
    } else if (c.agentName && c.callType !== "Abandoned") {
      add(phoneKey(c.from), { at: c.at, outbound: false, reached: true, by: c.agentName, booked: c.callType === "Booked" });
    }
  }
  for (const arr of touches.values()) arr.sort((a, b) => a.at - b.at);

  const rows: CallbackRow[] = [];
  for (const c of calls) {
    if (c.at < from || c.at > to) continue;
    const type = typeOf(c);
    if (!type) continue;
    let attempts = 0;
    let reached = false;
    let booked = false;
    let calledBackAt: number | null = null;
    let calledBackBy: string | null = null;
    let doneBy: CallbackRow["doneBy"] = null;
    for (const t of touches.get(phoneKey(c.from)) ?? []) {
      if (t.at <= c.at) continue;
      // Our calls only count within the window; the customer reaching us counts any time
      if (t.outbound && t.at - c.at > RETURN_WINDOW_MS) continue;
      if (t.outbound) attempts++;
      if (calledBackAt === null) {
        calledBackAt = t.at;
        calledBackBy = t.by;
        doneBy = t.outbound ? "us" : "customer";
      }
      if (t.booked) booked = true;
      if (t.reached) {
        reached = true;
        break;
      }
    }
    const done = calledBackAt !== null;
    rows.push({
      id: `cb_${c.id}`,
      callId: c.id,
      at: c.at,
      type,
      phone: formatPhone(c.from),
      customerName: c.customerName || "Unknown caller",
      lengthSec: c.durationSec,
      voicemail: c.voicemail,
      attempts,
      reachedCsr: reached,
      calledBackAt,
      calledBackBy,
      doneBy,
      returnMs: doneBy === "us" && calledBackAt !== null ? Math.max(0, calledBackAt - clockStart(c.at)) : null,
      booked,
      action: done ? "None" : "Call back",
      doneByData: done,
    });
  }
  return rows.sort((a, b) => b.at - a.at);
}

export interface CallbackSummary {
  total: number;
  calledBack: number;
  stillOpen: number;
  rate: number;
}

export function summarize(rows: CallbackRow[]): CallbackSummary {
  const calledBack = rows.filter((r) => r.doneByData).length;
  return { total: rows.length, calledBack, stillOpen: rows.length - calledBack, rate: rows.length ? calledBack / rows.length : 0 };
}

/* ---------------- How fast we called back ---------------- */

export interface SpeedBucket {
  id: string;
  label: string;
  /** 1 (best) to 5 (worst), drives the green-to-red color */
  level: 1 | 2 | 3 | 4 | 5;
  test: (ms: number) => boolean;
}

export const SPEED_BUCKETS: SpeedBucket[] = [
  { id: "5m", label: "Within 5 minutes", level: 1, test: (ms) => ms <= 5 * MINUTE },
  { id: "15m", label: "Within 15 minutes", level: 2, test: (ms) => ms > 5 * MINUTE && ms <= 15 * MINUTE },
  { id: "1h", label: "Within 1 hour", level: 3, test: (ms) => ms > 15 * MINUTE && ms <= HOUR },
  { id: "4h", label: "Within 4 hours", level: 4, test: (ms) => ms > HOUR && ms <= 4 * HOUR },
  { id: "slow", label: "Slower than 4 hours", level: 5, test: (ms) => ms > 4 * HOUR },
];

/* ---------------- Time bins for line graphs ---------------- */

export interface Bins {
  starts: number[];
  labels: string[];
  unit: "hour" | "day";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
    labels.push(`${MONTHS[p.month - 1]} ${p.day}`);
  }
  return { starts, labels, unit: "day" };
}

export function binCounts(bins: Bins, times: number[]): number[] {
  const counts = new Array(bins.starts.length).fill(0) as number[];
  for (const t of times) {
    if (!bins.starts.length || t < bins.starts[0]) continue;
    let lo = 0;
    let hi = bins.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (bins.starts[mid] <= t) lo = mid;
      else hi = mid - 1;
    }
    counts[lo]++;
  }
  return counts;
}
