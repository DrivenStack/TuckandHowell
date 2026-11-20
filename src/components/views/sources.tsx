"use client";

import { useMemo, useState } from "react";
import { HelpCircle } from "lucide-react";
import { callsIn, dayStarts, fmtInt, fmtPct, fmtUsd, ratio, sourceStats, type RangePreset, type SourceRow } from "@/lib/metrics/calculations";
import { fmtDay, HOUR, nyAddDays, nyDayKey, nyStartOfDay } from "@/lib/time";
import { useLocalRange, useReady } from "@/components/app/hooks";
import { HBars, StackedBars } from "@/components/charts/charts";
import { C } from "@/components/charts/kit";
import { Chip } from "@/components/common/chips";
import { DataTable, type Col } from "@/components/common/data-table";
import { DateRangePicker, InfoTip, PageHeader, PageSkeleton, Section } from "@/components/common/page";

export function SourcesView() {
  const ready = useReady();
  if (!ready) return <PageSkeleton kpis={0} charts={2} />;
  return <Sources />;
}

function Sources() {
  const { data, now } = useReady()!;
  const [preset, setPreset] = useState<RangePreset>("30d");
  const [custom, setCustom] = useState<{ from: number; to: number } | null>(null);
  const range = useLocalRange(preset, custom);
  const rows = useMemo(() => sourceStats(data, range.from, range.to), [data, range.from, range.to]);
  const total = rows.reduce((s, r) => s + r.calls, 0);
  const legacy = rows.find((r) => r.untracked);
  const legacyShare = ratio(legacy?.calls ?? 0, total);

  const daily = useMemo(() => {
    const from = nyAddDays(nyStartOfDay(now), -29);
    const starts = dayStarts(from, now);
    const idx = new Map(starts.map((s, i) => [nyDayKey(s + HOUR), i]));
    const pts = starts.map((s) => ({ label: fmtDay(s + HOUR), tracked: 0, untracked: 0 }));
    const untrackedIds = new Set(data.campaigns.filter((c) => c.isUntracked).map((c) => c.id));
    for (const c of callsIn(data, from, now)) {
      if (c.direction !== "inbound") continue;
      const i = idx.get(nyDayKey(c.startedAt));
      if (i === undefined) continue;
      if (untrackedIds.has(c.campaignId)) pts[i].untracked++;
      else pts[i].tracked++;
    }
    return pts;
  }, [data, now]);

  const cols: Col<SourceRow>[] = [
    {
      id: "name",
      header: "Source",
      mobile: "title",
      value: (r) => r.name,
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{r.name}</span>
          {r.untracked ? <Chip tone="warm" icon={HelpCircle}>Untracked</Chip> : null}
        </span>
      ),
    },
    { id: "calls", header: "Calls", align: "right", value: (r) => r.calls, cell: (r) => fmtInt(r.calls) },
    { id: "share", header: "Share of calls", align: "right", value: (r) => ratio(r.calls, total), cell: (r) => fmtPct(ratio(r.calls, total)) },
    { id: "jobs", header: "Booked jobs", align: "right", value: (r) => r.jobs, cell: (r) => fmtInt(r.jobs) },
    { id: "rate", header: "Booking rate", align: "right", value: (r) => r.bookingRate, cell: (r) => (r.answered ? fmtPct(r.bookingRate) : "–"), headerExtra: <InfoTip text="Out of answered calls from this source (by a CSR or the AI Voice Agent), how many booked a job on the call." label="booking rate by source" /> },
    { id: "revenue", header: "Revenue", align: "right", value: (r) => r.revenue, cell: (r) => fmtUsd(r.revenue), headerExtra: <InfoTip id="revenue" /> },
  ];

  return (
    <div>
      <PageHeader
        title="Lead sources"
        description="Which marketing brings in calls and jobs. Deeper marketing reports live in the marketing tool."
        actions={<DateRangePicker value={preset} custom={custom} onChange={(p, c) => { setPreset(p); setCustom(c ?? null); }} />}
      />

      <section
        aria-labelledby="legacy-title"
        className="mb-12 flex flex-col gap-5 rounded-[var(--radius-hero)] border border-warm/40 bg-warm-tint p-5 sm:flex-row sm:items-center sm:p-7"
      >
        <p className="num shrink-0 text-[3rem] leading-none font-semibold tracking-[-0.03em] text-warm-text">{fmtPct(legacyShare)}</p>
        <div>
          <h2 id="legacy-title" className="flex items-center gap-2 text-section font-semibold">
            <HelpCircle className="size-5 text-warm-text" aria-hidden />
            We cannot tell where these calls came from
          </h2>
          <p className="mt-1 text-body">
            About {fmtPct(legacyShare)} of calls come from the Legacy Number: Main Line, so we cannot tell which marketing brought them in. Giving each ad and listing its
            own tracking number would fix this.
          </p>
        </div>
      </section>

      <Section title="Calls and jobs by source" description={range.label} source="ServiceTitan">
        <DataTable caption="Calls and jobs by marketing source" rows={rows} columns={cols} rowKey={(r) => r.campaignId} initialSort={{ id: "calls", desc: true }} csvName={`lead-sources-${range.preset}`} />
      </Section>

      <div className="mt-12 grid gap-10 lg:grid-cols-12">
        <Section className="lg:col-span-7" title="Calls by source, last 30 days" description="Tracked sources compared with the untracked main line." source="ServiceTitan">
          <StackedBars
            data={daily}
            series={[
              { key: "tracked", label: "Tracked sources", color: C.csr },
              { key: "untracked", label: "Legacy Number: Main Line", color: C.lineStrong },
            ]}
            totalLabel="All calls"
            label="Stacked bars of calls per day from tracked sources and from the untracked legacy main line."
          />
        </Section>
        <Section className="lg:col-span-5" title="Revenue by source" description={range.label} source="ServiceTitan">
          <HBars
            rows={[...rows].sort((a, b) => b.revenue - a.revenue).slice(0, 8).map((r) => ({ label: r.name, value: r.revenue, sub: `${fmtInt(r.jobs)} jobs`, highlight: r.untracked }))}
            format={(v) => fmtUsd(v)}
          />
        </Section>
      </div>
    </div>
  );
}
