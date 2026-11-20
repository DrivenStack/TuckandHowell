"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { fmtInt, fmtPct, type HourPoint } from "@/lib/metrics/calculations";
import { axisProps, C, ChartBox, ChartLegend, cursorFill, cursorLine, gridProps, makeTooltip } from "./kit";

/* ---------------- Calls by hour (stacked) ---------------- */

export function CallsByHourChart({
  data,
  currentHour,
  height = 240,
  shadeAfterHours,
  onlyAi,
}: {
  data: HourPoint[];
  currentHour?: number;
  height?: number;
  shadeAfterHours?: boolean;
  onlyAi?: boolean;
}) {
  const shown = data.filter((d) => d.hour >= 6 && d.hour <= 21);
  const rows = shadeAfterHours ? data : shown;
  const Tip = makeTooltip<HourPoint>((p) => ({
    title: `${p.label.replace("a", " am").replace("p", " pm")} to ${((p.hour + 1) % 24 === 0 ? "12a" : rowsLabel(p.hour + 1)).replace("a", " am").replace("p", " pm")}`,
    rows: onlyAi
      ? [{ label: "AI Voice Agent calls", value: fmtInt(p.ai), color: C.ai, strong: true }]
      : [
          { label: "Answered by CSRs", value: fmtInt(p.csr), color: C.csr },
          { label: "AI Voice Agent", value: fmtInt(p.ai), color: C.ai },
          { label: "Missed", value: fmtInt(p.missed), color: C.missed },
          { label: "All calls", value: fmtInt(p.total), strong: true },
        ],
    footer: p.afterHours ? "After hours: no CSRs on shift, the AI Voice Agent answers." : undefined,
  }));
  return (
    <div>
      {onlyAi ? null : (
        <ChartLegend
          className="mb-3"
          items={[
            { label: "Answered by CSRs", color: C.csr },
            { label: "AI Voice Agent", color: C.ai },
            { label: "Missed", color: C.missed },
          ]}
        />
      )}
      <ChartBox height={height} label="Stacked bar chart of calls by hour: answered by CSRs, AI Voice Agent, and missed.">
        <BarChart data={rows} margin={{ top: 18, right: 4, bottom: 0, left: -18 }} barCategoryGap="22%">
          <CartesianGrid {...gridProps} />
          {shadeAfterHours ? (
            <>
              <ReferenceArea x1={rows[0]?.label} x2="6a" fill="var(--subtle)" fillOpacity={0.7} ifOverflow="extendDomain" />
              <ReferenceArea x1="7p" x2="11p" fill="var(--subtle)" fillOpacity={0.7} />
            </>
          ) : null}
          {currentHour !== undefined && currentHour >= 6 && currentHour <= 21 ? (
            <ReferenceArea
              x1={rowsLabel(currentHour)}
              x2={rowsLabel(currentHour)}
              fill="var(--cool)"
              fillOpacity={0.08}
              label={{ value: "Now", position: "top", fill: C.ink, fontSize: 12, fontWeight: 600 }}
            />
          ) : null}
          <XAxis dataKey="label" {...axisProps} interval={shadeAfterHours ? 2 : 1} />
          <YAxis {...axisProps} allowDecimals={false} width={44} />
          <Tooltip content={Tip} cursor={cursorFill} />
          <Bar dataKey="csr" stackId="a" fill={C.csr} stroke={C.surface} strokeWidth={1} isAnimationActive={false} />
          <Bar dataKey="ai" stackId="a" fill={C.ai} stroke={C.surface} strokeWidth={1} isAnimationActive={false} />
          <Bar dataKey="missed" stackId="a" fill={C.missed} stroke={C.surface} strokeWidth={1} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.hour} fillOpacity={currentHour === undefined || r.hour <= currentHour ? 1 : 0.35} />
            ))}
          </Bar>
        </BarChart>
      </ChartBox>
    </div>
  );
}

const rowsLabel = (h: number) => (h % 24 === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`);

/* ---------------- Trend line ---------------- */

export interface TrendPoint {
  label: string;
  value: number | null;
  [key: string]: unknown;
}

export function TrendLineChart({
  data,
  format = (v) => fmtInt(v),
  target,
  targetLabel,
  color = C.csr,
  height = 220,
  label,
  seriesName,
  yDomain,
  marker,
  tooltipExtra,
  area,
  yTicks,
  axisFormat,
}: {
  data: TrendPoint[];
  format?: (v: number) => string;
  target?: number;
  targetLabel?: string;
  color?: string;
  height?: number;
  label: string;
  seriesName: string;
  yDomain?: [number | "auto" | "dataMin" | "dataMax", number | "auto" | "dataMin" | "dataMax"];
  yTicks?: number[];
  axisFormat?: (v: number) => string;
  marker?: { x: string; label: string };
  tooltipExtra?: (p: TrendPoint) => { label: string; value: string }[];
  area?: boolean;
}) {
  const Tip = makeTooltip<TrendPoint>((p) =>
    p.value === null
      ? { title: p.label, rows: [{ label: seriesName, value: "Not enough calls" }] }
      : {
          title: p.label,
          rows: [{ label: seriesName, value: format(p.value), color, strong: true }, ...(tooltipExtra?.(p) ?? [])],
          footer: target !== undefined ? `${targetLabel ?? "Target"}: ${format(target)}` : undefined,
        },
  );
  const Chart = area ? AreaChart : LineChart;
  return (
    <ChartBox height={height} label={label}>
      <Chart data={data} margin={{ top: 16, right: 12, bottom: 0, left: -6 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="label" {...axisProps} minTickGap={24} />
        <YAxis {...axisProps} tickFormatter={(v: number) => (axisFormat ?? format)(v)} domain={yDomain ?? ["auto", "auto"]} ticks={yTicks} width={56} />
        <Tooltip content={Tip} cursor={cursorLine} />
        {target !== undefined ? (
          <ReferenceLine
            y={target}
            stroke={C.ink}
            strokeOpacity={0.45}
            strokeDasharray="4 4"
            label={{ value: `${targetLabel ?? "Target"} ${format(target)}`, position: "insideTopRight", fill: C.muted, fontSize: 12 }}
          />
        ) : null}
        {marker ? (
          <ReferenceLine
            x={marker.x}
            stroke={C.ink}
            strokeOpacity={0.5}
            label={{ value: marker.label, position: "insideTopLeft", fill: C.ink, fontSize: 12, fontWeight: 600 }}
          />
        ) : null}
        {area ? (
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={color}
            fillOpacity={0.1}
            connectNulls
            dot={false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: C.surface }}
            isAnimationActive={false}
          />
        ) : (
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            connectNulls
            dot={false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: C.surface }}
            isAnimationActive={false}
          />
        )}
      </Chart>
    </ChartBox>
  );
}

/* ---------------- Stacked bars over time ---------------- */

export interface Series {
  key: string;
  label: string;
  color: string;
}

export function StackedBars({
  data,
  series,
  height = 240,
  label,
  format = (v) => fmtInt(v),
  marker,
  xKey = "label",
  totalLabel = "Total",
}: {
  data: Record<string, unknown>[];
  series: Series[];
  height?: number;
  label: string;
  format?: (v: number) => string;
  marker?: { x: string; label: string };
  xKey?: string;
  totalLabel?: string;
}) {
  const Tip = makeTooltip<Record<string, unknown>>((p) => {
    const total = series.reduce((s, x) => s + (Number(p[x.key]) || 0), 0);
    return {
      title: String(p[xKey]),
      rows: [
        ...series.map((s) => ({ label: s.label, value: format(Number(p[s.key]) || 0), color: s.color })),
        ...(series.length > 1 ? [{ label: totalLabel, value: format(total), strong: true }] : []),
      ],
    };
  });
  return (
    <div>
      {series.length > 1 ? <ChartLegend className="mb-3" items={series.map((s) => ({ label: s.label, color: s.color }))} /> : null}
      <ChartBox height={height} label={label}>
        <BarChart data={data} margin={{ top: 16, right: 4, bottom: 0, left: 0 }} barCategoryGap="18%">
          <CartesianGrid {...gridProps} />
          <XAxis dataKey={xKey} {...axisProps} minTickGap={16} />
          <YAxis {...axisProps} allowDecimals={false} tickFormatter={(v: number) => format(v)} width={50} />
          <Tooltip content={Tip} cursor={cursorFill} />
          {marker ? (
            <ReferenceLine
              x={marker.x}
              stroke={C.ink}
              strokeOpacity={0.5}
              strokeDasharray="3 3"
              label={{ value: marker.label, position: "insideTopLeft", fill: C.ink, fontSize: 12, fontWeight: 600 }}
            />
          ) : null}
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId="a"
              fill={s.color}
              stroke={C.surface}
              strokeWidth={series.length > 1 ? 1 : 0}
              radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ChartBox>
    </div>
  );
}

/* ---------------- Horizontal bars (HTML, direct labels) ---------------- */

export function HBars({
  rows,
  format,
  color = "bg-series-csr",
  target,
  targetLabel,
  max,
  className,
}: {
  rows: { label: string; value: number; sub?: string; highlight?: boolean }[];
  format: (v: number) => string;
  color?: string;
  target?: number;
  targetLabel?: string;
  max?: number;
  className?: string;
}) {
  const top = max ?? Math.max(...rows.map((r) => r.value), target ?? 0, 1);
  return (
    <ul className={cn("space-y-3", className)}>
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-small">
            <span className={cn("truncate", r.highlight && "font-medium")}>{r.label}</span>
            <span className="num font-medium">{format(r.value)}</span>
          </div>
          <div className="relative h-2 rounded-full bg-subtle">
            <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.max(1.5, (r.value / top) * 100)}%` }} />
            {target !== undefined ? (
              <span
                className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-ink/50"
                style={{ left: `${(target / top) * 100}%` }}
                title={`${targetLabel ?? "Target"} ${format(target)}`}
                aria-hidden
              />
            ) : null}
          </div>
          {r.sub ? <p className="mt-1 text-caption text-muted-foreground">{r.sub}</p> : null}
        </li>
      ))}
      {target !== undefined ? (
        <li className="flex items-center gap-1.5 text-caption text-muted-foreground">
          <span className="h-3 w-0.5 rounded-full bg-ink/50" aria-hidden />
          {targetLabel ?? "Target"} {format(target)}
        </li>
      ) : null}
    </ul>
  );
}

/* ---------------- Segmented share bar (HTML) ---------------- */

export function SegmentBar({
  segments,
  className,
}: {
  segments: { label: string; value: number; color: string; note?: string }[];
  className?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className={className}>
      <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={segments.map((s) => `${s.label} ${s.value}`).join(", ")}>
        {segments.map((s) =>
          s.value ? <span key={s.label} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(s.value / total) * 100}%`, background: s.color }} /> : null,
        )}
      </div>
      <ul className="mt-5 space-y-3">
        {segments.map((s) => (
          <li key={s.label} className="flex items-start justify-between gap-4 border-b border-line pb-3 last:border-0">
            <span className="flex items-start gap-2.5">
              <span className="mt-1 size-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} aria-hidden />
              <span>
                <span className="block text-small">{s.label}</span>
                {s.note ? <span className="block text-caption text-muted-foreground">{s.note}</span> : null}
              </span>
            </span>
            <span className="num shrink-0 text-right">
              <span className="block text-body font-semibold">{fmtInt(s.value)}</span>
              <span className="block text-caption text-muted-foreground">{fmtPct(s.value / total)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------- Funnel (HTML) ---------------- */

export function Funnel({ steps, className }: { steps: { label: string; value: number; note?: string }[]; className?: string }) {
  const top = Math.max(steps[0]?.value ?? 1, 1);
  return (
    <ol className={cn("space-y-1", className)}>
      {steps.map((s, i) => {
        const prev = steps[i - 1];
        const conv = prev && prev.value ? s.value / prev.value : null;
        return (
          <li key={s.label}>
            {conv !== null ? (
              <p className="num my-1.5 pl-1 text-caption text-muted-foreground">{fmtPct(conv)} of the step above</p>
            ) : null}
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="text-small">{s.label}</span>
              <span className="num text-section font-semibold">{fmtInt(s.value)}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-subtle">
              <div
                className={cn("h-full rounded-full transition-[width] duration-500", i === steps.length - 1 ? "bg-success" : "bg-series-csr")}
                style={{ width: `${Math.max(1.5, (s.value / top) * 100)}%` }}
              />
            </div>
            {s.note ? <p className="mt-1 pl-1 text-caption text-muted-foreground">{s.note}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
