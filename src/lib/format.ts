/** Number formatting and small math helpers. */

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

/** Elapsed time in plain words: "45 sec", "12 min", "2 hr 5 min", "3 days 4 hr" */
export function fmtElapsed(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec} sec`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return min % 60 ? `${hr} hr ${min % 60} min` : `${hr} hr`;
  const days = Math.floor(hr / 24);
  const restHr = hr % 24;
  return `${days} ${days === 1 ? "day" : "days"}${restHr ? ` ${restHr} hr` : ""}`;
}
