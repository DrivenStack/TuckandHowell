"use client";

/**
 * Stats: every call back we owe, by platform (Broccoli, Dialpad, ServiceTitan, Lace).
 * Click a slice of the donut, or a row in the list, to see that platform in detail.
 */
import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Minus, MousePointerClick } from "lucide-react";
import { Cell, Pie, PieChart, Tooltip } from "recharts";
import { binCounts, SPEED_BUCKETS, timeBins } from "@/lib/metrics/abandoned";
import { buildLogIndex, callbackLog, PLATFORM_INFO, PLATFORMS, type CallbackRow, type CallbackType, type Platform } from "@/lib/metrics/callback-log";
import { fmtInt, fmtMinutes, fmtPct, median, type RangePreset } from "@/lib/metrics/calculations";
import { metric, type MetricId } from "@/lib/metrics/definitions";
import { fmt, fmtTime, MINUTE } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useLocalRange, useReady } from "@/components/app/hooks";
import { ChartBox, TooltipCard } from "@/components/charts/kit";
import { Sparkline } from "@/components/charts/sparkline";
import { DataTable, type Col } from "@/components/common/data-table";
import { Change } from "@/components/common/kpi";
import { DateRangePicker, EmptyState, InfoTip, PageHeader, PageSkeleton, SourceNote } from "@/components/common/page";

export const PLATFORM_COLOR: Record<Platform, string> = {
  Broccoli: "var(--platform-broccoli)",
  Dialpad: "var(--platform-dialpad)",
  ServiceTitan: "var(--platform-servicetitan)",
  Lace: "var(--platform-lace)",
};

const LEVEL = ["", "var(--level-1)", "var(--level-2)", "var(--level-3)", "var(--level-4)", "var(--level-5)"];

interface Summary {
  total: number;
  calledBack: number;
  stillOpen: number;
  rate: number;
}

function summarize(rows: CallbackRow[]): Summary {
  const calledBack = rows.filter((r) => r.doneByData).length;
  return { total: rows.length, calledBack, stillOpen: rows.length - calledBack, rate: rows.length ? calledBack / rows.length : 0 };
}

export function StatsView() {
  const ready = useReady();
  if (!ready) return <PageSkeleton kpis={4} charts={1} />;
  return <Stats />;
}

function Stats() {
  const { data } = useReady()!;
  const reduce = useReducedMotion();
  const [selected, setSelected] = useState<Platform | null>(null);
  const [preset, setPreset] = useState<RangePreset>("7d");
  const [custom, setCustom] = useState<{ from: number; to: number } | null>(null);
  const range = useLocalRange(preset, custom);

  const index = useMemo(() => buildLogIndex(data), [data]);
  const rows = useMemo(() => callbackLog(data, index, range.from, range.to), [data, index, range.from, range.to]);
  const prev = useMemo(() => callbackLog(data, index, range.compare.from, range.compare.to), [data, index, range.compare.from, range.compare.to]);
  const bins = useMemo(() => timeBins(range.from, range.to), [range.from, range.to]);
  const s = summarize(rows);
  const p = summarize(prev);
  const byPlatform = useMemo(() => {
    const m = new Map<Platform, CallbackRow[]>(PLATFORMS.map((pl) => [pl, []]));
    for (const r of rows) m.get(r.platform)!.push(r);
    return m;
  }, [rows]);
  const select = (pl: Platform) => setSelected((cur) => (cur === pl ? null : pl));

  return (
    <div>
      <PageHeader
        title="Stats"
        description="Every call back we owe, from every platform. Click a slice of the chart to see that platform's details."
        actions={
          <DateRangePicker
            value={preset}
            custom={custom}
            onChange={(pr, c) => {
              setPreset(pr);
              setCustom(c ?? null);
            }}
          />
        }
      />

      <SummaryTiles s={s} p={p} compareLabel={range.compare.label} />

      {s.total === 0 ? (
        <EmptyState title="No call backs in this period" className="mt-8 rounded-[var(--radius-panel)] border border-dashed border-line-strong">
          Pick a longer date range to see past call backs.
        </EmptyState>
      ) : (
        <>
          <section aria-labelledby="chart-title" className="mt-8 rounded-[var(--radius-panel)] border border-line bg-panel">
            <header className="border-b border-line px-5 py-4 sm:px-6">
              <h2 id="chart-title" className="flex items-center gap-1.5 text-section font-semibold">
                Call backs by platform
                <InfoTip id="callbacks_total" />
              </h2>
              <p className="mt-0.5 text-small text-muted-foreground">Where the call backs we owe came from. Abandoned calls count as call backs too.</p>
            </header>
            <div className="grid items-center gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-10">
              <Donut byPlatform={byPlatform} total={s.total} selected={selected} onSelect={select} />
              <ul className="space-y-1.5" aria-label="Platforms">
                {PLATFORMS.map((pl) => {
                  const list = byPlatform.get(pl)!;
                  const share = s.total ? list.length / s.total : 0;
                  const active = selected === pl;
                  const open = list.filter((r) => !r.doneByData).length;
                  return (
                    <li key={pl}>
                      <button
                        type="button"
                        onClick={() => select(pl)}
                        aria-pressed={active}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-[12px] px-3 py-3 text-left transition-colors",
                          active ? "bg-subtle ring-1 ring-line-strong" : "hover:bg-subtle/70",
                          selected && !active && "opacity-55",
                        )}
                      >
                        <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: PLATFORM_COLOR[pl] }} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block text-body font-semibold">{pl}</span>
                          <span className="block truncate text-caption text-muted-foreground">
                            {fmtInt(list.length)} call backs{open ? `, ${fmtInt(open)} still open` : ", all called back"}
                          </span>
                        </span>
                        <span className="num text-[1.5rem] leading-none font-semibold tracking-[-0.02em]">{fmtPct(share)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>

          <AnimatePresence mode="wait">
            {selected ? (
              <motion.div
                key={selected}
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
              >
                <Details platform={selected} rows={byPlatform.get(selected)!} total={s.total} bins={bins} csrs={data.csrs} />
              </motion.div>
            ) : (
              <motion.div key="hint" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <p className="mt-6 flex items-center justify-center gap-2 rounded-[var(--radius-panel)] border border-dashed border-line-strong px-5 py-8 text-center text-small text-muted-foreground">
                  <MousePointerClick className="size-4 shrink-0" aria-hidden />
                  Click a slice of the chart, or a platform in the list, to see its details here.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
      <SourceNote source="ServiceTitan, Dialpad, the Broccoli AI Voice Agent and Lace AI" className="mt-8" />
    </div>
  );
}

/* ---------------- Summary numbers ---------------- */

function SummaryTiles({ s, p, compareLabel }: { s: Summary; p: Summary; compareLabel: string }) {
  // "Got called back" moves with volume, and "Still open" always looks worse for recent periods (older call backs
  // have had time to be done), so neither gets a comparison; the % tile carries the trend.
  const cells: { id: MetricId; label: string; value: number | null; prev: number | null; display: string; sub: string; tone?: string; bar?: number; noCompare?: boolean }[] = [
    { id: "callbacks_total", label: "Call backs owed", value: s.total, prev: p.total, display: fmtInt(s.total), sub: "From all four platforms" },
    { id: "callbacks_called_back", label: "Got called back", value: s.calledBack, prev: null, display: fmtInt(s.calledBack), sub: `Out of ${fmtInt(s.total)}`, noCompare: true },
    {
      id: "callbacks_still_open",
      label: "Still open",
      value: s.stillOpen,
      prev: p.stillOpen,
      display: fmtInt(s.stillOpen),
      sub: s.stillOpen ? "Nobody has called them yet" : "Everyone has been called",
      tone: s.stillOpen ? "text-alarm" : undefined,
      noCompare: true,
    },
    {
      id: "callbacks_called_back_rate",
      label: "Called back",
      value: s.total ? s.rate : null,
      prev: p.total ? p.rate : null,
      display: s.total ? fmtPct(s.rate) : "–",
      sub: "Of all call backs owed",
      bar: s.rate,
    },
  ];
  return (
    <section aria-label="Summary" className="grid grid-cols-2 overflow-hidden rounded-[var(--radius-hero)] border border-line bg-panel lg:grid-cols-4">
      {cells.map((c, i) => {
        const def = metric(c.id);
        return (
          <div key={c.id} className={cn("flex flex-col p-5 sm:p-6", i % 2 === 0 && "border-r border-line", i < 2 && "border-b border-line lg:border-b-0", i === 1 && "lg:border-r")}>
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
              <p className="mt-auto pt-3 text-caption text-muted-foreground">{c.id === "callbacks_still_open" ? "Live, right now" : "See called back % for the trend"}</p>
            ) : (
              <Change value={c.value} previous={c.prev} higherIsBetter={def.higherIsBetter} format={def.format} compareLabel={compareLabel} className="mt-auto pt-3" />
            )}
          </div>
        );
      })}
    </section>
  );
}

/* ---------------- Donut ---------------- */

function Donut({
  byPlatform,
  total,
  selected,
  onSelect,
}: {
  byPlatform: Map<Platform, CallbackRow[]>;
  total: number;
  selected: Platform | null;
  onSelect: (p: Platform) => void;
}) {
  const data = PLATFORMS.map((pl) => ({ id: pl, value: byPlatform.get(pl)!.length, color: PLATFORM_COLOR[pl] })).filter((d) => d.value > 0);
  const sel = selected ? data.find((d) => d.id === selected) : undefined;
  const center = sel ? { big: fmtPct(sel.value / total), small: sel.id } : { big: fmtInt(total), small: "call backs" };
  return (
    <div className="relative mx-auto w-full max-w-[22rem]">
      <ChartBox height={300} label={`Donut chart of call backs by platform: ${data.map((d) => `${d.id} ${d.value}`).join(", ")}.`}>
        <PieChart>
          <Tooltip
            content={({ active, payload }) => {
              const d = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !d) return null;
              return (
                <TooltipCard
                  title={d.id}
                  rows={[
                    { label: "Call backs", value: fmtInt(d.value), color: d.color },
                    { label: "Share", value: fmtPct(d.value / total), strong: true },
                  ]}
                  footer="Click to see details"
                />
              );
            }}
          />
          <Pie
            data={data}
            dataKey="value"
            nameKey="id"
            innerRadius="62%"
            outerRadius="96%"
            paddingAngle={data.length > 1 ? 1.5 : 0}
            cornerRadius={5}
            stroke="var(--panel)"
            strokeWidth={2}
            startAngle={90}
            endAngle={-270}
            isAnimationActive={false}
            onClick={(_, i) => onSelect(data[i].id)}
            className="cursor-pointer outline-none"
          >
            {data.map((d) => (
              <Cell key={d.id} fill={d.color} fillOpacity={selected && selected !== d.id ? 0.25 : 1} className="transition-[fill-opacity] duration-200" />
            ))}
          </Pie>
        </PieChart>
      </ChartBox>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-16 text-center" aria-hidden>
        <span className="num text-[2.5rem] leading-none font-semibold tracking-[-0.03em]">{center.big}</span>
        <span className="mt-1.5 text-small leading-tight text-muted-foreground">{center.small}</span>
      </div>
    </div>
  );
}

/* ---------------- Platform details ---------------- */

function Details({
  platform,
  rows,
  total,
  bins,
  csrs,
}: {
  platform: Platform;
  rows: CallbackRow[];
  total: number;
  bins: ReturnType<typeof timeBins>;
  csrs: { id: string; name: string }[];
}) {
  const color = PLATFORM_COLOR[platform];
  const n = rows.length;
  const s = summarize(rows);
  const returned = rows.filter((r) => r.returnMs !== null);
  const booked = rows.filter((r) => r.booked).length;
  const typical = returned.length ? median(returned.map((r) => r.returnMs!)) / MINUTE : null;
  const series = binCounts(bins, rows.map((r) => r.at));
  const names = new Map(csrs.map((c) => [c.id, c.name]));

  const types = new Map<CallbackType, number>();
  for (const r of rows) types.set(r.type, (types.get(r.type) ?? 0) + 1);

  const speed = [
    ...SPEED_BUCKETS.map((b) => ({ label: b.label, color: LEVEL[b.level], count: returned.filter((r) => b.test(r.returnMs!)).length })),
    { label: "Still open", color: "var(--ink)", count: rows.filter((r) => r.returnMs === null).length },
  ];

  const stats = [
    { label: "Call backs", value: fmtInt(n) },
    { label: "Called back", value: n ? fmtPct(s.rate) : "–" },
    { label: "Still open", value: fmtInt(s.stillOpen), tone: s.stillOpen ? "text-alarm" : undefined },
    { label: "Booked", value: fmtInt(booked) },
    { label: "Book rate", value: s.calledBack ? fmtPct(booked / s.calledBack) : "–" },
    { label: "Typical callback speed", value: fmtMinutes(typical) },
  ];

  const columns: Col<CallbackRow>[] = [
    { id: "date", header: "Call date", value: (r) => r.at, cell: (r) => <span className="num whitespace-nowrap">{fmt(r.at, "MMM d")}</span> },
    { id: "time", header: "Time", value: (r) => Number(fmt(r.at, "HHmm")), cell: (r) => <span className="num whitespace-nowrap">{fmtTime(r.at)}</span> },
    { id: "type", header: "Type", value: (r) => r.type, cell: (r) => <span className="whitespace-nowrap">{r.type}</span> },
    { id: "name", header: "Customer name", mobile: "title", value: (r) => r.customerName, cell: (r) => <span className="font-medium whitespace-nowrap">{r.customerName}</span> },
    { id: "phone", header: "Caller phone", value: (r) => r.phone, cell: (r) => <span className="num whitespace-nowrap">{r.phone}</span> },
    {
      id: "assigned",
      header: "Assigned to",
      value: (r) => (r.assignedCsrId ? names.get(r.assignedCsrId) ?? "" : ""),
      cell: (r) =>
        r.assignedCsrId ? (
          <span className="whitespace-nowrap">{names.get(r.assignedCsrId)}</span>
        ) : (
          <span className="whitespace-nowrap text-muted-foreground">{r.type === "Web form" ? "Unassigned" : "After hours"}</span>
        ),
    },
    {
      id: "speed",
      header: "Called back after",
      align: "right",
      value: (r) => r.returnMs,
      cell: (r) => (r.returnMs === null ? <span className="font-medium text-alarm">Still open</span> : fmtMinutes(r.returnMs / MINUTE)),
    },
    {
      id: "reached",
      header: "Reached CSR?",
      value: (r) => (r.reachedCsr ? 1 : 0),
      cell: (r) =>
        r.reachedCsr ? (
          <span className="inline-flex items-center gap-1 font-medium text-success">
            <Check className="size-4" aria-hidden />
            Yes
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Minus className="size-4" aria-hidden />
            No
          </span>
        ),
    },
  ];

  return (
    <section aria-label={`Details: ${platform}`} className="mt-6 overflow-hidden rounded-[var(--radius-panel)] border border-line bg-panel">
      <div className="h-1.5" style={{ background: color }} aria-hidden />
      <div className="grid gap-8 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-10">
        <div>
          <p className="flex items-center gap-2 text-body font-semibold">
            <span className="size-3 rounded-[4px]" style={{ background: color }} aria-hidden />
            {platform}
          </p>
          <p className="mt-3 flex items-baseline gap-3">
            <span className="num text-[3.5rem] leading-none font-semibold tracking-[-0.035em]">{fmtPct(total ? n / total : 0)}</span>
            <span className="text-small text-muted-foreground">of {fmtInt(total)} call backs</span>
          </p>
          <p className="mt-2 text-small text-muted-foreground">{PLATFORM_INFO[platform]}</p>
          {types.size > 1 ? (
            <p className="mt-2 text-small">
              {[...types.entries()].map(([t, c], i) => (
                <span key={t}>
                  {i > 0 ? " and " : ""}
                  <span className="num font-semibold">{fmtInt(c)}</span> {t.toLowerCase()}
                </span>
              ))}
            </p>
          ) : null}
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            {stats.map((st) => (
              <div key={st.label}>
                <dt className="text-caption text-muted-foreground">{st.label}</dt>
                <dd className={cn("num mt-0.5 text-section font-semibold", st.tone)}>{st.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <p className="text-small font-medium">Call backs per {bins.unit}</p>
          <p className="text-caption text-muted-foreground">When these requests came in during the period.</p>
          <Sparkline className="mt-3 h-32" values={series} labels={bins.labels} color={color} name={`${platform} call backs`} max={Math.max(1, ...series)} unit="call back" per={bins.unit} />
        </div>
      </div>

      {/* How fast we called back, for this platform */}
      <div className="border-t border-line px-5 py-5 sm:px-6">
        <p className="flex items-center gap-1.5 text-small font-medium">
          How fast we called back
          <InfoTip id="callbacks_speed" />
        </p>
        <div className="mt-3 flex h-3 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={speed.map((x) => `${x.label} ${x.count}`).join(", ")}>
          {speed.map((x) => (x.count ? <span key={x.label} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(x.count / n) * 100}%`, background: x.color }} /> : null))}
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
          {speed.map((x) => (
            <li key={x.label} className="flex items-start gap-2 text-caption">
              <span className="mt-0.5 size-2.5 shrink-0 rounded-[3px]" style={{ background: x.color }} aria-hidden />
              <span>
                <span className="block text-muted-foreground">{x.label}</span>
                <span className="num text-small font-semibold">
                  {fmtInt(x.count)} <span className="font-normal text-muted-foreground">({fmtPct(n ? x.count / n : 0)})</span>
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-line p-5 sm:p-6">
        <h3 className="mb-3 text-small font-semibold">{platform} call backs</h3>
        <DataTable
          caption={`${platform} call backs`}
          rows={rows}
          columns={columns}
          rowKey={(r) => r.id}
          initialSort={{ id: "date", desc: true }}
          pageSize={10}
          empty={<EmptyState title={`No ${platform} call backs`}>Pick another platform or a longer date range.</EmptyState>}
        />
      </div>
    </section>
  );
}
