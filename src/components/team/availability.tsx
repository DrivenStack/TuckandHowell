"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { dayAvailability, fmtHoursMinutes } from "@/lib/metrics/calculations";
import { fmt, fmtTime, nyAddDays, nyStartOfDay, HOUR } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { AvailabilityStatus, Csr, Dataset } from "@/lib/types";
import { CsrAvatar } from "@/components/common/csr-avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/primitives";

export const STATUS_STYLE: Record<AvailabilityStatus, { cls: string; label: string }> = {
  Available: { cls: "bg-cool-tint ring-1 ring-inset ring-cool/30", label: "Available" },
  "On call": { cls: "bg-series-csr", label: "On call" },
  Break: { cls: "bg-warm", label: "Break" },
  Lunch: { cls: "bg-warm/55", label: "Lunch" },
  Away: { cls: "bg-alarm", label: "Away" },
  Offline: { cls: "bg-transparent", label: "Offline" },
};

const START_H = 6;
const END_H = 20;

export function DayStepper({ day, now, onChange }: { day: number; now: number; onChange: (d: number) => void }) {
  const today = nyStartOfDay(now);
  const min = nyAddDays(today, -29);
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" aria-label="Previous day" disabled={day <= min} onClick={() => onChange(nyAddDays(day, -1))}>
        <ChevronLeft aria-hidden />
      </Button>
      <span className="min-w-36 text-center text-small font-medium">{day === today ? "Today" : fmt(day + HOUR, "EEE, MMM d")}</span>
      <Button variant="outline" size="icon" aria-label="Next day" disabled={day >= today} onClick={() => onChange(nyAddDays(day, 1))}>
        <ChevronRight aria-hidden />
      </Button>
    </div>
  );
}

export function AvailabilityTimeline({ data, csrs, day, now, compact }: { data: Dataset; csrs: Csr[]; day: number; now: number; compact?: boolean }) {
  const rows = useMemo(() => csrs.map((c) => dayAvailability(data, c, day, now)), [data, csrs, day, now]);
  const from = day + START_H * HOUR;
  const to = day + END_H * HOUR;
  const pct = (t: number) => ((Math.min(Math.max(t, from), to) - from) / (to - from)) * 100;
  const hours = Array.from({ length: END_H - START_H + 1 }, (_, i) => START_H + i);
  const nowPct = now > from && now < to ? pct(now) : null;

  return (
    <div>
      <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-1.5 text-caption text-muted-foreground">
        {(Object.keys(STATUS_STYLE) as AvailabilityStatus[]).map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-[3px]", STATUS_STYLE[s].cls, s === "Offline" && "ring-1 ring-inset ring-line-strong")} aria-hidden />
            {STATUS_STYLE[s].label}
          </li>
        ))}
      </ul>
      <div className="overflow-x-auto">
        <div className={cn(compact ? "min-w-[34rem]" : "min-w-[46rem]")}>
          <div className="grid grid-cols-[9.5rem_1fr_9rem] gap-x-3">
            <div />
            <div className="relative h-5 text-caption text-muted-foreground" aria-hidden>
              {hours.map((h, i) =>
                i % 2 === 0 ? (
                  <span key={h} className="num absolute -translate-x-1/2" style={{ left: `${(i / (hours.length - 1)) * 100}%` }}>
                    {h === 12 ? "12p" : h > 12 ? `${h - 12}p` : `${h}a`}
                  </span>
                ) : null,
              )}
            </div>
            <div className="text-caption text-muted-foreground">On shift, on break</div>
          </div>
          <ul className="space-y-1.5">
            {rows.map(({ csr, blocks, totals }) => {
              const shift = totals.Available + totals["On call"] + totals.Break + totals.Lunch + totals.Away;
              return (
                <li key={csr.id} className="grid grid-cols-[9.5rem_1fr_9rem] items-center gap-x-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <CsrAvatar csr={csr} size="sm" />
                    <span className="truncate text-small">{csr.name}</span>
                  </span>
                  <div className="relative h-8 overflow-hidden rounded-[8px] bg-subtle/60" role="img" aria-label={`${csr.name}: on shift ${fmtHoursMinutes(shift)}, break and lunch ${fmtHoursMinutes(totals.Break + totals.Lunch)}, away ${fmtHoursMinutes(totals.Away)}`}>
                    {hours.slice(1, -1).map((h, i) => (
                      <span key={h} className="absolute inset-y-0 w-px bg-line" style={{ left: `${((i + 1) / (hours.length - 1)) * 100}%` }} aria-hidden />
                    ))}
                    {blocks
                      .filter((b) => b.status !== "Offline" && b.end > from && b.start < to)
                      .map((b) => (
                        <Tooltip key={`${b.start}-${b.status}`}>
                          <TooltipTrigger asChild>
                            <span
                              className={cn("absolute inset-y-1 rounded-[3px]", STATUS_STYLE[b.status].cls)}
                              style={{ left: `${pct(b.start)}%`, width: `max(2px, ${pct(b.end) - pct(b.start)}%)` }}
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            {b.status}, {fmtTime(b.start)} to {fmtTime(b.end)}
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    {nowPct !== null ? <span className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: `${nowPct}%` }} aria-hidden /> : null}
                  </div>
                  <span className="num text-caption text-muted-foreground">
                    {shift ? (
                      <>
                        <span className="text-ink">{fmtHoursMinutes(shift)}</span>, {fmtHoursMinutes(totals.Break + totals.Lunch)}
                        {totals.Away >= 1 ? <span className="text-alarm">, away {fmtHoursMinutes(totals.Away)}</span> : null}
                      </>
                    ) : (
                      "Off today"
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
