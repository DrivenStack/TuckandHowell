"use client";

import { useMemo } from "react";
import { TrendingDown } from "lucide-react";
import { aiStats, callsIn, dailySeries, fmtPct, hourly, weeklySeries } from "@/lib/metrics/calculations";
import { metric } from "@/lib/metrics/definitions";
import { AI_VOICE_AGENT_VENDOR } from "@/lib/data/sources/aiVoiceAgent";
import { fmt, fmtDay, nyParts, nyStartOfWeek, HOUR } from "@/lib/time";
import { useRange, useReady } from "@/components/app/hooks";
import { CallsByHourChart, SegmentBar, StackedBars, TrendLineChart } from "@/components/charts/charts";
import { C } from "@/components/charts/kit";
import { Kpi } from "@/components/common/kpi";
import { DateRangePicker, InfoTip, PageHeader, PageSkeleton, Section, SourceNote } from "@/components/common/page";

export function AiAgentView() {
  const ready = useReady();
  if (!ready) return <PageSkeleton kpis={4} charts={2} />;
  return <AiAgent />;
}

function AiAgent() {
  const { data, callbacks, now } = useReady()!;
  const range = useRange();
  const s = useMemo(() => aiStats(data, callbacks, range.from, range.to), [data, callbacks, range.from, range.to]);
  const p = useMemo(() => aiStats(data, callbacks, range.compare.from, range.compare.to), [data, callbacks, range.compare.from, range.compare.to]);
  const before = useMemo(() => aiStats(data, callbacks, now - 90 * 24 * HOUR, data.goLiveAt), [data, callbacks, now]);
  const after = useMemo(() => aiStats(data, callbacks, data.goLiveAt, now), [data, callbacks, now]);
  const weeks = useMemo(
    () => weeklySeries(callbacks, now, 13, data.goLiveAt),
    [callbacks, data.goLiveAt, now],
  );
  const goLiveWeek = fmtDay(nyStartOfWeek(data.goLiveAt) + HOUR);

  // AI calls only, by hour, with after-hours shaded
  const hours = useMemo(() => {
    const h = hourly(data, range.from, range.to);
    return h.map((x) => ({ ...x, csr: 0, missed: 0, total: x.ai }));
  }, [data, range.from, range.to]);

  const byDay = useMemo(() => {
    const from = range.to - range.from < 6 * 24 * HOUR ? now - 13 * 24 * HOUR : range.from;
    const days = dailySeries(data, callbacks, from, range.to);
    const ai = callsIn(data, from, range.to).filter((c) => c.direction === "inbound" && c.outcome === "ai_agent");
    return days.map((d) => {
      const dayCalls = ai.filter((c) => c.startedAt >= d.dayStart && c.startedAt < d.dayStart + 24 * HOUR);
      const after = dayCalls.filter((c) => {
        const h = nyParts(c.startedAt).hour;
        return h < 7 || h >= 19;
      }).length;
      return { label: d.label, during: dayCalls.length - after, after };
    });
  }, [data, callbacks, range.from, range.to, now]);

  const improvement = before.neverReturnedRate - after.neverReturnedRate;

  return (
    <div>
      <PageHeader
        title="AI Voice Agent"
        description="Calls the AI Voice Agent answered when no CSR was free or after hours, and whether a person followed up."
        actions={<DateRangePicker />}
      />

      <section aria-labelledby="never-title" className="mb-12 grid gap-8 rounded-[var(--radius-hero)] border border-line bg-panel p-5 sm:p-7 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <h2 id="never-title" className="flex items-center gap-1.5 text-small text-muted-foreground">
            {metric("ai_never_returned").name}, since the app went live
            <InfoTip id="ai_never_returned" />
          </h2>
          <p className="num mt-2 text-[3.5rem] leading-none font-semibold tracking-[-0.035em] sm:text-hero">{fmtPct(after.neverReturnedRate)}</p>
          <p className="mt-3 flex items-center gap-1.5 text-small font-medium text-cool">
            <TrendingDown className="size-4" aria-hidden />
            Down from {fmtPct(before.neverReturnedRate)} before go-live, better
          </p>
          <p className="mt-2 text-small text-muted-foreground">
            Before the app went live on {fmt(data.goLiveAt, "MMM d")}, {fmtPct(before.neverReturnedRate)} of AI Voice Agent callers who did not book did not hear from a
            person within a day. That is {Math.round(improvement * 100)} points better now.
          </p>
        </div>
        <div className="lg:col-span-7">
          <p className="mb-2 text-small font-medium">Share never returned, by week</p>
          <TrendLineChart
            data={weeks.map((w) => ({ label: w.label, value: w.aiNeverReturnedRate, items: w.aiItems }))}
            format={(v) => fmtPct(v)}
            color={C.missed}
            seriesName="Never returned"
            label="Line chart of the weekly share of AI Voice Agent callers never returned, with the go-live week marked."
            yDomain={[0, 1]}
            yTicks={[0, 0.25, 0.5, 0.75, 1]}
            marker={{ x: goLiveWeek, label: "App went live" }}
            height={190}
            tooltipExtra={(t) => [{ label: "AI callers needing a callback", value: String(t.items) }]}
          />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-x-6 gap-y-7 sm:grid-cols-4">
        <Kpi id="ai_calls" value={s.calls} previous={p.calls} compareLabel={range.compare.label} />
        <Kpi id="ai_booked" value={s.booked} previous={p.booked} compareLabel={range.compare.label} />
        <Kpi id="ai_needs_callback" value={s.stillWaiting} previous={p.stillWaiting} compareLabel={range.compare.label} />
        <Kpi id="ai_returned" value={s.returned} previous={p.returned} compareLabel={range.compare.label} />
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-12">
        <Section className="lg:col-span-7" title="AI calls by hour" description={`${range.label}. Shaded hours are after hours, when no CSRs are on shift.`} source="ServiceTitan">
          <CallsByHourChart data={hours} shadeAfterHours onlyAi />
        </Section>
        <Section className="lg:col-span-5" title="What happened to AI calls" description={range.label} source="ServiceTitan">
          <SegmentBar
            segments={[
              { label: "Booked by the AI Voice Agent", value: s.booked, color: C.success },
              { label: "Returned by a CSR", value: s.returned, color: C.csr, note: "Someone called or reached the customer" },
              { label: "Still waiting", value: s.stillWaiting, color: C.warm, note: "In the callback list right now" },
              { label: "Never returned", value: s.neverReturned, color: C.missed, note: "No one called within 24 hours" },
            ]}
          />
        </Section>
      </div>

      <Section className="mt-12" title="AI calls by day" description="During open hours means every CSR was busy. After hours is expected." source="ServiceTitan">
        <StackedBars
          data={byDay}
          series={[
            { key: "during", label: "During open hours", color: C.csr },
            { key: "after", label: "After hours", color: C.ai },
          ]}
          label="Stacked bars of AI Voice Agent calls per day, during open hours and after hours."
          height={220}
        />
      </Section>

      <SourceNote source={`${AI_VOICE_AGENT_VENDOR}, via ServiceTitan`} className="mt-10" />

    </div>
  );
}
