"use client";

import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { delta, fmtInt, fmtMinutes, fmtPct, fmtUsd, fmtHoursMinutes } from "@/lib/format";
import { metric, type MetricFormat, type MetricId } from "@/lib/metrics/definitions";
import { InfoTip } from "./page";

export function formatMetric(value: number | null, format: MetricFormat): string {
  if (value === null || Number.isNaN(value)) return "–";
  switch (format) {
    case "count":
      return fmtInt(value);
    case "percent":
      return fmtPct(value);
    case "currency":
      return fmtUsd(value);
    case "minutes":
      return fmtMinutes(value);
    case "duration":
      return fmtHoursMinutes(value);
  }
}

/**
 * One number with its name, explanation, and change vs a comparison period.
 * Better or worse is shown with an arrow, a word, and color, never color alone.
 */
export function Kpi({
  id,
  value,
  previous,
  compareLabel,
  size = "md",
  label,
  display,
  className,
  note,
}: {
  id: MetricId;
  value: number | null;
  previous?: number | null;
  compareLabel?: string;
  size?: "md" | "lg" | "xl";
  label?: string;
  display?: string;
  className?: string;
  note?: string;
}) {
  const def = metric(id);
  const name = label ?? def.name;
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center gap-1.5 text-small text-muted-foreground">
        <span className="leading-tight">{name}</span>
        <InfoTip id={id} label={name} />
      </div>
      <p
        className={cn(
          "num mt-1 font-semibold text-ink",
          size === "md" && "text-[1.75rem] leading-9 tracking-[-0.02em] sm:text-figure",
          size === "lg" && "text-[2.5rem] leading-[2.75rem] tracking-[-0.025em]",
          size === "xl" && "text-[3.25rem] leading-none tracking-[-0.03em] sm:text-hero",
        )}
      >
        {display ?? formatMetric(value, def.format)}
      </p>
      {previous !== undefined ? (
        <Change value={value} previous={previous} higherIsBetter={def.higherIsBetter} format={def.format} compareLabel={compareLabel} />
      ) : null}
      {note ? <p className="mt-1 text-caption text-muted-foreground">{note}</p> : null}
    </div>
  );
}

export function Change({
  value,
  previous,
  higherIsBetter,
  format,
  compareLabel,
  className,
}: {
  value: number | null;
  previous: number | null;
  higherIsBetter: boolean;
  format: MetricFormat;
  compareLabel?: string;
  className?: string;
}) {
  if (value === null || previous === null) {
    return <p className={cn("mt-1 text-caption text-muted-foreground", className)}>No comparison yet</p>;
  }
  // Percent metrics change by points, others by relative change
  const isPct = format === "percent";
  const d = isPct ? value - previous : delta(value, previous);
  const flat = d === null || Math.abs(d) < (isPct ? 0.01 : 0.02);
  const up = (d ?? 0) > 0;
  const better = flat ? null : up === higherIsBetter;
  const amount = d === null ? "" : isPct ? `${Math.abs(Math.round(d * 100))} pts` : `${Math.abs(Math.round(d * 100))}%`;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  return (
    <p className={cn("mt-1 flex flex-wrap items-center gap-x-1.5 text-caption", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-1 font-medium",
          better === null ? "text-muted-foreground" : better ? "text-cool" : "text-alarm",
        )}
      >
        <Icon className="size-3.5" aria-hidden />
        {flat ? "About the same" : `${up ? "Up" : "Down"} ${amount}, ${better ? "better" : "worse"}`}
      </span>
      {compareLabel ? <span className="text-muted-foreground">{compareLabel}</span> : null}
    </p>
  );
}
