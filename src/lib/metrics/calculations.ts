/**
 * Pure metric calculations. Inputs: the Dataset, derived callbacks, a time range.
 * No React, no store. Every number on screen should come from a function here.
 */
import { isOpen, neverReturned, timeToCallback } from "@/lib/callbacks/engine";
import {
  DAY,
  HOUR,
  MINUTE,
  fmt,
  fmtDay,
  nyAddDays,
  nyParts,
  nyStartOfDay,
  nyStartOfMonth,
  nyStartOfWeek,
} from "@/lib/time";
import type {
  AvailabilityBlock,
  AvailabilityStatus,
  Call,
  Callback,
  Csr,
  Dataset,
  InboundCall,
  Job,
  JobType,
  Lead,
  LeadChannel,
  LeadStage,
  OutboundCall,
} from "@/lib/types";

/* ---------------- Ranges ---------------- */

export type RangePreset = "today" | "yesterday" | "7d" | "30d" | "month" | "custom";

export interface Range {
  from: number;
  to: number;
  label: string;
  preset: RangePreset;
  /** Comparison period, same length, earlier */
  compare: { from: number; to: number; label: string };
}

export const RANGE_LABELS: Record<RangePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  month: "This month",
  custom: "Custom",
};

export function rangeFromPreset(preset: RangePreset, now: number, custom?: { from: number; to: number }): Range {
  const today = nyStartOfDay(now);
  switch (preset) {
    case "today":
      return {
        preset,
        from: today,
        to: now,
        label: "Today",
        compare: { from: nyAddDays(today, -7), to: now - 7 * DAY, label: "vs same time last week" },
      };
    case "yesterday": {
      const y = nyAddDays(today, -1);
      return {
        preset,
        from: y,
        to: today - 1,
        label: "Yesterday",
        compare: { from: nyAddDays(y, -7), to: nyAddDays(today, -7) - 1, label: "vs same day the week before" },
      };
    }
    case "7d": {
      const from = nyAddDays(today, -6);
      return { preset, from, to: now, label: "Last 7 days", compare: { from: nyAddDays(from, -7), to: from - 1, label: "vs previous 7 days" } };
    }
    case "30d": {
      const from = nyAddDays(today, -29);
      return { preset, from, to: now, label: "Last 30 days", compare: { from: nyAddDays(from, -30), to: from - 1, label: "vs previous 30 days" } };
    }
    case "month": {
      const from = nyStartOfMonth(now);
      const len = now - from;
      return { preset, from, to: now, label: "This month", compare: { from: from - len - DAY, to: from - 1, label: "vs previous period" } };
    }
    case "custom": {
      const from = custom ? nyStartOfDay(custom.from) : nyAddDays(today, -6);
      const to = custom ? Math.min(now, nyAddDays(custom.to, 1) - 1) : now;
      const len = to - from;
      return {
        preset,
        from,
        to,
        label: `${fmtDay(from)} to ${fmtDay(to)}`,
        compare: { from: from - len - 1, to: from - 1, label: "vs previous period" },
      };
    }
  }
}

/* ---------------- Helpers ---------------- */

/** Binary search slice for arrays sorted by time */
export function sliceByTime<T>(items: T[], at: (x: T) => number, from: number, to: number): T[] {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (at(items[mid]) < from) lo = mid + 1;
    else hi = mid;
  }
  const start = lo;
  hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (at(items[mid]) <= to) lo = mid + 1;
    else hi = mid;
  }
  return items.slice(start, lo);
}

export const isInbound = (c: Call): c is InboundCall => c.direction === "inbound";
export const isOutbound = (c: Call): c is OutboundCall => c.direction === "outbound";

export function callsIn(data: Dataset, from: number, to: number): Call[] {
  return sliceByTime(data.calls, (c) => c.startedAt, from, to);
}

export const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);
export const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
export const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Change vs comparison. Null when there is nothing to compare. */
export function delta(current: number, previous: number): number | null {
  if (!previous) return current ? null : 0;
  return (current - previous) / previous;
}

/* ---------------- Call stats ---------------- */

export interface CallStats {
  callsIn: number;
  csrAnswered: number;
  ai: number;
  aiBooked: number;
  missed: number;
  abandoned: number;
  missedTotal: number;
  bookedOnCsrCalls: number;
  bookingRate: number;
  jobsBooked: number;
  revenue: number;
  outbound: number;
}

export function callStats(data: Dataset, from: number, to: number): CallStats {
  const calls = callsIn(data, from, to);
  let inbound = 0, csr = 0, ai = 0, aiBooked = 0, missed = 0, abandoned = 0, booked = 0, outbound = 0;
  for (const c of calls) {
    if (c.direction === "outbound") {
      outbound++;
      continue;
    }
    inbound++;
    if (c.outcome === "csr_answered") {
      csr++;
      if (c.booked) booked++;
    } else if (c.outcome === "ai_agent") {
      ai++;
      if (c.booked) aiBooked++;
    } else if (c.outcome === "missed") missed++;
    else abandoned++;
  }
  const jobs = jobsIn(data, from, to);
  return {
    callsIn: inbound,
    csrAnswered: csr,
    ai,
    aiBooked,
    missed,
    abandoned,
    missedTotal: missed + abandoned,
    bookedOnCsrCalls: booked,
    bookingRate: ratio(booked, csr),
    jobsBooked: jobs.length,
    revenue: jobs.reduce((s, j) => s + j.amount, 0),
    outbound,
  };
}

export function jobsIn(data: Dataset, from: number, to: number): Job[] {
  return sliceByTime(data.jobs, (j) => j.bookedAt, from, to).filter((j) => j.status !== "Canceled");
}

/* ---------------- Callbacks ---------------- */

export function callbacksIn(callbacks: Callback[], from: number, to: number): Callback[] {
  return callbacks.filter((c) => c.firstMissedAt >= from && c.firstMissedAt <= to);
}

/** Items tracked by the callback app (since go-live) */
export function trackedCallbacks(callbacks: Callback[], goLiveAt: number): Callback[] {
  return callbacks.filter((c) => c.firstMissedAt >= goLiveAt);
}

export function waitingNow(callbacks: Callback[], goLiveAt: number): Callback[] {
  return callbacks.filter((c) => c.list === "needs_callback" && c.firstMissedAt >= goLiveAt);
}

export interface CallbackStats {
  total: number;
  unreturned: number;
  unreturnedRate: number;
  avgMinutesToCallback: number | null;
  booked: number;
  spokeNoBooking: number;
  noAnswer: number;
  closedOther: number;
  open: number;
  callbackBookingRate: number;
}

export function callbackStats(items: Callback[]): CallbackStats {
  const ttc = items.map(timeToCallback).filter((v): v is number => v !== null);
  const booked = items.filter((c) => c.list === "booked").length;
  const spoke = items.filter((c) => c.list === "called_back").length;
  const noAnswer = items.filter((c) => c.list === "closed" && c.closeReason?.startsWith("No answer")).length;
  const closed = items.filter((c) => c.list === "closed").length;
  const unreturned = items.filter(neverReturned).length;
  return {
    total: items.length,
    unreturned,
    unreturnedRate: ratio(unreturned, items.length),
    avgMinutesToCallback: ttc.length ? median(ttc) / MINUTE : null,
    booked,
    spokeNoBooking: spoke,
    noAnswer,
    closedOther: closed - noAnswer,
    open: items.filter(isOpen).length,
    callbackBookingRate: ratio(booked, booked + spoke),
  };
}

/** Items nobody had reached yet at time t (waiting or attempted), since go-live. */
export function openAt(callbacks: Callback[], t: number, goLiveAt: number): Callback[] {
  return callbacks.filter(
    (c) => c.firstMissedAt >= goLiveAt && c.firstMissedAt <= t && (c.resolvedAt === null || c.resolvedAt > t) && (c.contactAt === null || c.contactAt > t),
  );
}

/* ---------------- Time series ---------------- */

export interface DayPoint {
  dayStart: number;
  key: string;
  label: string;
  callsIn: number;
  csr: number;
  ai: number;
  missed: number;
  bookedOnCsrCalls: number;
  bookingRate: number | null;
  jobsBooked: number;
  revenue: number;
  avgMinutesToCallback: number | null;
  callbacks: number;
  unreturned: number;
  bookedFromCallbacks: number;
  spokeNoBooking: number;
  noAnswer: number;
  closedOther: number;
}

export function dayStarts(from: number, to: number): number[] {
  const out: number[] = [];
  let d = nyStartOfDay(from);
  let guard = 0;
  while (d <= to && guard++ < 400) {
    out.push(d);
    d = nyAddDays(d, 1);
  }
  return out;
}

function indexer(starts: number[]) {
  return (t: number) => {
    let lo = 0;
    let hi = starts.length - 1;
    if (t < starts[0]) return -1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= t) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
}

export function dailySeries(data: Dataset, callbacks: Callback[], from: number, to: number): DayPoint[] {
  const starts = dayStarts(from, to);
  if (!starts.length) return [];
  const idx = indexer(starts);
  const points: DayPoint[] = starts.map((s) => ({
    dayStart: s,
    key: nyParts(s + HOUR).dayKey,
    label: fmtDay(s + HOUR),
    callsIn: 0,
    csr: 0,
    ai: 0,
    missed: 0,
    bookedOnCsrCalls: 0,
    bookingRate: null,
    jobsBooked: 0,
    revenue: 0,
    avgMinutesToCallback: null,
    callbacks: 0,
    unreturned: 0,
    bookedFromCallbacks: 0,
    spokeNoBooking: 0,
    noAnswer: 0,
    closedOther: 0,
  }));
  const end = to;
  for (const c of callsIn(data, starts[0], end)) {
    if (c.direction !== "inbound") continue;
    const p = points[idx(c.startedAt)];
    if (!p) continue;
    p.callsIn++;
    if (c.outcome === "csr_answered") {
      p.csr++;
      if (c.booked) p.bookedOnCsrCalls++;
    } else if (c.outcome === "ai_agent") p.ai++;
    else p.missed++;
  }
  for (const j of jobsIn(data, starts[0], end)) {
    const p = points[idx(j.bookedAt)];
    if (!p) continue;
    p.jobsBooked++;
    p.revenue += j.amount;
  }
  const ttc: number[][] = points.map(() => []);
  for (const cb of callbacks) {
    if (cb.firstMissedAt < starts[0] || cb.firstMissedAt > end) continue;
    const i = idx(cb.firstMissedAt);
    const p = points[i];
    if (!p) continue;
    p.callbacks++;
    if (neverReturned(cb)) p.unreturned++;
    if (cb.list === "booked") p.bookedFromCallbacks++;
    else if (cb.list === "called_back") p.spokeNoBooking++;
    else if (cb.list === "closed") {
      if (cb.closeReason?.startsWith("No answer")) p.noAnswer++;
      else p.closedOther++;
    }
    const t = timeToCallback(cb);
    if (t !== null) ttc[i].push(t / MINUTE);
  }
  points.forEach((p, i) => {
    p.bookingRate = p.csr ? p.bookedOnCsrCalls / p.csr : null;
    p.avgMinutesToCallback = ttc[i].length ? median(ttc[i]) : null;
  });
  return points;
}

export interface WeekPoint {
  weekStart: number;
  label: string;
  callbacks: number;
  unreturned: number;
  unreturnedRate: number;
  aiItems: number;
  aiNeverReturned: number;
  aiNeverReturnedRate: number | null;
}

export function weeklySeries(
  callbacks: Callback[],
  now: number,
  weeks: number,
  goLiveAt: number,
): WeekPoint[] {
  const thisWeek = nyStartOfWeek(now);
  const starts: number[] = [];
  for (let i = weeks - 1; i >= 0; i--) starts.push(nyAddDays(thisWeek, -7 * i));
  const idx = indexer(starts);
  const pts: WeekPoint[] = starts.map((s) => ({
    weekStart: s,
    label: fmtDay(s + HOUR),
    callbacks: 0,
    unreturned: 0,
    unreturnedRate: 0,
    aiItems: 0,
    aiNeverReturned: 0,
    aiNeverReturnedRate: null,
  }));
  for (const cb of callbacks) {
    const i = idx(cb.firstMissedAt);
    if (i < 0) continue;
    const p = pts[i];
    p.callbacks++;
    // Items still open since go-live are "waiting", not yet lost
    const lost = neverReturned(cb) && !(isOpen(cb) && cb.firstMissedAt >= goLiveAt);
    if (lost) p.unreturned++;
    if (cb.trigger === "ai_agent") {
      p.aiItems++;
      if (lost) p.aiNeverReturned++;
    }
  }
  for (const p of pts) {
    p.unreturnedRate = ratio(p.unreturned, p.callbacks);
    p.aiNeverReturnedRate = p.aiItems ? p.aiNeverReturned / p.aiItems : null;
  }
  return pts;
}

export interface HourPoint {
  hour: number;
  label: string;
  csr: number;
  ai: number;
  missed: number;
  total: number;
  afterHours: boolean;
}

export const hourLabel = (h: number) => (h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`);

export function hourly(data: Dataset, from: number, to: number): HourPoint[] {
  const pts: HourPoint[] = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    label: hourLabel(h),
    csr: 0,
    ai: 0,
    missed: 0,
    total: 0,
    afterHours: h < 7 || h >= 19,
  }));
  for (const c of callsIn(data, from, to)) {
    if (c.direction !== "inbound") continue;
    const p = pts[nyParts(c.startedAt).hour];
    p.total++;
    if (c.outcome === "csr_answered") p.csr++;
    else if (c.outcome === "ai_agent") p.ai++;
    else p.missed++;
  }
  return pts;
}

/* ---------------- Team ---------------- */

export interface CsrStats {
  csr: Csr;
  callsHandled: number;
  inboundAnswered: number;
  outbound: number;
  talkSeconds: number;
  booked: number;
  bookingRate: number;
  callbacksCompleted: number;
  avgMinutesToCallback: number | null;
  missedWhileAvailable: number;
  breakMinutes: number;
  awayMinutes: number;
  shiftMinutes: number;
}

export function csrStats(data: Dataset, callbacks: Callback[], from: number, to: number): CsrStats[] {
  const calls = callsIn(data, from, to);
  const blocks = availabilityIn(data, from, to);
  return data.csrs.map((csr) => {
    let inbound = 0, outbound = 0, talk = 0, booked = 0, missedAvail = 0;
    for (const c of calls) {
      if (c.csrId !== csr.id) continue;
      if (c.direction === "outbound") {
        outbound++;
        talk += c.durationSec;
      } else if (c.outcome === "csr_answered") {
        inbound++;
        talk += c.durationSec;
        if (c.booked) booked++;
      } else if (c.outcome === "missed") missedAvail++;
    }
    const mine = callbacks.filter(
      (cb) =>
        cb.resolvedByCsrId === csr.id &&
        (cb.list === "called_back" || cb.list === "booked") &&
        cb.resolvedAt !== null &&
        cb.resolvedAt >= from &&
        cb.resolvedAt <= to,
    );
    const ttc = mine.map(timeToCallback).filter((v): v is number => v !== null);
    let breakMs = 0, awayMs = 0, shiftMs = 0;
    for (const b of blocks) {
      if (b.csrId !== csr.id) continue;
      const len = Math.max(0, Math.min(b.end, to) - Math.max(b.start, from));
      if (b.status === "Break" || b.status === "Lunch") breakMs += len;
      if (b.status === "Away") awayMs += len;
      if (b.status !== "Offline") shiftMs += len;
    }
    return {
      csr,
      callsHandled: inbound + outbound,
      inboundAnswered: inbound,
      outbound,
      talkSeconds: talk,
      booked,
      bookingRate: ratio(booked, inbound),
      callbacksCompleted: mine.length,
      avgMinutesToCallback: ttc.length ? median(ttc) / MINUTE : null,
      missedWhileAvailable: missedAvail,
      breakMinutes: breakMs / MINUTE,
      awayMinutes: awayMs / MINUTE,
      shiftMinutes: shiftMs / MINUTE,
    };
  });
}

export function availabilityIn(data: Dataset, from: number, to: number): AvailabilityBlock[] {
  return data.availability.filter((b) => b.end > from && b.start < to);
}

export interface DayAvailability {
  csr: Csr;
  blocks: AvailabilityBlock[];
  totals: Record<AvailabilityStatus, number>;
}

/** One CSR's day as Dialpad shows it, with calls overlaid as On call, clipped to now. */
export function dayAvailability(data: Dataset, csr: Csr, dayStart: number, now: number): DayAvailability {
  const dayEnd = Math.min(nyAddDays(dayStart, 1), now);
  const base = data.availability
    .filter((b) => b.csrId === csr.id && b.end > dayStart && b.start < dayEnd)
    .map((b) => ({ ...b, start: Math.max(b.start, dayStart), end: Math.min(b.end, dayEnd) }));
  const callIntervals = callsIn(data, dayStart, dayEnd)
    .filter((c) => c.csrId === csr.id && c.durationSec > 0 && (c.direction === "outbound" || c.outcome === "csr_answered"))
    .map((c) => ({ start: c.startedAt, end: Math.min(dayEnd, c.startedAt + c.durationSec * 1000) }));
  const blocks: AvailabilityBlock[] = [];
  for (const b of base) {
    if (b.status !== "Available") {
      blocks.push(b);
      continue;
    }
    let cursor = b.start;
    for (const ci of callIntervals) {
      if (ci.end <= cursor || ci.start >= b.end) continue;
      const s = Math.max(ci.start, cursor);
      const e = Math.min(ci.end, b.end);
      if (s > cursor) blocks.push({ ...b, start: cursor, end: s, status: "Available" });
      blocks.push({ ...b, start: s, end: e, status: "On call" });
      cursor = e;
    }
    if (cursor < b.end) blocks.push({ ...b, start: cursor, end: b.end, status: "Available" });
  }
  const totals: Record<AvailabilityStatus, number> = { Available: 0, "On call": 0, Break: 0, Lunch: 0, Away: 0, Offline: 0 };
  for (const b of blocks) totals[b.status] += (b.end - b.start) / MINUTE;
  return { csr, blocks, totals };
}

/** CSRs currently Away during a peak hour */
export function awayDuringPeak(data: Dataset, now: number): { csr: Csr; since: number }[] {
  const h = nyParts(now).hour;
  const peak = (h >= 8 && h < 10) || (h >= 13 && h < 15);
  if (!peak) return [];
  const out: { csr: Csr; since: number }[] = [];
  for (const csr of data.csrs) {
    const b = data.availability.find((x) => x.csrId === csr.id && x.start <= now && x.end > now);
    if (b && b.status === "Away") out.push({ csr, since: b.start });
  }
  return out;
}

export function statusNow(data: Dataset, csrId: string, now: number): AvailabilityStatus {
  const b = data.availability.find((x) => x.csrId === csrId && x.start <= now && x.end > now);
  if (!b) return "Offline";
  if (b.status === "Available") {
    const onCall = callsIn(data, now - HOUR, now).some(
      (c) => c.csrId === csrId && c.startedAt + c.durationSec * 1000 > now && (c.direction === "outbound" || c.outcome === "csr_answered"),
    );
    if (onCall) return "On call";
  }
  return b.status;
}

/* ---------------- AI Voice Agent ---------------- */

export interface AiStats {
  calls: number;
  booked: number;
  callbackItems: number;
  stillWaiting: number;
  returned: number;
  neverReturned: number;
  neverReturnedRate: number;
  afterHours: number;
}

export function aiStats(data: Dataset, callbacks: Callback[], from: number, to: number): AiStats {
  const calls = callsIn(data, from, to).filter((c): c is InboundCall => c.direction === "inbound" && c.outcome === "ai_agent");
  const items = callbacksIn(callbacks, from, to).filter((c) => c.trigger === "ai_agent");
  const waiting = items.filter((c) => isOpen(c) && c.firstMissedAt >= data.goLiveAt && neverReturned(c));
  const never = items.filter((c) => neverReturned(c) && !(isOpen(c) && c.firstMissedAt >= data.goLiveAt));
  return {
    calls: calls.length,
    booked: calls.filter((c) => c.booked).length,
    callbackItems: items.length,
    stillWaiting: waiting.length,
    returned: items.filter((c) => !neverReturned(c)).length,
    neverReturned: never.length,
    neverReturnedRate: ratio(never.length, items.length - waiting.length),
    afterHours: calls.filter((c) => {
      const h = nyParts(c.startedAt).hour;
      return h < 7 || h >= 19;
    }).length,
  };
}

/* ---------------- Lead sources ---------------- */

export interface SourceRow {
  campaignId: string;
  name: string;
  calls: number;
  answered: number;
  bookedOnCalls: number;
  bookingRate: number;
  jobs: number;
  revenue: number;
  untracked: boolean;
}

export function sourceStats(data: Dataset, from: number, to: number): SourceRow[] {
  const rows = new Map<string, SourceRow>(
    data.campaigns.map((c) => [
      c.id,
      { campaignId: c.id, name: c.name, calls: 0, answered: 0, bookedOnCalls: 0, bookingRate: 0, jobs: 0, revenue: 0, untracked: c.isUntracked },
    ]),
  );
  for (const c of callsIn(data, from, to)) {
    if (c.direction !== "inbound") continue;
    const r = rows.get(c.campaignId);
    if (!r) continue;
    r.calls++;
    if (c.outcome === "csr_answered" || c.outcome === "ai_agent") {
      r.answered++;
      if (c.booked) r.bookedOnCalls++;
    }
  }
  for (const j of jobsIn(data, from, to)) {
    const r = rows.get(j.campaignId);
    if (!r) continue;
    r.jobs++;
    r.revenue += j.amount;
  }
  for (const r of rows.values()) r.bookingRate = ratio(r.bookedOnCalls, r.answered);
  return [...rows.values()].sort((a, b) => b.calls - a.calls);
}

/* ---------------- Leads ---------------- */

const ESTIMATE_BY_TYPE: Partial<Record<JobType, number>> = { "Estimate Request": 9500, "Water Heater": 1400 };
export const estimateValue = (t: JobType) => ESTIMATE_BY_TYPE[t] ?? 450;

export function deriveLeads(data: Dataset, from: number, to: number, now: number): Lead[] {
  const window = 14 * DAY;
  const jobsByCustomer = new Map<string, Job[]>();
  for (const j of data.jobs) {
    if (j.status === "Canceled") continue;
    const arr = jobsByCustomer.get(j.customerId) ?? [];
    arr.push(j);
    jobsByCustomer.set(j.customerId, arr);
  }
  const contactsByCustomer = new Map<string, number[]>();
  for (const c of callsIn(data, from, Math.min(now, to + window))) {
    const answered =
      (c.direction === "outbound" && c.outcome === "answered" && c.durationSec >= 20) ||
      (c.direction === "inbound" && c.outcome === "csr_answered");
    if (!answered) continue;
    const arr = contactsByCustomer.get(c.customerId) ?? [];
    arr.push(c.startedAt);
    contactsByCustomer.set(c.customerId, arr);
  }

  const leads: Lead[] = [];
  const lastLeadAt = new Map<string, number>();
  const campaignChannel = (campaignId: string, ai: boolean): LeadChannel =>
    ai ? "AI Voice Agent" : campaignId === "referral" ? "Referral" : campaignId === "angi" ? "Angi" : campaignId === "web_form" ? "Web Form" : "Phone";

  type Origin = { id: string; customerId: string; at: number; channel: LeadChannel; campaignId: string | null; jobType: JobType; contactAt: number | null };
  const origins: Origin[] = [];
  for (const c of callsIn(data, from, to)) {
    if (c.direction !== "inbound" || c.jobType === "Call Back" || c.jobType === "Warranty") continue;
    origins.push({
      id: `lead_${c.id}`,
      customerId: c.customerId,
      at: c.startedAt,
      channel: campaignChannel(c.campaignId, c.outcome === "ai_agent"),
      campaignId: c.campaignId,
      jobType: c.jobType,
      contactAt: c.outcome === "csr_answered" || (c.outcome === "ai_agent" && c.booked) ? c.startedAt : null,
    });
  }
  for (const l of data.inboundLeads) {
    if (l.receivedAt < from || l.receivedAt > to) continue;
    origins.push({ id: l.id, customerId: l.customerId, at: l.receivedAt, channel: l.channel, campaignId: l.channel === "Angi" ? "angi" : "web_form", jobType: l.jobType, contactAt: null });
  }
  origins.sort((a, b) => a.at - b.at);

  for (const o of origins) {
    const prev = lastLeadAt.get(o.customerId);
    if (prev !== undefined && o.at - prev < 3 * DAY) continue; // same opportunity
    lastLeadAt.set(o.customerId, o.at);
    const job = (jobsByCustomer.get(o.customerId) ?? []).find((j) => j.bookedAt >= o.at - MINUTE && j.bookedAt - o.at <= window);
    const contact =
      o.contactAt ?? (contactsByCustomer.get(o.customerId) ?? []).find((t) => t >= o.at && t - o.at <= window) ?? null;
    const history: { stage: LeadStage; at: number }[] = [{ stage: "New", at: o.at }];
    const contactAt = contact ?? (job ? job.bookedAt : null);
    if (contactAt !== null) history.push({ stage: "Contacted", at: Math.max(o.at, Math.min(contactAt, job?.bookedAt ?? contactAt)) });
    if (job) {
      history.push({ stage: "Booked", at: job.bookedAt });
      if (job.completedAt && job.completedAt <= now) history.push({ stage: "Job completed", at: job.completedAt });
      if (job.paidAt && job.paidAt <= now) history.push({ stage: "Paid", at: job.paidAt });
    }
    leads.push({
      id: o.id,
      customerId: o.customerId,
      channel: o.channel,
      campaignId: o.campaignId,
      jobType: o.jobType,
      createdAt: o.at,
      stage: history[history.length - 1].stage,
      stageHistory: history,
      value: job ? job.amount : estimateValue(o.jobType),
      jobId: job?.id ?? null,
      firstContactAt: contactAt,
    });
  }
  return leads.sort((a, b) => b.createdAt - a.createdAt);
}

/* ---------------- Formatting ---------------- */

const intFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const fmtInt = (n: number) => intFmt.format(Math.round(n));
export const fmtUsd = (n: number) => usd.format(Math.round(n));
export const fmtUsdShort = (n: number) =>
  Math.abs(n) >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : Math.abs(n) >= 10_000 ? `$${Math.round(n / 1000)}k` : Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(1)}k` : usd.format(Math.round(n));
export const fmtPct = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`;
export const fmtMinutes = (m: number | null) => {
  if (m === null || Number.isNaN(m)) return "–";
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return r ? `${h} hr ${r} min` : `${h} hr`;
};
export const fmtHoursMinutes = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
};
export const weekdayName = (ts: number) => fmt(ts, "EEEE");
