"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, UserX } from "lucide-react";
import { timeToCallback, LIST_LABELS } from "@/lib/callbacks/engine";
import { csrStats, fmtHoursMinutes, fmtPct, statusNow } from "@/lib/metrics/calculations";
import { BOOKING_RATE_TARGET } from "@/lib/metrics/definitions";
import { DAY, fmt, fmtDuration, fmtStamp, nyAddDays, nyStartOfDay } from "@/lib/time";
import type { Callback } from "@/lib/types";
import { useAppStore } from "@/store/app";
import { useCustomers, useRange, useReady } from "@/components/app/hooks";
import { CallbackDrawer, LIST_TONE } from "@/components/callbacks/drawer";
import { StackedBars, TrendLineChart } from "@/components/charts/charts";
import { C } from "@/components/charts/kit";
import { Chip } from "@/components/common/chips";
import { CsrAvatar } from "@/components/common/csr-avatar";
import { DataTable, type Col } from "@/components/common/data-table";
import { Kpi } from "@/components/common/kpi";
import { DateRangePicker, EmptyState, PageSkeleton, Section } from "@/components/common/page";
import { Button } from "@/components/ui/button";
import { AvailabilityTimeline, DayStepper } from "@/components/team/availability";

export function CsrProfileView({ id }: { id: string }) {
  const ready = useReady();
  if (!ready) return <PageSkeleton kpis={8} charts={2} />;
  return <CsrProfile id={id} />;
}

function CsrProfile({ id }: { id: string }) {
  const { data, callbacks, now } = useReady()!;
  const range = useRange();
  const customers = useCustomers();
  const role = useAppStore((s) => s.role);
  const csr = data.csrs.find((c) => c.id === id);
  const [day, setDay] = useState(() => nyStartOfDay(now));
  const [selected, setSelected] = useState<string | null>(null);

  const s = useMemo(() => (csr ? csrStats(data, callbacks, range.from, range.to).find((x) => x.csr.id === csr.id) : undefined), [csr, data, callbacks, range.from, range.to]);
  const p = useMemo(
    () => (csr ? csrStats(data, callbacks, range.compare.from, range.compare.to).find((x) => x.csr.id === csr.id) : undefined),
    [csr, data, callbacks, range.compare.from, range.compare.to],
  );

  const trend = useMemo(() => {
    if (!csr) return [];
    const today = nyStartOfDay(now);
    return Array.from({ length: 30 }, (_, i) => {
      const from = nyAddDays(today, -29 + i);
      const to = Math.min(now, nyAddDays(from, 1) - 1);
      const st = csrStats(data, callbacks, from, to).find((x) => x.csr.id === csr.id)!;
      return {
        label: fmt(from + 3_600_000, "MMM d"),
        value: st.inboundAnswered >= 5 ? st.bookingRate : null,
        answered: st.inboundAnswered,
        outbound: st.outbound,
        callbacks: st.callbacksCompleted,
      };
    });
  }, [csr, data, callbacks, now]);

  const recent = useMemo(
    () =>
      callbacks
        .filter((c) => c.resolvedByCsrId === id || c.claim?.csrId === id || c.events.some((e) => e.csrId === id && e.kind === "attempt"))
        .filter((c) => c.firstMissedAt >= now - 7 * DAY)
        .sort((a, b) => (b.resolvedAt ?? b.lastMissedAt) - (a.resolvedAt ?? a.lastMissedAt))
        .slice(0, 40),
    [callbacks, id, now],
  );

  if (!csr || !s || !p) {
    return (
      <EmptyState icon={UserX} title="We could not find this CSR" action={<Button asChild variant="outline"><Link href="/team">Back to Team</Link></Button>}>
        They may have left the team or the link is out of date.
      </EmptyState>
    );
  }

  const status = statusNow(data, csr.id, now);
  const cols: Col<Callback>[] = [
    { id: "who", header: "Customer", mobile: "title", value: (c) => customers.get(c.customerId)?.name ?? "", cell: (c) => <span className="font-medium">{customers.get(c.customerId)?.name}</span> },
    { id: "reason", header: "Reason", value: (c) => c.jobType },
    { id: "list", header: "Now in", value: (c) => LIST_LABELS[c.list], cell: (c) => <Chip tone={LIST_TONE[c.list]}>{LIST_LABELS[c.list]}</Chip> },
    { id: "when", header: "When", value: (c) => c.resolvedAt ?? c.lastMissedAt, cell: (c) => fmtStamp(c.resolvedAt ?? c.lastMissedAt, now) },
    { id: "ttc", header: "Time to call back", align: "right", value: (c) => timeToCallback(c), cell: (c) => { const t = timeToCallback(c); return t === null ? "–" : fmtDuration(t); } },
  ];

  return (
    <div>
      {role !== "csr" ? (
        <Button asChild variant="quiet" size="sm" className="-ml-2 mb-3">
          <Link href="/team">
            <ArrowLeft aria-hidden />
            Team
          </Link>
        </Button>
      ) : null}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-4">
          <CsrAvatar csr={csr} size="lg" />
          <div>
            <h1 className="text-[1.5rem] leading-8 font-semibold tracking-[-0.015em] sm:text-title">{role === "csr" ? "My numbers" : csr.name}</h1>
            <p className="mt-1 text-body text-muted-foreground">
              {role === "csr" ? `${csr.name}, ` : ""}shift {csr.shiftStartHour > 12 ? csr.shiftStartHour - 12 : csr.shiftStartHour} am to {csr.shiftEndHour - 12} pm, on the team since{" "}
              {fmt(csr.hiredAt, "MMM yyyy")}. Right now: <span className="font-medium text-ink">{status}</span>
            </p>
          </div>
        </div>
        <DateRangePicker />
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-7 sm:grid-cols-4">
        <Kpi id="calls_handled" value={s.callsHandled} previous={p.callsHandled} compareLabel={range.compare.label} />
        <Kpi id="talk_time" value={s.talkSeconds / 60} previous={p.talkSeconds / 60} compareLabel={range.compare.label} />
        <Kpi id="booking_rate" value={s.inboundAnswered ? s.bookingRate : null} previous={p.inboundAnswered ? p.bookingRate : null} compareLabel={range.compare.label} />
        <Kpi id="callbacks_completed" value={s.callbacksCompleted} previous={p.callbacksCompleted} compareLabel={range.compare.label} />
        <Kpi id="time_to_callback" value={s.avgMinutesToCallback} previous={p.avgMinutesToCallback} compareLabel={range.compare.label} />
        <Kpi id="missed_while_available" value={s.missedWhileAvailable} previous={p.missedWhileAvailable} compareLabel={range.compare.label} />
        <Kpi id="time_on_break" value={s.breakMinutes} previous={p.breakMinutes} compareLabel={range.compare.label} />
        <Kpi id="answered_by_csr" label="Calls answered" value={s.inboundAnswered} previous={p.inboundAnswered} compareLabel={range.compare.label} />
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-2">
        <Section title="Booking rate, last 30 days" description={`Days with fewer than 5 answered calls are skipped. Target ${fmtPct(BOOKING_RATE_TARGET)}.`} source="ServiceTitan">
          <TrendLineChart
            data={trend}
            format={(v) => fmtPct(v)}
            target={BOOKING_RATE_TARGET}
            seriesName="Booking rate"
            label={`Line chart of ${csr.name}'s booking rate over the last 30 days.`}
            yDomain={[0, 1]}
            yTicks={[0, 0.25, 0.5, 0.75, 1]}
            height={200}
            tooltipExtra={(t) => [{ label: "Answered calls", value: String(t.answered) }]}
          />
        </Section>
        <Section title="Calls handled, last 30 days" source="ServiceTitan">
          <StackedBars
            data={trend}
            series={[
              { key: "answered", label: "Answered", color: C.csr },
              { key: "outbound", label: "Calls made", color: C.ai },
            ]}
            height={200}
            label={`Stacked bars of calls answered and calls made by ${csr.name} per day.`}
          />
        </Section>
      </div>

      <Section className="mt-12" title="Availability" actions={<DayStepper day={day} now={now} onChange={setDay} />} source="Dialpad" raised>
        <AvailabilityTimeline data={data} csrs={[csr]} day={day} now={now} compact />
        <p className="mt-3 text-caption text-muted-foreground">Breaks and lunch this period: {fmtHoursMinutes(s.breakMinutes)}. Away: {fmtHoursMinutes(s.awayMinutes)}.</p>
      </Section>

      <Section className="mt-12" title="Recent callbacks" description="Customers this CSR claimed, tried, or reached in the last 7 days." source="ServiceTitan">
        <DataTable
          caption={`Recent callbacks handled by ${csr.name}`}
          rows={recent}
          columns={cols}
          rowKey={(c) => c.id}
          onRowClick={(c) => setSelected(c.id)}
          initialSort={{ id: "when", desc: true }}
          empty={<EmptyState title="No callbacks in the last 7 days">Claimed and completed callbacks will show here.</EmptyState>}
        />
      </Section>
      <CallbackDrawer cb={selected ? callbacks.find((c) => c.id === selected) ?? null : null} onOpenChange={(o) => !o && setSelected(null)} />
    </div>
  );
}
