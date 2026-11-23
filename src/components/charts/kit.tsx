"use client";

/**
 * Shared chart pieces so every Recharts chart looks like one system:
 * recessive axes, horizontal hairline grid only, HTML legends, plain-language tooltips.
 */
import type { ReactNode } from "react";
import { ResponsiveContainer } from "recharts";
import type { TooltipContentProps } from "recharts";
import { cn } from "@/lib/utils";

export const C = {
  csr: "var(--series-csr)",
  ai: "var(--series-ai)",
  missed: "var(--series-missed)",
  cool: "var(--cool)",
  warm: "var(--warm)",
  alarm: "var(--alarm)",
  success: "var(--success)",
  ink: "var(--ink)",
  muted: "var(--muted-text)",
  grid: "var(--chart-grid)",
  axis: "var(--chart-axis)",
  surface: "var(--panel)",
  ground: "var(--ground)",
  lineStrong: "var(--line-strong)",
};

export const axisProps = {
  tickLine: false,
  axisLine: false,
  tick: { fill: C.axis, fontSize: 12, fontFamily: "var(--font-sans)" },
  tickMargin: 8,
} as const;

export const gridProps = {
  vertical: false,
  stroke: C.grid,
  strokeDasharray: "0",
} as const;

export function ChartBox({ height = 240, children, className, label }: { height?: number; children: ReactNode; className?: string; label: string }) {
  return (
    <div role="img" aria-label={label} className={cn("w-full select-none", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 200, height: 40 }}>
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

export interface LegendItem {
  label: string;
  color: string;
  kind?: "box" | "line" | "dash";
}

export function ChartLegend({ items, className }: { items: LegendItem[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted-foreground", className)}>
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          {i.kind === "line" ? (
            <span className="h-0.5 w-3.5 rounded-full" style={{ background: i.color }} aria-hidden />
          ) : i.kind === "dash" ? (
            <span className="w-3.5 border-t-2 border-dashed" style={{ borderColor: i.color }} aria-hidden />
          ) : (
            <span className="size-2.5 rounded-[3px]" style={{ background: i.color }} aria-hidden />
          )}
          {i.label}
        </li>
      ))}
    </ul>
  );
}

type Row = { label: string; value: string; color?: string; strong?: boolean };

/** Custom tooltip: plain words, values in ink, a colored chip carries identity. */
export function TooltipCard({ title, rows, footer }: { title: string; rows: Row[]; footer?: string }) {
  return (
    <div className="min-w-44 rounded-[12px] border border-line bg-panel px-3 py-2.5 text-small text-ink shadow-float">
      <p className="mb-1.5 font-medium">{title}</p>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              {r.color ? <span className="size-2 rounded-[2px]" style={{ background: r.color }} aria-hidden /> : null}
              {r.label}
            </span>
            <span className={cn("num", r.strong && "font-semibold")}>{r.value}</span>
          </li>
        ))}
      </ul>
      {footer ? <p className="mt-2 border-t border-line pt-1.5 text-caption text-muted-foreground">{footer}</p> : null}
    </div>
  );
}

/** Adapts Recharts tooltip props to TooltipCard via a row builder. */
export function makeTooltip<T>(build: (point: T, label: string) => { title: string; rows: Row[]; footer?: string } | null) {
  function ChartTooltip(props: TooltipContentProps) {
    const { active, payload, label } = props;
    if (!active || !payload?.length) return null;
    const point = payload[0]?.payload as T | undefined;
    if (!point) return null;
    const content = build(point, String(label ?? ""));
    return content ? <TooltipCard {...content} /> : null;
  }
  return ChartTooltip;
}

export const cursorFill = { fill: "var(--subtle)", opacity: 0.7 };
export const cursorLine = { stroke: "var(--line-strong)", strokeWidth: 1 };
