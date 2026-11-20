"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { callbacksIn, callbackStats, callStats, dailySeries, fmtPct, hourly, waitingNow } from "@/lib/metrics/calculations";
import { BOOKING_RATE_TARGET } from "@/lib/metrics/definitions";
import { DAY, nyAddDays, nyParts, nyStartOfDay, weekdayLong } from "@/lib/time";
import { useAppStore } from "@/store/app";
import { useCustomers, useReady } from "@/components/app/hooks";
import { CallbackDrawer } from "@/components/callbacks/drawer";
import { WaitingLine } from "@/components/callbacks/waiting-line";
import { CallsByHourChart, Funnel, TrendLineChart } from "@/components/charts/charts";
import { C } from "@/components/charts/kit";
import { Kpi } from "@/components/common/kpi";
import { PageHeader, PageSkeleton, Section } from "@/components/common/page";

export function TodayView() {
  const ready = useReady();
  if (!ready) return <PageSkeleton kpis={8} />;
  return <Today />;
}

function Today() {
  const { data, callbacks, now } = useReady()!;
  const customers = useCustomers();
  const settings = useAppStore((s) => s.settings);
  const reduce = useReducedMotion();
  const [selected, setSelected] = useState<string | null>(null);

  const today = nyStartOfDay(now);
  const lastWeekFrom = nyAddDays(today, -7);
  const lastWeekTo = now - 7 * DAY;
  const compareLabel = `vs last ${weekdayLong(now)}`;

  const m = useMemo(() => {
    const t = callStats(data, today, now);
    const p = callStats(data, lastWeekFrom, lastWeekTo);
    const cbT = callbackStats(callbacksIn(callbacks, today, now));
    const cbP = callbackStats(callbacksIn(callbacks, lastWeekFrom, lastWeekTo));
    return {
      t,
      p,
      cbT,
      cbP,
      hours: hourly(data, today, now),
      days: dailySeries(data, callbacks, nyAddDays(today, -29), now),
    };
  }, [data, callbacks, today, now, lastWeekFrom, lastWeekTo]);

  const waiting = useMemo(() => waitingNow(callbacks, data.goLiveAt), [callbacks, data.goLiveAt]);
  const selectedCb = selected ? callbacks.find((c) => c.id === selected) ?? null : null;

  const rateSeries = m.days.map((d) => ({
    label: d.label,
    value: d.csr >= 15 ? d.bookingRate : null,
    answered: d.csr,
    booked: d.bookedOnCsrCalls,
  }));
  const currentHour = nyParts(now).hour;

  return (
    <div>
      <PageHeader title="Today" description="Who is waiting for a callback, and how today is going. Live, updated as calls happen." />

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <WaitingLine
          waiting={waiting}
          customers={customers}
          now={now}
          alertAfter={settings.alertAfterMinutes}
          onSelect={(cb) => setSelected(cb.id)}
        />
      </motion.div>

      <section aria-labelledby="key-numbers" className="mt-10">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 id="key-numbers" className="text-section font-semibold">
            Key numbers today
          </h2>
          <p className="text-caption text-muted-foreground">Compared with the same time last {weekdayLong(now)}</p>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-7 sm:grid-cols-4">
          <Kpi id="calls_in" value={m.t.callsIn} previous={m.p.callsIn} />
          <Kpi id="answered_by_csr" value={m.t.csrAnswered} previous={m.p.csrAnswered} />
          <Kpi id="answered_by_ai" value={m.t.ai} previous={m.p.ai} />
          <Kpi id="missed_calls" value={m.t.missedTotal} previous={m.p.missedTotal} />
          <Kpi id="jobs_booked" value={m.t.jobsBooked} previous={m.p.jobsBooked} />
          <Kpi id="booking_rate" value={m.t.bookingRate} previous={m.p.bookingRate} />
          <Kpi id="time_to_callback" value={m.cbT.avgMinutesToCallback} previous={m.cbP.avgMinutesToCallback} />
          <Kpi
            id="callback_booking_rate"
            value={m.cbT.booked + m.cbT.spokeNoBooking ? m.cbT.callbackBookingRate : null}
            previous={m.cbP.booked + m.cbP.spokeNoBooking ? m.cbP.callbackBookingRate : null}
          />
        </div>
        <p className="mt-6 text-caption text-muted-foreground">
          Call counts from ServiceTitan. Change shown {compareLabel}, up to {nyParts(now).hour % 12 || 12}:
          {String(nyParts(now).minute).padStart(2, "0")} {nyParts(now).hour < 12 ? "am" : "pm"}.
        </p>
      </section>

      <div className="mt-12 grid gap-12 lg:grid-cols-12">
        <Section
          className="lg:col-span-8"
          title="Calls by hour today"
          description="Who picked up each call. The current hour is marked."
          source="ServiceTitan"
        >
          <CallsByHourChart data={m.hours} currentHour={currentHour} />
        </Section>
        <Section className="lg:col-span-4" title="Where today's calls ended up" description="From the first ring to a job on the schedule." source="ServiceTitan">
          <Funnel
            steps={[
              { label: "Calls in", value: m.t.callsIn },
              { label: "Answered by a CSR or the AI Voice Agent", value: m.t.csrAnswered + m.t.ai },
              { label: "Booked on the call", value: m.t.bookedOnCsrCalls + m.t.aiBooked },
            ]}
          />
          <p className="mt-4 text-caption text-muted-foreground">
            {m.t.missedTotal} calls were missed. Each one is in the callback list until someone reaches the customer.
          </p>
        </Section>
      </div>

      <Section
        className="mt-12"
        title="Booking rate, last 30 days"
        description={`Share of answered calls that booked a job. The dashed line is the ${fmtPct(BOOKING_RATE_TARGET)} target. Days with fewer than 15 answered calls are skipped.`}
        source="ServiceTitan"
      >
        <TrendLineChart
          data={rateSeries}
          format={(v) => fmtPct(v)}
          target={BOOKING_RATE_TARGET}
          color={C.csr}
          seriesName="Booking rate"
          label="Line chart of daily booking rate over the last 30 days with the target line."
          yDomain={[0.3, 0.8]}
          yTicks={[0.3, 0.4, 0.5, 0.6, 0.7, 0.8]}
          tooltipExtra={(p) => [
            { label: "Answered calls", value: String(p.answered) },
            { label: "Booked", value: String(p.booked) },
          ]}
        />
      </Section>

      <CallbackDrawer cb={selectedCb} onOpenChange={(o) => !o && setSelected(null)} />
    </div>
  );
}
