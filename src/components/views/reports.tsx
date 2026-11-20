"use client";

import { useMemo, useState } from "react";
import { median, callbackStats, callbacksIn, callStats, dailySeries, fmtInt, fmtMinutes, fmtPct, fmtUsd, type DayPoint, type RangePreset } from "@/lib/metrics/calculations";
import { BOOKING_RATE_TARGET } from "@/lib/metrics/definitions";
import { fmt, HOUR, nyStartOfMonth, nyStartOfWeek } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useLocalRange, useReady } from "@/components/app/hooks";
import { StackedBars, TrendLineChart } from "@/components/charts/charts";
import { C } from "@/components/charts/kit";
import { DataTable, type Col } from "@/components/common/data-table";
import { Kpi } from "@/components/common/kpi";
import { DateRangePicker, PageHeader, PageSkeleton, Section } from "@/components/common/page";

type Grain = "day" | "week" | "month";

interface Period {
  key: string;
  label: string;
  start: number;
  callsIn: number;
  csr: number;
  ai: number;
  missed: number;
  jobs: number;
  booked: number;
  bookingRate: number | null;
  ttc: number | null;
  revenue: number;
}

function group(days: DayPoint[], grain: Grain): Period[] {
  const map = new Map<number, { label: string; pts: DayPoint[] }>();
  for (const d of days) {
    const start = grain === "day" ? d.dayStart : grain === "week" ? nyStartOfWeek(d.dayStart + HOUR) : nyStartOfMonth(d.dayStart + HOUR);
    const label = grain === "day" ? d.label : grain === "week" ? `Week of ${fmt(start + HOUR, "MMM d")}` : fmt(start + HOUR, "MMMM");
    const g = map.get(start) ?? { label, pts: [] };
    g.pts.push(d);
    map.set(start, g);
  }
  return [...map.entries()].map(([start, { label, pts }]) => {
    const sum = (k: keyof DayPoint) => pts.reduce((s, p) => s + (Number(p[k]) || 0), 0);
    const csr = sum("csr");
    const booked = sum("bookedOnCsrCalls");
    const ttcs = pts.map((p) => p.avgMinutesToCallback).filter((v): v is number => v !== null);
    return {
      key: String(start),
      label,
      start,
      callsIn: sum("callsIn"),
      csr,
      ai: sum("ai"),
      missed: sum("missed"),
      jobs: sum("jobsBooked"),
      booked,
      bookingRate: csr >= 10 ? booked / csr : null,
      ttc: ttcs.length ? median(ttcs) : null,
      revenue: sum("revenue"),
    };
  });
}

export function ReportsView() {
  const ready = useReady();
  if (!ready) return <PageSkeleton kpis={6} charts={4} />;
  return <Reports />;
}

function Reports() {
  const { data, callbacks } = useReady()!;
  const [preset, setPreset] = useState<RangePreset>("30d");
  const [custom, setCustom] = useState<{ from: number; to: number } | null>(null);
  const range = useLocalRange(preset, custom);
  const [grain, setGrain] = useState<Grain>("day");
  const tracked = useMemo(() => callbacks.filter((c) => c.firstMissedAt >= data.goLiveAt), [callbacks, data.goLiveAt]);
  const days = useMemo(() => dailySeries(data, tracked, range.from, range.to), [data, tracked, range.from, range.to]);
  const periods = useMemo(() => group(days, grain), [days, grain]);
  const s = useMemo(() => callStats(data, range.from, range.to), [data, range.from, range.to]);
  const p = useMemo(() => callStats(data, range.compare.from, range.compare.to), [data, range.compare.from, range.compare.to]);
  const cb = callbackStats(callbacksIn(tracked, range.from, range.to));
  const cbp = callbackStats(callbacksIn(tracked, range.compare.from, range.compare.to));
  const cmp = range.compare.label;

  const cols: Col<Period>[] = [
    { id: "label", header: grain === "day" ? "Day" : grain === "week" ? "Week" : "Month", mobile: "title", value: (r) => r.start, cell: (r) => <span className="font-medium">{r.label}</span> },
    { id: "calls", header: "Calls in", align: "right", value: (r) => r.callsIn, cell: (r) => fmtInt(r.callsIn) },
    { id: "csr", header: "By CSRs", align: "right", value: (r) => r.csr, cell: (r) => fmtInt(r.csr) },
    { id: "ai", header: "By AI Voice Agent", align: "right", value: (r) => r.ai, cell: (r) => fmtInt(r.ai) },
    { id: "missed", header: "Missed", align: "right", value: (r) => r.missed, cell: (r) => fmtInt(r.missed) },
    { id: "rate", header: "Booking rate", align: "right", value: (r) => r.bookingRate, cell: (r) => (r.bookingRate === null ? "–" : fmtPct(r.bookingRate)) },
    { id: "jobs", header: "Jobs booked", align: "right", value: (r) => r.jobs, cell: (r) => fmtInt(r.jobs) },
    { id: "ttc", header: "Time to call back", align: "right", value: (r) => r.ttc, cell: (r) => fmtMinutes(r.ttc) },
    { id: "rev", header: "Revenue", align: "right", value: (r) => r.revenue, cell: (r) => fmtUsd(r.revenue) },
  ];

  const chartData = periods.map((x) => ({ ...x, label: grain === "week" ? x.label.replace("Week of ", "") : x.label, value: null as number | null }));

  return (
    <div>
      <PageHeader
        title="Reports"
        description="The main numbers over any period, by day, week or month. Export any table to CSV."
        actions={
          <>
            <div className="flex rounded-[10px] border border-line-strong p-0.5" role="radiogroup" aria-label="Group by">
              {(["day", "week", "month"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  role="radio"
                  aria-checked={grain === g}
                  onClick={() => setGrain(g)}
                  className={cn("h-9 rounded-[8px] px-3 text-small", grain === g ? "bg-ink text-on-ink" : "text-muted-foreground hover:text-ink")}
                >
                  {g === "day" ? "Daily" : g === "week" ? "Weekly" : "Monthly"}
                </button>
              ))}
            </div>
            <DateRangePicker value={preset} custom={custom} onChange={(p, c) => { setPreset(p); setCustom(c ?? null); }} />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-x-6 gap-y-7 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi id="calls_in" value={s.callsIn} previous={p.callsIn} compareLabel={cmp} />
        <Kpi id="booking_rate" value={s.bookingRate} previous={p.bookingRate} compareLabel={cmp} />
        <Kpi id="time_to_callback" value={cb.avgMinutesToCallback} previous={cbp.avgMinutesToCallback} compareLabel={cmp} />
        <Kpi id="missed_calls" value={s.missedTotal} previous={p.missedTotal} compareLabel={cmp} />
        <Kpi id="jobs_booked" value={s.jobsBooked} previous={p.jobsBooked} compareLabel={cmp} />
        <Kpi id="revenue" value={s.revenue} previous={p.revenue} compareLabel={cmp} />
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-2">
        <Section title="Calls" description="Who picked up." source="ServiceTitan">
          <StackedBars
            data={chartData}
            series={[
              { key: "csr", label: "Answered by CSRs", color: C.csr },
              { key: "ai", label: "AI Voice Agent", color: C.ai },
              { key: "missed", label: "Missed", color: C.missed },
            ]}
            totalLabel="All calls"
            label="Stacked bars of calls per period by who answered."
            height={220}
          />
        </Section>
        <Section title="Booking rate" description={`Target ${fmtPct(BOOKING_RATE_TARGET)}. Periods with fewer than 10 answered calls are skipped.`} source="ServiceTitan">
          <TrendLineChart
            data={chartData.map((x) => ({ ...x, value: x.bookingRate }))}
            format={(v) => fmtPct(v)}
            target={BOOKING_RATE_TARGET}
            seriesName="Booking rate"
            yDomain={[0.3, 0.8]}
            yTicks={[0.3, 0.4, 0.5, 0.6, 0.7, 0.8]}
            label="Line chart of booking rate per period with the target line."
            height={220}
          />
        </Section>
        <Section title="Time to call back" description="Since the callback app went live. Lower is better." source="ServiceTitan">
          <TrendLineChart
            data={chartData.map((x) => ({ ...x, value: x.ttc === null ? null : Math.round(x.ttc) }))}
            format={(v) => fmtMinutes(v)}
            axisFormat={(v) => (v >= 60 ? `${Math.round(v / 6) / 10}h` : `${Math.round(v)}m`)}
            seriesName="Typical wait"
            color={C.csr}
            area
            label="Line chart of typical time to call back per period."
            height={220}
          />
        </Section>
        <Section title="Missed calls" description="Missed or hung up while waiting." source="ServiceTitan">
          <StackedBars data={chartData} series={[{ key: "missed", label: "Missed calls", color: C.missed }]} label="Bar chart of missed calls per period." height={220} />
        </Section>
      </div>

      <Section className="mt-12" title="All numbers" description={`${range.label}, ${grain === "day" ? "by day" : grain === "week" ? "by week" : "by month"}.`} source="ServiceTitan and Dialpad">
        <DataTable caption="Report by period" rows={periods} columns={cols} rowKey={(r) => r.key} initialSort={{ id: "label", desc: true }} csvName={`report-${grain}-${range.preset}`} />
      </Section>
    </div>
  );
}
