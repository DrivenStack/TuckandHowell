"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { callStats, dailySeries, delta, fmtInt, fmtPct, openAt, waitingNow } from "@/lib/metrics/calculations";
import { metric, type MetricId } from "@/lib/metrics/definitions";
import { DAY, nyAddDays, nyStartOfDay, weekdayLong } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useReady } from "@/components/app/hooks";
import { StackedBars } from "@/components/charts/charts";
import { C } from "@/components/charts/kit";
import { InfoTip, PageSkeleton } from "@/components/common/page";

export function SnapshotView() {
  const ready = useReady();
  if (!ready) return <PageSkeleton kpis={5} charts={1} />;
  return <Snapshot />;
}

function Snapshot() {
  const { data, callbacks, now } = useReady()!;
  const v = useMemo(() => {
    const today = nyStartOfDay(now);
    const t = callStats(data, today, now);
    const p = callStats(data, nyAddDays(today, -7), now - 7 * DAY);
    const waiting = waitingNow(callbacks, data.goLiveAt).length;
    const waitingThen = openAt(callbacks, now - 7 * DAY, data.goLiveAt).length;
    const days = dailySeries(data, callbacks, nyAddDays(today, -13), now).map((d) => ({ label: d.label, booked: d.jobsBooked }));
    return {
      t,
      p,
      waiting,
      waitingThen,
      days,
    };
  }, [data, callbacks, now]);

  const day = weekdayLong(now);
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-[1.5rem] leading-8 font-semibold tracking-[-0.015em] sm:text-title">How we are doing</h1>
      <p className="mt-1 text-body text-muted-foreground">Today so far, compared with last {day} at this time.</p>

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-6 sm:mt-10 sm:gap-y-10">
        <Big id="calls_in" label="Calls today" value={fmtInt(v.t.callsIn)} now={v.t.callsIn} then={v.p.callsIn} />
        <Big id="jobs_booked" label="Jobs booked today" value={fmtInt(v.t.jobsBooked)} now={v.t.jobsBooked} then={v.p.jobsBooked} />
        <Big id="booking_rate" label="Booking rate" value={fmtPct(v.t.bookingRate)} now={v.t.bookingRate} then={v.p.bookingRate} pts />
        <Big id="people_waiting" label="Waiting for a callback" value={fmtInt(v.waiting)} now={v.waiting} then={v.waitingThen} />
      </dl>

      <div className="mt-8 border-t border-line pt-6 sm:mt-12">
        <p className="mb-3 text-small text-muted-foreground">Jobs booked, last 14 days</p>
        <StackedBars data={v.days} series={[{ key: "booked", label: "Jobs booked", color: C.csr }]} height={120} label="Bar chart of jobs booked per day over the last 14 days." />
      </div>
      <p className="mt-6 text-center text-small">
        <Link href="/" className="text-cool underline-offset-4 hover:underline">
          See the full picture on Today
        </Link>
      </p>
    </div>
  );
}

function Big({ id, label, value, now, then, pts }: { id: MetricId; label: string; value: string; now: number; then: number; pts?: boolean }) {
  const def = metric(id);
  const d = pts ? now - then : delta(now, then);
  const flat = d === null || Math.abs(d) < (pts ? 0.01 : 0.02);
  const up = (d ?? 0) > 0;
  const better = flat ? null : up === def.higherIsBetter;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-body text-muted-foreground">
        {label}
        <InfoTip id={id} label={label} />
      </dt>
      <dd className="num mt-1 text-[2.75rem] leading-none font-semibold tracking-[-0.03em] sm:text-[4rem]">{value}</dd>
      <dd className={cn("mt-2 flex items-center gap-1.5 text-small font-medium", better === null ? "text-muted-foreground" : better ? "text-cool" : "text-alarm")}>
        <Icon className="size-4" aria-hidden />
        {flat ? "Same as last week" : `${up ? "Up" : "Down"} from last week, ${better ? "better" : "worse"}`}
      </dd>
    </div>
  );
}
