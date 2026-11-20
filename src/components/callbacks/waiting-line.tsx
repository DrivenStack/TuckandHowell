"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, CheckCircle2, ChevronRight, Clock, Crown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDuration, MINUTE } from "@/lib/time";
import type { Callback, Customer } from "@/lib/types";
import { metric } from "@/lib/metrics/definitions";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/common/page";

/**
 * Who is waiting for a callback right now, longest wait first.
 * Each row has a timer bar that fills as the customer waits and turns red
 * once they pass the "urgent after" time from Callback rules (15 minutes by default).
 */

type Band = "fresh" | "waiting" | "late";

const BAND: Record<Band, { label: (alertAfter: number) => string; bar: string; text: string; icon: LucideIcon }> = {
  fresh: { label: () => "Under 5 min", bar: "bg-cool", text: "text-cool", icon: CheckCircle2 },
  waiting: { label: (a) => `5 to ${a} min`, bar: "bg-warm", text: "text-warm-text", icon: Clock },
  late: { label: (a) => `Over ${a} min`, bar: "bg-alarm", text: "text-alarm", icon: AlertCircle },
};

export function bandFor(minutes: number, alertAfter: number): Band {
  if (minutes >= alertAfter) return "late";
  if (minutes >= Math.min(5, alertAfter)) return "waiting";
  return "fresh";
}

const MAX_ROWS = 6;

export function WaitingLine({
  waiting,
  customers,
  now,
  alertAfter,
  onSelect,
}: {
  waiting: Callback[];
  customers: Map<string, Customer>;
  now: number;
  alertAfter: number;
  onSelect?: (cb: Callback) => void;
}) {
  const reduce = useReducedMotion();
  const rows = useMemo(
    () =>
      [...waiting]
        .sort((a, b) => a.firstMissedAt - b.firstMissedAt)
        .map((cb) => {
          const minutes = Math.max(0, (now - cb.firstMissedAt) / MINUTE);
          return { cb, minutes, band: bandFor(minutes, alertAfter) };
        }),
    [waiting, now, alertAfter],
  );
  const counts: Record<Band, number> = { fresh: 0, waiting: 0, late: 0 };
  for (const r of rows) counts[r.band]++;
  const n = rows.length;
  const shown = rows.slice(0, MAX_ROWS);

  const summary =
    n === 0
      ? "No one is waiting right now."
      : `${n} ${n === 1 ? "person is" : "people are"} waiting. ${
          counts.late === 0
            ? `Everyone has waited less than ${alertAfter} minutes.`
            : counts.late === n
              ? `${n === 1 ? "They have" : "All of them have"} waited more than ${alertAfter} minutes.`
              : `${counts.late} ${counts.late === 1 ? "has" : "have"} waited more than ${alertAfter} minutes.`
        }`;

  return (
    <section aria-labelledby="waiting-title" className="overflow-hidden rounded-[var(--radius-hero)] border border-line bg-panel">
      {/* Summary */}
      <div className="flex flex-col gap-5 px-5 pt-5 pb-5 sm:px-7 sm:pt-7 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-end gap-5">
          <p className="num text-[4rem] leading-[0.9] font-semibold tracking-[-0.04em] sm:text-[4.5rem]" aria-hidden>
            {n}
          </p>
          <div className="pb-1">
            <h2 id="waiting-title" className="flex items-center gap-1.5 text-body font-semibold">
              {metric("people_waiting").name}
              <InfoTip id="people_waiting" />
            </h2>
            <p className="mt-0.5 max-w-md text-small text-muted-foreground" aria-live="polite">
              {summary}
            </p>
          </div>
        </div>
        <Button asChild size="lg" className="w-full sm:w-auto">
          <Link href="/callbacks">Go to callbacks</Link>
        </Button>
      </div>

      {/* Counts by how long */}
      <ul className="grid grid-cols-3 border-y border-line" aria-label="Waiting by how long">
        {(["late", "waiting", "fresh"] as Band[]).map((b) => {
          const s = BAND[b];
          return (
            <li key={b} className="flex flex-col gap-1 border-r border-line px-4 py-3 last:border-r-0 sm:flex-row sm:items-center sm:gap-3 sm:px-7">
              <span className={cn("num text-[1.75rem] leading-8 font-semibold", counts[b] ? s.text : "text-muted-foreground")}>{counts[b]}</span>
              <span className="flex items-center gap-1.5 text-caption text-muted-foreground sm:text-small">
                <s.icon className={cn("size-3.5 shrink-0", s.text)} aria-hidden />
                {s.label(alertAfter)}
              </span>
            </li>
          );
        })}
      </ul>

      {/* The queue */}
      {n ? (
        <ol className="divide-y divide-line" aria-label="Customers waiting, longest wait first">
          <AnimatePresence initial={!reduce}>
            {shown.map((r, i) => {
              const c = customers.get(r.cb.customerId);
              const s = BAND[r.band];
              const fill = Math.min(1, r.minutes / alertAfter);
              return (
                <motion.li
                  key={r.cb.id}
                  layout={!reduce}
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, delay: reduce ? 0 : Math.min(i * 0.05, 0.3) }}
                >
                  <button
                    type="button"
                    onClick={() => onSelect?.(r.cb)}
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-3.5 text-left transition-colors hover:bg-subtle/60 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_8.5rem_1rem] sm:px-7"
                    aria-label={`${c?.name ?? "Customer"}, ${r.cb.jobType}, waiting ${fmtDuration(r.minutes * MINUTE)}${c?.isVip ? ", VIP member" : ""}. Open details.`}
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-small font-semibold">
                        <span className="truncate">{c?.name}</span>
                        {c?.isVip ? <Crown className="size-3.5 shrink-0 text-cool" aria-label="VIP" /> : null}
                      </span>
                      <span className="block truncate text-caption text-muted-foreground">
                        {r.cb.jobType}
                        {r.cb.missedCount > 1 ? `, called ${r.cb.missedCount} times` : ""}
                      </span>
                    </span>

                    {/* Timer bar: fills up to the urgent time, then stays full and red */}
                    <span className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto" aria-hidden>
                      <span className="relative block h-2.5 overflow-hidden rounded-full bg-subtle">
                        <motion.span
                          className={cn("absolute inset-y-0 left-0 rounded-full", s.bar)}
                          initial={reduce ? false : { width: 0 }}
                          animate={{ width: `${Math.max(3, fill * 100)}%` }}
                          transition={{ duration: reduce ? 0 : 0.6, ease: [0.22, 1, 0.36, 1] }}
                        />
                      </span>
                    </span>

                    <span className={cn("num flex items-center justify-end gap-1.5 text-small font-semibold whitespace-nowrap sm:justify-start", s.text)}>
                      <s.icon className="size-3.5 shrink-0" aria-hidden />
                      {fmtDuration(r.minutes * MINUTE)}
                    </span>
                    <ChevronRight className="hidden size-4 text-muted-foreground sm:block" aria-hidden />
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
          {n > MAX_ROWS ? (
            <li className="px-5 py-3 text-small sm:px-7">
              <Link href="/callbacks" className="text-cool underline-offset-4 hover:underline">
                And {n - MAX_ROWS} more waiting
              </Link>
            </li>
          ) : null}
        </ol>
      ) : (
        <div className="flex items-center gap-3 px-5 py-6 sm:px-7">
          <CheckCircle2 className="size-5 text-success" aria-hidden />
          <p className="text-small text-muted-foreground">No one is waiting. New missed calls will appear here.</p>
        </div>
      )}

      <p className="border-t border-line px-5 py-3 text-caption text-muted-foreground sm:px-7">
        Each bar fills up while the customer waits. A full red bar means they have waited more than {alertAfter} minutes. Live from ServiceTitan.
      </p>
    </section>
  );
}
