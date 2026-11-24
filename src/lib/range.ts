/** Date ranges for the date picker, always in New York time. */
import { DAY, fmtDay, nyAddDays, nyStartOfDay, nyStartOfMonth } from "@/lib/time";

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
