"use client";

/**
 * One dashboard, two pages: Abandoned calls and Broccoli calls.
 * Both answer "did these callers get a call back, how fast, and did they book?"
 * Each page passes a config with its wording, metrics and call-length table.
 */
import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, CheckCircle2, Info, type LucideIcon, Target } from "lucide-react";
import {
  aiBookedCount,
  buildContactIndex,
  followUpCalls,
  lengthTable,
  speedTable,
  summarize,
  timeBins,
  type AbandonedSummary,
  type Bins,
  type Bucket,
  type FollowUpKind,
  type LengthRow,
  type SpeedRow,
} from "@/lib/metrics/abandoned";
import { fmtInt, fmtPct, type RangePreset } from "@/lib/metrics/calculations";
import { metric, type MetricId } from "@/lib/metrics/definitions";
import { cn } from "@/lib/utils";
import { useIsWide, useLocalRange, useReady } from "@/components/app/hooks";
import { Sparkline } from "@/components/charts/sparkline";
import { Change } from "@/components/common/kpi";
import { DateRangePicker, EmptyState, InfoTip, PageHeader, PageSkeleton, SourceNote } from "@/components/common/page";

const LEVEL_COLOR = ["", "var(--level-1)", "var(--level-2)", "var(--level-3)", "var(--level-4)", "var(--level-5)"];
const NEUTRAL_COLOR = "var(--series-csr)";

export interface DashboardConfig {
  kind: FollowUpKind;
  title: string;
  description: string;
  source: string;
  /** Word for one call in this dashboard, e.g. "abandoned" or "Broccoli" */
  noun: string;
  metrics: {
    total: MetricId;
    calledBack: MetricId;
    stillOpen: MetricId;
    rate: MetricId;
    speed: MetricId;
    bookRate: MetricId;
    length: MetricId;
  };
  totalLabel: string;
  totalSub: string;
  /** "the hang-up" or "the Broccoli call": what the callback speed is measured from */
  speedFrom: string;
  emptyIcon: LucideIcon;
  emptyTitle: string;
  emptyText: string;
  length: {
    title: string;
    rule: string;
    buckets?: Bucket[];
    /** Rows go green to red against a target (first row is the target) */
    target: boolean;
    unitLabel: string;
    footer: string;
  };
}

export function FollowUpDashboard({ config }: { config: DashboardConfig }) {
  const ready = useReady();
  if (!ready) return <PageSkeleton kpis={4} charts={2} />;
  return <Dashboard config={config} />;
}

function Dashboard({ config }: { config: DashboardConfig }) {
  const { data } = useReady()!;
  const reduce = useReducedMotion();
  const [preset, setPreset] = useState<RangePreset>("7d");
  const [custom, setCustom] = useState<{ from: number; to: number } | null>(null);
  const range = useLocalRange(preset, custom);

  const index = useMemo(() => buildContactIndex(data), [data]);
  const view = useMemo(() => {
    const items = followUpCalls(data, index, range.from, range.to, config.kind);
    const prev = followUpCalls(data, index, range.compare.from, range.compare.to, config.kind);
    const bins = timeBins(range.from, range.to);
    return {
      items,
      s: summarize(items),
      p: summarize(prev),
      bins,
      speed: speedTable(items, bins),
      length: lengthTable(items, bins, config.length.buckets),
      aiBooked: config.kind === "ai_agent" ? aiBookedCount(data, range.from, range.to) : 0,
    };
  }, [data, index, range.from, range.to, range.compare.from, range.compare.to, config.kind, config.length.buckets]);

  return (
    <div>
      <PageHeader
        title={config.title}
        description={config.description}
        actions={
          <DateRangePicker
            value={preset}
            custom={custom}
            onChange={(p, c) => {
              setPreset(p);
              setCustom(c ?? null);
            }}
          />
        }
      />

      <motion.div initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
        <Summary config={config} s={view.s} p={view.p} compareLabel={range.compare.label} aiBooked={view.aiBooked} />
      </motion.div>

      {view.s.total === 0 ? (
        <EmptyState icon={config.emptyIcon} title={config.emptyTitle} className="mt-10 rounded-[var(--radius-panel)] border border-dashed border-line-strong">
          {config.emptyText}
        </EmptyState>
      ) : (
        <>
          <SpeedSection config={config} rows={view.speed.rows} total={view.speed.total} bins={view.bins} stillOpen={view.s.stillOpen} />
          <LengthSection config={config} rows={view.length} bins={view.bins} total={view.s.total} />
        </>
      )}
      <SourceNote source={config.source} className="mt-8" />
    </div>
  );
}

/* ---------------- Summary numbers ---------------- */

function Summary({
  config,
  s,
  p,
  compareLabel,
  aiBooked,
}: {
  config: DashboardConfig;
  s: AbandonedSummary;
  p: AbandonedSummary;
  compareLabel: string;
  aiBooked: number;
}) {
  const m = config.metrics;
  // "Got called back" moves with call volume, so its comparison would mislead; the % tile carries that story.
  const cells: {
    id: MetricId;
    label: string;
    value: number;
    prev: number;
    display: string;
    sub: string;
    tone?: string;
    bar?: number;
    noCompare?: boolean;
    isRate?: boolean;
  }[] = [
    { id: m.total, label: config.totalLabel, value: s.total, prev: p.total, display: fmtInt(s.total), sub: config.totalSub },
    {
      id: m.calledBack,
      label: "Got called back",
      value: s.calledBack,
      prev: p.calledBack,
      display: fmtInt(s.calledBack),
      sub: `Out of ${fmtInt(s.total)} ${config.noun} calls`,
      noCompare: true,
    },
    {
      id: m.stillOpen,
      label: "Still open",
      value: s.stillOpen,
      prev: p.stillOpen,
      display: fmtInt(s.stillOpen),
      sub: s.stillOpen ? "Nobody has called them yet" : "Everyone has been called",
      tone: s.stillOpen ? "text-alarm" : undefined,
    },
    {
      id: m.rate,
      label: "Called back",
      value: s.calledBackRate,
      prev: p.calledBackRate,
      display: s.total ? fmtPct(s.calledBackRate) : "–",
      sub: `Of ${config.noun} callers`,
      bar: s.calledBackRate,
      isRate: true,
    },
  ];
  return (
    <section aria-label="Summary">
      <div className="grid grid-cols-2 overflow-hidden rounded-[var(--radius-hero)] border border-line bg-panel lg:grid-cols-4">
        {cells.map((c, i) => {
          const def = metric(c.id);
          return (
            <div
              key={c.id}
              className={cn(
                "flex flex-col p-5 sm:p-6",
                i % 2 === 0 && "border-r border-line",
                i < 2 && "border-b border-line lg:border-b-0",
                i === 1 && "lg:border-r",
              )}
            >
              <div className="flex items-center gap-1.5 text-small text-muted-foreground">
                <span>{c.label}</span>
                <InfoTip id={c.id} label={c.label} />
              </div>
              <p className={cn("num mt-2 text-[2.5rem] leading-none font-semibold tracking-[-0.03em] sm:text-[3rem]", c.tone)}>{c.display}</p>
              <p className="mt-2 text-caption text-muted-foreground">{c.sub}</p>
              {c.bar !== undefined ? (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-subtle" aria-hidden>
                  <div className="h-full rounded-full bg-level-1 transition-[width] duration-500" style={{ width: `${Math.round(c.bar * 100)}%` }} />
                </div>
              ) : null}
              {c.noCompare ? (
                <p className="mt-auto pt-3 text-caption text-muted-foreground">See called back % for the trend</p>
              ) : (
                <Change
                  value={c.isRate && !s.total ? null : c.value}
                  previous={c.isRate && !p.total ? null : c.prev}
                  higherIsBetter={def.higherIsBetter}
                  format={def.format}
                  compareLabel={compareLabel}
                  className="mt-auto pt-3"
                />
              )}
            </div>
          );
        })}
      </div>
      {config.kind === "ai_agent" ? (
        <p className="mt-3 flex items-center gap-1.5 text-caption text-muted-foreground">
          <Info className="size-3.5" aria-hidden />
          Broccoli also booked {fmtInt(aiBooked)} {aiBooked === 1 ? "call" : "calls"} on its own in this period. Those need no call back and are not counted here.
        </p>
      ) : null}
    </section>
  );
}

/* ---------------- Shared table pieces ---------------- */

function LevelMark({ color }: { color: string }) {
  return <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />;
}

function ShareBar({ value, color }: { value: number; color: string }) {
  return (
    <span className="ml-auto block h-1.5 w-16 overflow-hidden rounded-full bg-subtle" aria-hidden>
      <span className="block h-full rounded-full" style={{ width: `${Math.max(value > 0 ? 4 : 0, value * 100)}%`, background: color }} />
    </span>
  );
}

/* ---------------- How fast are we calling back? ---------------- */

function SpeedSection({ config, rows, total, bins, stillOpen }: { config: DashboardConfig; rows: SpeedRow[]; total: SpeedRow; bins: Bins; stillOpen: number }) {
  const max = Math.max(1, ...rows.flatMap((r) => r.series));
  const fastest = rows[0].shareOfReturned + rows[1].shareOfReturned;
  const per = bins.unit;
  const sid = `${config.kind}-speed`;
  const wide = useIsWide();
  return (
    <section aria-labelledby={`${sid}-title`} className="mt-10 rounded-[var(--radius-panel)] border border-line bg-panel">
      <header className="flex flex-col gap-3 border-b border-line px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div>
          <h2 id={`${sid}-title`} className="flex items-center gap-1.5 text-section font-semibold">
            How fast are we calling back?
            <InfoTip id={config.metrics.speed} />
          </h2>
          <p className="mt-0.5 text-small text-muted-foreground">Time from {config.speedFrom} to our first call back, for callers we have called back.</p>
        </div>
        <p className="text-small">
          <span className="num font-semibold">{fmtPct(fastest)}</span> <span className="text-muted-foreground">called back within 15 minutes</span>
        </p>
      </header>

      {/* Desktop table */}
      {wide ? (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-small">
          <caption className="sr-only">How fast {config.noun} callers were called back</caption>
          <thead>
            <tr className="border-b border-line text-caption text-muted-foreground">
              <th scope="col" className="h-11 px-6 text-left font-medium">Speed</th>
              <th scope="col" className="px-4 text-right font-medium">Count</th>
              <th scope="col" className="px-4 text-right font-medium">% of returned</th>
              <th scope="col" className="px-4 text-right font-medium">Booked</th>
              <th scope="col" className="px-4 text-right font-medium">
                <span className="inline-flex items-center gap-1">
                  Book rate
                  <InfoTip id={config.metrics.bookRate} label="book rate" />
                </span>
              </th>
              <th scope="col" className="w-[13rem] px-6 text-left font-medium">Visual</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const color = LEVEL_COLOR[r.bucket.level];
              return (
                <tr key={r.bucket.id} className="border-b border-line">
                  <th scope="row" className="h-16 px-6 text-left font-medium">
                    <span className="flex items-center gap-3">
                      <LevelMark color={color} />
                      {r.bucket.label}
                    </span>
                  </th>
                  <td className="num px-4 text-right text-body font-semibold">{fmtInt(r.count)}</td>
                  <td className="num px-4 text-right">
                    <span className="flex items-center justify-end gap-3">
                      <ShareBar value={r.shareOfReturned} color={color} />
                      <span className="w-10">{fmtPct(r.shareOfReturned)}</span>
                    </span>
                  </td>
                  <td className="num px-4 text-right">{fmtInt(r.booked)}</td>
                  <td className="num px-4 text-right">{r.count ? fmtPct(r.bookRate) : "–"}</td>
                  <td className="px-6 py-2">
                    <Sparkline values={r.series} labels={bins.labels} color={color} name={`${sid} ${r.bucket.label}`} max={max} unit="call" per={per} />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-subtle/50">
              <th scope="row" className="h-14 px-6 text-left font-semibold">
                <span className="flex items-center gap-3">
                  <span className="h-8 w-1.5 shrink-0 rounded-full bg-ink/25" aria-hidden />
                  All called back
                </span>
              </th>
              <td className="num px-4 text-right text-body font-semibold">{fmtInt(total.count)}</td>
              <td className="num px-4 text-right font-medium">{total.count ? "100%" : "–"}</td>
              <td className="num px-4 text-right font-medium">{fmtInt(total.booked)}</td>
              <td className="num px-4 text-right font-medium">{total.count ? fmtPct(total.bookRate) : "–"}</td>
              <td className="px-6 py-2">
                <Sparkline values={total.series} labels={bins.labels} color="var(--ink)" name={`${sid} all called back`} max={Math.max(1, ...total.series)} unit="call" per={per} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      ) : (
      /* Phone: stacked rows */
      <ul className="divide-y divide-line">
        {rows.map((r) => {
          const color = LEVEL_COLOR[r.bucket.level];
          return (
            <li key={r.bucket.id} className="px-5 py-4">
              <div className="flex items-center gap-3">
                <LevelMark color={color} />
                <p className="flex-1 text-small font-semibold">{r.bucket.label}</p>
                <p className="num text-section font-semibold">{fmtInt(r.count)}</p>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 pl-[1.125rem] text-small">
                <div>
                  <dt className="text-caption text-muted-foreground">% of returned</dt>
                  <dd className="num font-medium">{fmtPct(r.shareOfReturned)}</dd>
                </div>
                <div>
                  <dt className="text-caption text-muted-foreground">Booked</dt>
                  <dd className="num font-medium">{fmtInt(r.booked)}</dd>
                </div>
                <div>
                  <dt className="text-caption text-muted-foreground">Book rate</dt>
                  <dd className="num font-medium">{r.count ? fmtPct(r.bookRate) : "–"}</dd>
                </div>
              </dl>
              <Sparkline className="mt-2 pl-[1.125rem]" values={r.series} labels={bins.labels} color={color} name={`${sid} m ${r.bucket.label}`} max={max} unit="call" per={per} />
            </li>
          );
        })}
        <li className="flex items-center justify-between bg-subtle/50 px-5 py-4 text-small">
          <span className="font-semibold">All called back</span>
          <span className="num">
            <span className="font-semibold">{fmtInt(total.count)}</span>, {fmtInt(total.booked)} booked ({total.count ? fmtPct(total.bookRate) : "–"})
          </span>
        </li>
      </ul>
      )}

      <footer className="flex flex-col gap-2 border-t border-line px-5 py-3 text-caption text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span className="flex items-center gap-2">
          <span className="flex h-2 w-16 overflow-hidden rounded-full" aria-hidden>
            {[1, 2, 3, 4, 5].map((l) => (
              <span key={l} className="h-full flex-1" style={{ background: LEVEL_COLOR[l] }} />
            ))}
          </span>
          Green is fastest, red is slowest. Each line shows calls per {per}.
        </span>
        <span>
          Overnight calls are timed from 7 am. {stillOpen ? `${fmtInt(stillOpen)} still open ${stillOpen === 1 ? "caller is" : "callers are"} not in this table.` : ""}
        </span>
      </footer>
    </section>
  );
}

/* ---------------- Call length ---------------- */

function LengthSection({ config, rows, bins, total }: { config: DashboardConfig; rows: LengthRow[]; bins: Bins; total: number }) {
  const max = Math.max(1, ...rows.flatMap((r) => r.series));
  const L = config.length;
  const within = rows[0].shareOfAbandoned;
  const over = total - rows[0].count;
  const onTarget = over === 0;
  const per = bins.unit;
  const lid = `${config.kind}-length`;
  const wide = useIsWide();
  const colorFor = (level: number) => (L.target ? LEVEL_COLOR[level] : NEUTRAL_COLOR);
  return (
    <section aria-labelledby={`${lid}-title`} className="mt-10 rounded-[var(--radius-panel)] border border-line bg-panel">
      <header className="flex flex-col gap-3 border-b border-line px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div>
          <h2 id={`${lid}-title`} className="flex items-center gap-1.5 text-section font-semibold">
            {L.title}
            <InfoTip id={config.metrics.length} />
          </h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-small text-muted-foreground">
            {L.target ? <Target className="size-3.5 shrink-0" aria-hidden /> : null}
            {L.rule}
          </p>
        </div>
        {L.target ? (
          <p
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-small font-medium sm:self-auto",
              onTarget ? "bg-success-tint text-success" : within >= 0.75 ? "bg-warm-tint text-warm-text" : "bg-alarm-tint text-alarm",
            )}
          >
            {onTarget ? <CheckCircle2 className="size-4" aria-hidden /> : <AlertCircle className="size-4" aria-hidden />}
            <span className="num">{onTarget ? "All within 10 seconds" : `${fmtPct(within)} within 10 seconds, ${fmtInt(over)} waited longer`}</span>
          </p>
        ) : (
          <p className="text-small">
            <span className="num font-semibold">{fmtPct(within)}</span> <span className="text-muted-foreground">ended in under 30 seconds</span>
          </p>
        )}
      </header>

      {/* Desktop table */}
      {wide ? (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-small">
          <caption className="sr-only">{L.title}</caption>
          <thead>
            <tr className="border-b border-line text-caption text-muted-foreground">
              <th scope="col" className="h-11 px-6 text-left font-medium">Length</th>
              <th scope="col" className="px-4 text-right font-medium">Count</th>
              <th scope="col" className="px-4 text-right font-medium">% of {L.unitLabel}</th>
              <th scope="col" className="w-[16rem] px-6 text-left font-medium">Visuals</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const color = colorFor(r.bucket.level);
              return (
                <tr key={r.bucket.id} className="border-b border-line last:border-b-0">
                  <th scope="row" className="h-16 px-6 text-left font-medium">
                    <span className="flex items-center gap-3">
                      <LevelMark color={color} />
                      {r.bucket.label}
                      {L.target && i === 0 ? <span className="rounded-full bg-success-tint px-2 py-0.5 text-caption font-medium text-success">Target</span> : null}
                    </span>
                  </th>
                  <td className="num px-4 text-right text-body font-semibold">{fmtInt(r.count)}</td>
                  <td className="num px-4 text-right">
                    <span className="flex items-center justify-end gap-3">
                      <ShareBar value={r.shareOfAbandoned} color={color} />
                      <span className="w-10">{fmtPct(r.shareOfAbandoned)}</span>
                    </span>
                  </td>
                  <td className="px-6 py-2">
                    <Sparkline values={r.series} labels={bins.labels} color={color} name={`${lid} ${r.bucket.label}`} max={max} unit="call" per={per} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      ) : (
      /* Phone: stacked rows */
      <ul className="divide-y divide-line">
        {rows.map((r, i) => {
          const color = colorFor(r.bucket.level);
          return (
            <li key={r.bucket.id} className="px-5 py-4">
              <div className="flex items-center gap-3">
                <LevelMark color={color} />
                <p className="flex flex-1 flex-wrap items-center gap-2 text-small font-semibold">
                  {r.bucket.label}
                  {L.target && i === 0 ? <span className="rounded-full bg-success-tint px-2 py-0.5 text-caption font-medium text-success">Target</span> : null}
                </p>
                <p className="num text-right">
                  <span className="block text-section font-semibold">{fmtInt(r.count)}</span>
                  <span className="block text-caption text-muted-foreground">
                    {fmtPct(r.shareOfAbandoned)} of {L.unitLabel}
                  </span>
                </p>
              </div>
              <Sparkline className="mt-2 pl-[1.125rem]" values={r.series} labels={bins.labels} color={color} name={`${lid} m ${r.bucket.label}`} max={max} unit="call" per={per} />
            </li>
          );
        })}
      </ul>
      )}

      <footer className="border-t border-line px-5 py-3 text-caption text-muted-foreground sm:px-6">{L.footer.replace("{per}", per)}</footer>
    </section>
  );
}
