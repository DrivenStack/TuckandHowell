"use client";

/**
 * Stats: every call back we owe, live from ServiceTitan, by type (Abandoned, Missed).
 * Click a slice of the donut, or a row in the list, to see that type in detail.
 */
import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Minus, MousePointerClick } from "lucide-react";
import { Cell, Pie, PieChart, Tooltip } from "recharts";
import { binCounts, CALLBACK_TYPES, SPEED_BUCKETS, summarize, timeBins, type CallbackRow, type CallbackSummary, type CallbackType } from "@/lib/callbacks/live";
import { fmtInt, fmtMinutes, fmtPct, median } from "@/lib/format";
import { metric, type MetricId } from "@/lib/metrics/definitions";
import type { RangePreset } from "@/lib/range";
import { fmt, fmtTime, MINUTE } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useLiveCallbacks, useLocalRange } from "@/components/app/hooks";
import { ChartBox, TooltipCard } from "@/components/charts/kit";
import { Sparkline } from "@/components/charts/sparkline";
import { DataTable, type Col } from "@/components/common/data-table";
import { Change } from "@/components/common/kpi";
import { DateRangePicker, EmptyState, InfoTip, PageHeader, SourceNote } from "@/components/common/page";
import { ConnectionError, LiveLoading, StaleNotice } from "./callbacks";

const TYPE_COLOR: Record<CallbackType, string> = {
  Missed: "var(--type-missed)",
  Abandoned: "var(--type-abandoned)",
};

const TYPE_INFO: Record<CallbackType, string> = {
  Abandoned: "Callers who hung up before anyone answered. ServiceTitan marks these with the call type Abandoned.",
  Missed: "Inbound calls that no agent answered and that were not marked Abandoned.",
};

const LEVEL = ["", "var(--level-1)", "var(--level-2)", "var(--level-3)", "var(--level-4)", "var(--level-5)"];

export function StatsView() {
  const reduce = useReducedMotion();
  const [selected, setSelected] = useState<CallbackType | null>(null);
  const [preset, setPreset] = useState<RangePreset>("7d");
  const [custom, setCustom] = useState<{ from: number; to: number } | null>(null);
  const range = useLocalRange(preset, custom);
  const live = useLiveCallbacks(range.from ? range : null);
  const prevLive = useLiveCallbacks(range.from ? { ...range, from: range.compare.from, to: range.compare.to } : null);

  const rows = live.rows;
  const bins = useMemo(() => timeBins(range.from, range.to), [range.from, range.to]);
  const s = summarize(rows);
  const p = prevLive.status === "ready" ? summarize(prevLive.rows) : null;
  const byType = useMemo(() => {
    const m = new Map<CallbackType, CallbackRow[]>(CALLBACK_TYPES.map((t) => [t, []]));
    for (const r of rows) m.get(r.type)!.push(r);
    return m;
  }, [rows]);
  const select = (t: CallbackType) => setSelected((cur) => (cur === t ? null : t));

  return (
    <div>
      <PageHeader
        title="Stats"
        description="Every missed and abandoned call, live from ServiceTitan. Click a slice of the chart to see its details."
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

      {live.status === "loading" ? (
        <LiveLoading />
      ) : live.status === "error" ? (
        <ConnectionError message={live.error} />
      ) : (
        <>
          <StaleNotice error={live.error} />
          <SummaryTiles s={s} p={p} compareLabel={range.compare.label} />

          {s.total === 0 ? (
            <EmptyState title="No missed or abandoned calls in this period" className="mt-8 rounded-[var(--radius-panel)] border border-dashed border-line-strong">
              Pick a longer date range to see past calls. New ones appear within 15 seconds.
            </EmptyState>
          ) : (
            <>
              <section aria-labelledby="chart-title" className="mt-8 rounded-[var(--radius-panel)] border border-line bg-panel">
                <header className="border-b border-line px-5 py-4 sm:px-6">
                  <h2 id="chart-title" className="flex items-center gap-1.5 text-section font-semibold">
                    Call backs by type
                    <InfoTip id="callbacks_total" />
                  </h2>
                  <p className="mt-0.5 text-small text-muted-foreground">Every inbound call nobody answered, from ServiceTitan.</p>
                </header>
                <div className="grid items-center gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-10">
                  <Donut byType={byType} total={s.total} selected={selected} onSelect={select} />
                  <ul className="space-y-1.5" aria-label="Types">
                    {CALLBACK_TYPES.map((t) => {
                      const list = byType.get(t)!;
                      const share = s.total ? list.length / s.total : 0;
                      const active = selected === t;
                      const open = list.filter((r) => !r.doneByData).length;
                      return (
                        <li key={t}>
                          <button
                            type="button"
                            onClick={() => select(t)}
                            aria-pressed={active}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-[12px] px-3 py-3 text-left transition-colors",
                              active ? "bg-subtle ring-1 ring-line-strong" : "hover:bg-subtle/70",
                              selected && !active && "opacity-55",
                            )}
                          >
                            <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: TYPE_COLOR[t] }} aria-hidden />
                            <span className="min-w-0 flex-1">
                              <span className="block text-body font-semibold">{t}</span>
                              <span className="block truncate text-caption text-muted-foreground">
                                {fmtInt(list.length)} calls{open ? `, ${fmtInt(open)} still open` : ", all called back"}
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
                    <Details type={selected} rows={byType.get(selected)!} total={s.total} bins={bins} />
                  </motion.div>
                ) : (
                  <motion.div key="hint" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <p className="mt-6 flex items-center justify-center gap-2 rounded-[var(--radius-panel)] border border-dashed border-line-strong px-5 py-8 text-center text-small text-muted-foreground">
                      <MousePointerClick className="size-4 shrink-0" aria-hidden />
                      Click a slice of the chart, or a type in the list, to see its details here.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </>
      )}
      <SourceNote source="ServiceTitan, live" className="mt-8" />
    </div>
  );
}

/* ---------------- Summary numbers ---------------- */

function SummaryTiles({ s, p, compareLabel }: { s: CallbackSummary; p: CallbackSummary | null; compareLabel: string }) {
  // "Got called back" moves with volume, and "Still open" always looks worse for recent periods
  // (older call backs have had time to be done), so neither gets a comparison.
  const cells: { id: MetricId; label: string; value: number | null; prev: number | null; display: string; sub: string; tone?: string; bar?: number; note?: string }[] = [
    { id: "callbacks_total", label: "Missed and abandoned", value: s.total, prev: p?.total ?? null, display: fmtInt(s.total), sub: "Inbound calls nobody answered" },
    { id: "callbacks_called_back", label: "Got called back", value: null, prev: null, display: fmtInt(s.calledBack), sub: `Out of ${fmtInt(s.total)}`, note: "See called back % for the trend" },
    {
      id: "callbacks_still_open",
      label: "Still open",
      value: null,
      prev: null,
      display: fmtInt(s.stillOpen),
      sub: s.stillOpen ? "Nobody has called them yet" : "Everyone has been called",
      tone: s.stillOpen ? "text-alarm" : undefined,
      note: "Live, right now",
    },
    {
      id: "callbacks_called_back_rate",
      label: "Called back",
      value: s.total ? s.rate : null,
      prev: p?.total ? p.rate : null,
      display: s.total ? fmtPct(s.rate) : "–",
      sub: "Of missed and abandoned calls",
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
            {c.note ? (
              <p className="mt-auto pt-3 text-caption text-muted-foreground">{c.note}</p>
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
  byType,
  total,
  selected,
  onSelect,
}: {
  byType: Map<CallbackType, CallbackRow[]>;
  total: number;
  selected: CallbackType | null;
  onSelect: (t: CallbackType) => void;
}) {
  const data = CALLBACK_TYPES.map((t) => ({ id: t, value: byType.get(t)!.length, color: TYPE_COLOR[t] })).filter((d) => d.value > 0);
  const sel = selected ? data.find((d) => d.id === selected) : undefined;
  const center = sel ? { big: fmtPct(sel.value / total), small: sel.id } : { big: fmtInt(total), small: "calls to return" };
  return (
    <div className="relative mx-auto w-full max-w-[22rem]">
      <ChartBox height={300} label={`Donut chart of missed and abandoned calls: ${data.map((d) => `${d.id} ${d.value}`).join(", ")}.`}>
        <PieChart>
          <Tooltip
            content={({ active, payload }) => {
              const d = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !d) return null;
              return (
                <TooltipCard
                  title={d.id}
                  rows={[
                    { label: "Calls", value: fmtInt(d.value), color: d.color },
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

/* ---------------- Type details ---------------- */

function Details({ type, rows, total, bins }: { type: CallbackType; rows: CallbackRow[]; total: number; bins: ReturnType<typeof timeBins> }) {
  const color = TYPE_COLOR[type];
  const n = rows.length;
  const s = summarize(rows);
  const returned = rows.filter((r) => r.returnMs !== null);
  const reached = rows.filter((r) => r.reachedCsr).length;
  const typical = returned.length ? median(returned.map((r) => r.returnMs!)) / MINUTE : null;
  const series = binCounts(bins, rows.map((r) => r.at));
  const voicemails = rows.filter((r) => r.voicemail).length;

  const speed = [
    ...SPEED_BUCKETS.map((b) => ({ label: b.label, color: LEVEL[b.level], count: returned.filter((r) => b.test(r.returnMs!)).length })),
    { label: "Still open", color: "var(--ink)", count: rows.filter((r) => r.returnMs === null).length },
  ];

  const stats = [
    { label: "Calls", value: fmtInt(n) },
    { label: "Called back", value: n ? fmtPct(s.rate) : "–" },
    { label: "Still open", value: fmtInt(s.stillOpen), tone: s.stillOpen ? "text-alarm" : undefined },
    { label: "Reached a CSR", value: fmtInt(reached) },
    { label: "Left a voicemail", value: fmtInt(voicemails) },
    { label: "Typical callback speed", value: fmtMinutes(typical) },
  ];

  const columns: Col<CallbackRow>[] = [
    { id: "date", header: "Call date", value: (r) => r.at, cell: (r) => <span className="num whitespace-nowrap">{fmt(r.at, "MMM d")}</span> },
    { id: "time", header: "Time", value: (r) => Number(fmt(r.at, "HHmm")), cell: (r) => <span className="num whitespace-nowrap">{fmtTime(r.at)}</span> },
    { id: "name", header: "Customer name", mobile: "title", value: (r) => r.customerName, cell: (r) => <span className="font-medium whitespace-nowrap">{r.customerName}</span> },
    { id: "phone", header: "Caller phone", value: (r) => r.phone, cell: (r) => <span className="num whitespace-nowrap">{r.phone}</span> },
    { id: "length", header: "Length (sec)", align: "right", value: (r) => r.lengthSec, cell: (r) => fmtInt(r.lengthSec) },
    { id: "by", header: "Called back by", value: (r) => r.calledBackBy ?? "", cell: (r) => (r.calledBackBy ? <span className="whitespace-nowrap">{r.calledBackBy}</span> : <span className="text-muted-foreground">–</span>) },
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
    <section aria-label={`Details: ${type}`} className="mt-6 overflow-hidden rounded-[var(--radius-panel)] border border-line bg-panel">
      <div className="h-1.5" style={{ background: color }} aria-hidden />
      <div className="grid gap-8 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-10">
        <div>
          <p className="flex items-center gap-2 text-body font-semibold">
            <span className="size-3 rounded-[4px]" style={{ background: color }} aria-hidden />
            {type}
          </p>
          <p className="mt-3 flex items-baseline gap-3">
            <span className="num text-[3.5rem] leading-none font-semibold tracking-[-0.035em]">{fmtPct(total ? n / total : 0)}</span>
            <span className="text-small text-muted-foreground">of {fmtInt(total)} calls to return</span>
          </p>
          <p className="mt-2 text-small text-muted-foreground">{TYPE_INFO[type]}</p>
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
          <p className="text-small font-medium">Calls per {bins.unit}</p>
          <p className="text-caption text-muted-foreground">When these calls came in during the period.</p>
          <Sparkline className="mt-3 h-32" values={series} labels={bins.labels} color={color} name={`${type} calls`} max={Math.max(1, ...series)} unit="call" per={bins.unit} />
        </div>
      </div>

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
        <h3 className="mb-3 text-small font-semibold">{type} calls</h3>
        <DataTable
          caption={`${type} calls`}
          rows={rows}
          columns={columns}
          rowKey={(r) => r.id}
          initialSort={{ id: "date", desc: true }}
          pageSize={10}
          empty={<EmptyState title={`No ${type.toLowerCase()} calls`}>Pick another type or a longer date range.</EmptyState>}
        />
      </div>
    </section>
  );
}
