"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { HeartHandshake, Sparkles, Star } from "lucide-react";
import { csrStats, fmtHoursMinutes, fmtInt, fmtMinutes, fmtPct, type CsrStats } from "@/lib/metrics/calculations";
import { BOOKING_RATE_TARGET, metric } from "@/lib/metrics/definitions";
import { nyStartOfDay } from "@/lib/time";
import { useRange, useReady } from "@/components/app/hooks";
import { HBars } from "@/components/charts/charts";
import { Chip } from "@/components/common/chips";
import { CsrAvatar } from "@/components/common/csr-avatar";
import { DataTable, type Col } from "@/components/common/data-table";
import { DateRangePicker, InfoTip, PageHeader, PageSkeleton, Section } from "@/components/common/page";
import { AvailabilityTimeline, DayStepper } from "@/components/team/availability";

export function TeamView() {
  const ready = useReady();
  if (!ready) return <PageSkeleton kpis={0} charts={2} />;
  return <Team />;
}

/** Respectful highlights: one top performer, one person who could use support, and new hires. */
export function teamHighlights(stats: CsrStats[]) {
  const eligible = stats.filter((s) => s.inboundAnswered >= 10);
  const top = [...eligible].sort((a, b) => b.bookingRate - a.bookingRate)[0];
  const support = [...eligible]
    .filter((s) => s.csr.profile !== "new" && s !== top)
    .sort((a, b) => a.bookingRate - b.bookingRate + (b.missedWhileAvailable - a.missedWhileAvailable) * 0.01)[0];
  return { topId: top?.csr.id, supportId: support && support.bookingRate < BOOKING_RATE_TARGET - 0.05 ? support.csr.id : undefined };
}

function headerTip(id: Parameters<typeof metric>[0]) {
  return <InfoTip id={id} />;
}

function Team() {
  const { data, callbacks, now } = useReady()!;
  const range = useRange();
  const router = useRouter();
  const [day, setDay] = useState(() => nyStartOfDay(now));
  const stats = useMemo(() => csrStats(data, callbacks, range.from, range.to), [data, callbacks, range.from, range.to]);
  const { topId, supportId } = teamHighlights(stats);

  const columns: Col<CsrStats>[] = [
    {
      id: "name",
      header: "CSR",
      mobile: "title",
      value: (r) => r.csr.name,
      cell: (r) => (
        <span className="flex items-center gap-2.5">
          <CsrAvatar csr={r.csr} size="sm" />
          <span className="font-medium whitespace-nowrap">{r.csr.name}</span>
          {r.csr.id === topId ? <Chip tone="cool" icon={Star}>Top booking rate</Chip> : null}
          {r.csr.id === supportId ? <Chip tone="warm" icon={HeartHandshake}>Could use coaching</Chip> : null}
          {r.csr.profile === "new" ? <Chip icon={Sparkles}>New</Chip> : null}
        </span>
      ),
    },
    { id: "calls", header: "Calls handled", align: "right", value: (r) => r.callsHandled, cell: (r) => fmtInt(r.callsHandled), headerExtra: headerTip("calls_handled") },
    { id: "talk", header: "Talk time", align: "right", value: (r) => r.talkSeconds, cell: (r) => fmtHoursMinutes(r.talkSeconds / 60), headerExtra: headerTip("talk_time") },
    {
      id: "rate",
      header: "Booking rate",
      align: "right",
      value: (r) => (r.inboundAnswered ? r.bookingRate : null),
      cell: (r) => (r.inboundAnswered ? fmtPct(r.bookingRate) : "–"),
      headerExtra: headerTip("booking_rate"),
    },
    { id: "cbs", header: "Callbacks completed", align: "right", value: (r) => r.callbacksCompleted, cell: (r) => fmtInt(r.callbacksCompleted), headerExtra: headerTip("callbacks_completed") },
    {
      id: "ttc",
      header: "Time to call back",
      align: "right",
      value: (r) => r.avgMinutesToCallback,
      cell: (r) => fmtMinutes(r.avgMinutesToCallback),
      headerExtra: headerTip("time_to_callback"),
    },
    { id: "missed", header: "Missed while available", align: "right", value: (r) => r.missedWhileAvailable, cell: (r) => fmtInt(r.missedWhileAvailable), headerExtra: headerTip("missed_while_available") },
    { id: "break", header: "Time on break", align: "right", value: (r) => r.breakMinutes, cell: (r) => fmtHoursMinutes(r.breakMinutes), headerExtra: headerTip("time_on_break") },
  ];

  const sortedByRate = [...stats].filter((s) => s.inboundAnswered >= 5).sort((a, b) => b.bookingRate - a.bookingRate);
  const sortedByCb = [...stats].sort((a, b) => b.callbacksCompleted - a.callbacksCompleted);

  return (
    <div>
      <PageHeader
        title="Team"
        description="How each CSR is doing, side by side. Open anyone to see their trends."
        actions={<DateRangePicker />}
      />

      <Section title="Leaderboard" description={`${range.label}. Tap a column to sort.`} source="ServiceTitan for calls and bookings, Dialpad for availability and breaks">
        <DataTable
          caption="CSR leaderboard"
          rows={stats}
          columns={columns}
          rowKey={(r) => r.csr.id}
          initialSort={{ id: "rate", desc: true }}
          onRowClick={(r) => router.push(`/team/${r.csr.id}`)}
          csvName={`team-leaderboard-${range.preset}`}
        />
        <p className="mt-3 text-caption text-muted-foreground">
          Highlights compare booking rate among CSRs with at least 10 answered calls. New hires are not compared while they ramp up.
        </p>
      </Section>

      <div className="mt-12 grid gap-10 lg:grid-cols-2">
        <Section title="Booking rate" description={`Target ${fmtPct(BOOKING_RATE_TARGET)}, shown as the mark on each bar. CSRs with fewer than 5 answered calls are left out.`} source="ServiceTitan">
          <HBars
            rows={sortedByRate.map((s) => ({ label: s.csr.name, value: s.bookingRate, sub: `${s.booked} booked of ${s.inboundAnswered} answered`, highlight: s.csr.id === topId }))}
            format={(v) => fmtPct(v)}
            target={BOOKING_RATE_TARGET}
            max={1}
          />
        </Section>
        <Section title="Callbacks completed" description="Customers reached or booked from the callback list." source="ServiceTitan">
          <HBars rows={sortedByCb.map((s) => ({ label: s.csr.name, value: s.callbacksCompleted }))} format={(v) => fmtInt(v)} color="bg-series-ai" />
        </Section>
      </div>

      <Section
        className="mt-12"
        title="Availability"
        description="Each CSR's day as Dialpad saw it. The dark line is now."
        actions={<DayStepper day={day} now={now} onChange={setDay} />}
        source="Dialpad"
        raised
      >
        <AvailabilityTimeline data={data} csrs={data.csrs} day={day} now={now} />
      </Section>
    </div>
  );
}
