import { formatInTimeZone } from "date-fns-tz";

export const TZ = "America/New_York";
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const offsetFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const offsetCache = new Map<number, number>();

/** New York offset from UTC in ms (negative), cached per hour. One Intl call per hour of time. */
function offsetAt(ts: number): number {
  const key = Math.floor(ts / HOUR);
  const hit = offsetCache.get(key);
  if (hit !== undefined) return hit;
  const at = key * HOUR;
  const p: Record<string, number> = {};
  for (const part of offsetFmt.formatToParts(new Date(at))) if (part.type !== "literal") p[part.type] = Number(part.value);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const off = asUtc - at;
  if (offsetCache.size > 50_000) offsetCache.clear();
  offsetCache.set(key, off);
  return off;
}

export interface NyParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
  dayKey: string;
}

/** Wall-clock parts in New York. */
export function nyParts(ts: number): NyParts {
  const d = new Date(ts + offsetAt(ts));
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return {
    year,
    month,
    day,
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    weekday: d.getUTCDay(),
    dayKey: `${year}-${month < 10 ? "0" : ""}${month}-${day < 10 ? "0" : ""}${day}`,
  };
}

export const nyDayKey = (ts: number) => nyParts(ts).dayKey;
export const nyHour = (ts: number) => nyParts(ts).hour;
export const nyWeekday = (ts: number) => nyParts(ts).weekday;

/** Epoch ms for a New York wall-clock time (DST safe) */
export function nyTime(year: number, month: number, day: number, hour = 0, minute = 0): number {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  let ts = wall - offsetAt(wall + 5 * HOUR);
  const off = offsetAt(ts);
  if (wall - off !== ts) ts = wall - off;
  return ts;
}

/** Start of the New York calendar day containing ts */
export function nyStartOfDay(ts: number): number {
  const p = nyParts(ts);
  return nyTime(p.year, p.month, p.day);
}

/** Start of the New York day `n` days after the day containing ts (n may be negative). DST safe. */
export function nyAddDays(ts: number, n: number): number {
  const p = nyParts(nyStartOfDay(ts) + 12 * HOUR + n * DAY);
  return nyTime(p.year, p.month, p.day);
}

/** Start of the week (Monday) in New York */
export function nyStartOfWeek(ts: number): number {
  const wd = nyWeekday(ts);
  return nyAddDays(ts, -((wd + 6) % 7));
}

export function nyStartOfMonth(ts: number): number {
  const p = nyParts(ts);
  return nyTime(p.year, p.month, 1);
}

export function fmt(ts: number, pattern: string): string {
  return formatInTimeZone(ts, TZ, pattern);
}

/** "2:14 pm" */
export function fmtTime(ts: number): string {
  return formatInTimeZone(ts, TZ, "h:mm aaa");
}

/** "Nov 20" */
export function fmtDay(ts: number): string {
  return formatInTimeZone(ts, TZ, "MMM d");
}

/** "Fri, Nov 20, 2:14 pm" */
export function fmtDateTime(ts: number): string {
  return formatInTimeZone(ts, TZ, "EEE, MMM d, h:mm aaa");
}

/** Smart stamp: time if today, otherwise date and time */
export function fmtStamp(ts: number, now: number): string {
  if (nyDayKey(ts) === nyDayKey(now)) return `Today, ${fmtTime(ts)}`;
  if (nyDayKey(ts) === nyDayKey(nyAddDays(now, -1))) return `Yesterday, ${fmtTime(ts)}`;
  return formatInTimeZone(ts, TZ, "MMM d, h:mm aaa");
}

/** "38 min", "2 hr 5 min", "3 days" */
export function fmtDuration(ms: number): string {
  const mins = Math.max(0, Math.round(ms / MINUTE));
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) {
    const rem = mins % 60;
    return rem ? `${hrs} hr ${rem} min` : `${hrs} hr`;
  }
  return `${Math.round(hrs / 24)} days`;
}

/** Compact: "38m", "2h 5m", "3d" */
export function fmtDurationShort(ms: number): string {
  const mins = Math.max(0, Math.round(ms / MINUTE));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return mins % 60 ? `${hrs}h ${mins % 60}m` : `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

/** "1:23" talk time from seconds, or "2 hr 10 min" when long */
export function fmtSeconds(sec: number): string {
  if (sec < 60) return `${Math.round(sec)} sec`;
  if (sec < 3600) {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  return fmtDuration(sec * 1000);
}

/** "Friday" */
export function weekdayLong(ts: number): string {
  return formatInTimeZone(ts, TZ, "EEEE");
}

export function fmtAgo(ts: number, now: number): string {
  const ms = now - ts;
  if (ms < MINUTE) return "just now";
  return `${fmtDuration(ms)} ago`;
}

/** fmtStamp for use mid-sentence: "today, 2:14 pm" but "Nov 18, 2:14 pm" */
export function fmtStampInline(ts: number, now: number): string {
  return fmtStamp(ts, now).replace(/^(Today|Yesterday)/, (m) => m.toLowerCase());
}

/** CSRs staff the phones 7 am to 7 pm New York time. */
export const OPEN_HOUR = 7;
export const CLOSE_HOUR = 19;

/**
 * When a callback clock starts: the call itself during open hours,
 * otherwise 7 am the next time the call center opens.
 */
export function clockStart(ts: number): number {
  const p = nyParts(ts);
  if (p.hour >= OPEN_HOUR && p.hour < CLOSE_HOUR) return ts;
  const day = p.hour >= CLOSE_HOUR ? nyAddDays(ts, 1) : nyStartOfDay(ts);
  return day + OPEN_HOUR * HOUR;
}
