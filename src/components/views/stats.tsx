"use client";

/**
 * Stats: Abandoned and Broccoli calls in one place.
 * Pick a type, see the summary, then click a slice of the donut to see that slice in detail.
 */
import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bot, Check, Info, Minus, MousePointerClick, PhoneOff, type LucideIcon } from "lucide-react";
import { Cell, Pie, PieChart, Tooltip } from "recharts";
import {
  AI_LENGTH_BUCKETS,
  aiBookedCount,
  binCounts,
  buildContactIndex,
  followUpCalls,
  LENGTH_BUCKETS,
  SPEED_BUCKETS,
  summarize,
  timeBins,
  type AbandonedCall,
  type AbandonedSummary,
  type FollowUpKind,
} from "@/lib/metrics/abandoned";
import { buildLogIndex, callbackLog, type CallbackRow } from "@/lib/metrics/callback-log";
import { fmtInt, fmtPct, median, type RangePreset } from "@/lib/metrics/calculations";
import { metric, type MetricId } from "@/lib/metrics/definitions";
import { fmt, fmtTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useLocalRange, useReady } from "@/components/app/hooks";
import { ChartBox, TooltipCard } from "@/components/charts/kit";
import { Sparkline } from "@/components/charts/sparkline";
import { DataTable, type Col } from "@/components/common/data-table";
import { Change } from "@/components/common/kpi";
import { DateRangePicker, EmptyState, InfoTip, PageHeader, PageSkeleton, SourceNote } from "@/components/common/page";

const LEVEL = ["", "var(--level-1)", "var(--level-2)", "var(--level-3)", "var(--level-4)", "var(--level-5)"];
/** Single-hue steps for call length with Broccoli, where longer is not better or worse */
const BLUE_STEPS = [
  "color-mix(in oklab, var(--series-csr) 50%, var(--panel))",
  "color-mix(in oklab, var(--series-csr) 75%, var(--panel))",
  "var(--series-csr)",
  "color-mix(in oklab, var(--series-csr) 72%, var(--ink))",
  "color-mix(in oklab, var(--series-csr) 50%, var(--ink))",
];
const BLUE = (i: number) => BLUE_STEPS[i];
const OPEN_COLOR = "var(--ink)";

interface KindConfig {
  kind: FollowUpKind;
  label: string;
  icon: LucideIcon;
  noun: string;
  totalSub: string;
  source: string;
  metrics: { total: MetricId; calledBack: MetricId; stillOpen: MetricId; rate: MetricId; speed: MetricId; length: MetricId };
  lengthTitle: string;
  lengthHint: string;
}

const KINDS: Record<FollowUpKind, KindConfig> = {
  abandoned: {
    kind: "abandoned",
    label: "Abandoned",
    icon: PhoneOff,
    noun: "abandoned",
    totalSub: "Hung up while waiting on hold",
    source: "ServiceTitan",
    metrics: {
      total: "abandoned_calls",
      calledBack: "abandoned_called_back",
      stillOpen: "abandoned_still_open",
      rate: "abandoned_called_back_rate",
      speed: "abandoned_speed",
      length: "abandoned_hang_up_length",
    },
    lengthTitle: "Call length before hang-up",
    lengthHint: "Rule of thumb: all should be 10 seconds or less.",
  },
  ai_agent: {
    kind: "ai_agent",
    label: "Broccoli",
    icon: Bot,
    noun: "Broccoli",
    totalSub: "Did not book with the AI",
    source: "Broccoli AI Voice Agent, via ServiceTitan",
    metrics: {
      total: "broccoli_calls",
      calledBack: "broccoli_called_back",
      stillOpen: "broccoli_still_open",
      rate: "broccoli_called_back_rate",
      speed: "broccoli_speed",
      length: "broccoli_call_length",
    },
    lengthTitle: "Call length with Broccoli",
    lengthHint: "How long callers talked with the AI. Very short calls often mean they hung up on it.",
  },
};

type ViewBy = "speed" | "length";

interface Slice {
  id: string;
  label: string;
  color: string;
  items: AbandonedCall[];
  note: string;
}

function buildSlices(items: AbandonedCall[], kind: FollowUpKind, view: ViewBy): Slice[] {
  if (view === "speed") {
    const slices: Slice[] = SPEED_BUCKETS.map((b) => ({
      id: b.id,
      label: `Called back ${b.label.charAt(0).toLowerCase()}${b.label.slice(1)}`,
      color: LEVEL[b.level],
      items: items.filter((i) => i.returnMs !== null && b.test(i.returnMs)),
      note: b.level <= 2 ? "Fast. Callers reached this quickly book most often." : b.level === 3 ? "Within the hour." : "Slow. Many callers have moved on by now.",
    }));
    slices.push({
      id: "open",
      label: "Still open",
      color: OPEN_COLOR,
      items: items.filter((i) => i.returnMs === null),
      note: "Nobody has called these customers back yet.",
    });
    return slices;
  }
  const buckets = kind === "abandoned" ? LENGTH_BUCKETS : AI_LENGTH_BUCKETS;
  return buckets.map((b, i) => ({
    id: b.id,
    label: b.label,
    color: kind === "abandoned" ? LEVEL[b.level] : BLUE(i),
    items: items.filter((it) => b.test(it.call.durationSec)),
    note: kind === "abandoned" ? (i === 0 ? "On target: gave up within 10 seconds." : "Waited on hold longer than the 10 second rule of thumb.") : "Time spent talking with Broccoli before the call ended.",
  }));
}

export function StatsView() {
  const ready = useReady();
  if (!ready) return <PageSkeleton kpis={4} charts={1} />;
  return <Stats />;
}

function Stats() {
  const { data } = useReady()!;
  const reduce = useReducedMotion();
  const [kind, setKind] = useState<FollowUpKind>("abandoned");
  const [view, setView] = useState<ViewBy>("speed");
  const [selected, setSelected] = useState<string | null>(null);
  const [preset, setPreset] = useState<RangePreset>("7d");
  const [custom, setCustom] = useState<{ from: number; to: number } | null>(null);
  const range = useLocalRange(preset, custom);
  const cfg = KINDS[kind];

  const contactIndex = useMemo(() => buildContactIndex(data), [data]);
  const logIndex = useMemo(() => buildLogIndex(data), [data]);
  const all = useMemo(() => {
    const out: Record<FollowUpKind, { items: AbandonedCall[]; prev: AbandonedCall[] }> = {
      abandoned: {
        items: followUpCalls(data, contactIndex, range.from, range.to, "abandoned"),
        prev: followUpCalls(data, contactIndex, range.compare.from, range.compare.to, "abandoned"),
      },
      ai_agent: {
        items: followUpCalls(data, contactIndex, range.from, range.to, "ai_agent"),
        prev: followUpCalls(data, contactIndex, range.compare.from, range.compare.to, "ai_agent"),
      },
    };
    return out;
  }, [data, contactIndex, range.from, range.to, range.compare.from, range.compare.to]);
  const rows = useMemo(() => new Map(callbackLog(data, logIndex, range.from, range.to).map((r) => [r.callId, r])), [data, logIndex, range.from, range.to]);
  const bins = useMemo(() => timeBins(range.from, range.to), [range.from, range.to]);

  const items = all[kind].items;
  const s = summarize(items);
  const p = summarize(all[kind].prev);
  const slices = useMemo(() => buildSlices(items, kind, view), [items, kind, view]);
  const sel = slices.find((x) => x.id === selected) ?? null;
  const select = (id: string | null) => setSelected((cur) => (cur === id ? null : id));

  return (
    <div>
      <PageHeader
        title="Stats"
        description="Abandoned and Broccoli calls at a glance. Pick a type, then click a slice of the chart to see its details."
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

      {/* Type switch */}
      <div role="radiogroup" aria-label="Which calls" className="mb-6 grid grid-cols-2 gap-1 rounded-[14px] border border-line bg-panel p-1 sm:inline-grid sm:min-w-[26rem]">
        {(Object.values(KINDS) as KindConfig[]).map((k) => {
          const active = kind === k.kind;
          return (
            <button
              key={k.kind}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                setKind(k.kind);
                setSelected(null);
              }}
              className={cn(
                "flex h-12 items-center justify-center gap-2 rounded-[10px] text-body font-medium transition-colors",
                active ? "bg-ink text-on-ink" : "text-muted-foreground hover:bg-subtle hover:text-ink",
              )}
            >
              <k.icon className="size-[18px]" aria-hidden />
              {k.label}
              <span className={cn("num rounded-full px-2 text-caption", active ? "bg-white/15" : "bg-subtle")}>{fmtInt(all[k.kind].items.length)}</span>
            </button>
          );
        })}
      </div>

      <motion.div key={kind} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <Summary cfg={cfg} s={s} p={p} compareLabel={range.compare.label} aiBooked={kind === "ai_agent" ? aiBookedCount(data, range.from, range.to) : null} />

        {s.total === 0 ? (
          <EmptyState icon={cfg.icon} title={`No ${cfg.noun} calls in this period`} className="mt-8 rounded-[var(--radius-panel)] border border-dashed border-line-strong">
            Pick a longer date range to see past calls.
          </EmptyState>
        ) : (
          <>
            {/* Chart */}
            <section aria-labelledby="chart-title" className="mt-8 rounded-[var(--radius-panel)] border border-line bg-panel">
              <header className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div>
                  <h2 id="chart-title" className="flex items-center gap-1.5 text-section font-semibold">
                    {view === "speed" ? "How fast we called them back" : cfg.lengthTitle}
                    <InfoTip id={view === "speed" ? cfg.metrics.speed : cfg.metrics.length} />
                  </h2>
                  <p className="mt-0.5 text-small text-muted-foreground">
                    {view === "speed" ? `Every ${cfg.noun} call in the period, by how fast someone called back.` : cfg.lengthHint}
                  </p>
                </div>
                <div className="flex shrink-0 rounded-[10px] border border-line-strong p-0.5" role="radiogroup" aria-label="Show the chart by">
                  {(["speed", "length"] as ViewBy[]).map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={view === v}
                      onClick={() => {
                        setView(v);
                        setSelected(null);
                      }}
                      className={cn("h-9 flex-1 rounded-[8px] px-3 text-small whitespace-nowrap", view === v ? "bg-ink text-on-ink" : "text-muted-foreground hover:text-ink")}
                    >
                      {v === "speed" ? "Callback speed" : "Call length"}
                    </button>
                  ))}
                </div>
              </header>
              <div className="grid items-center gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-10">
                <Donut slices={slices} total={s.total} selected={selected} onSelect={select} noun={cfg.noun} />
                <ul className="space-y-1" aria-label="Slices">
                  {slices.map((x) => {
                    const share = s.total ? x.items.length / s.total : 0;
                    const active = selected === x.id;
                    return (
                      <li key={x.id}>
                        <button
                          type="button"
                          onClick={() => select(x.id)}
                          aria-pressed={active}
                          className={cn(
                            "flex min-h-12 w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left transition-colors",
                            active ? "bg-subtle ring-1 ring-line-strong" : "hover:bg-subtle/70",
                            selected && !active && "opacity-60",
                          )}
                        >
                          <span className="size-3 shrink-0 rounded-[4px]" style={{ background: x.color }} aria-hidden />
                          <span className="flex-1 text-small font-medium">{x.label}</span>
                          <span className="num w-10 text-right text-small text-muted-foreground">{fmtInt(x.items.length)}</span>
                          <span className="num w-12 text-right text-body font-semibold">{fmtPct(share)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>

            {/* Details for the selected slice */}
            <AnimatePresence mode="wait">
              {sel ? (
                <motion.div
                  key={`${kind}-${view}-${sel.id}`}
                  initial={reduce ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
                  transition={{ duration: 0.25 }}
                >
                  <Details slice={sel} total={s.total} view={view} cfg={cfg} bins={bins} rows={rows} />
                </motion.div>
              ) : (
                <motion.div key="hint" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <p className="mt-6 flex items-center justify-center gap-2 rounded-[var(--radius-panel)] border border-dashed border-line-strong px-5 py-8 text-small text-muted-foreground">
                    <MousePointerClick className="size-4" aria-hidden />
                    Click a slice of the chart, or a row in the list, to see its details here.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </motion.div>
      <SourceNote source={cfg.source} className="mt-8" />
    </div>
  );
}

/* ---------------- Summary numbers ---------------- */

function Summary({ cfg, s, p, compareLabel, aiBooked }: { cfg: KindConfig; s: AbandonedSummary; p: AbandonedSummary; compareLabel: string; aiBooked: number | null }) {
  const m = cfg.metrics;
  // "Got called back" moves with call volume, so its comparison would mislead; the % tile carries that story.
  const cells = [
    { id: m.total, label: `${cfg.label} calls`, value: s.total, prev: p.total as number | null, display: fmtInt(s.total), sub: cfg.totalSub },
    { id: m.calledBack, label: "Got called back", value: s.calledBack, prev: null, display: fmtInt(s.calledBack), sub: `Out of ${fmtInt(s.total)} ${cfg.noun} calls` },
    {
      id: m.stillOpen,
      label: "Still open",
      value: s.stillOpen,
      prev: p.stillOpen as number | null,
      display: fmtInt(s.stillOpen),
      sub: s.stillOpen ? "Nobody has called them yet" : "Everyone has been called",
      tone: s.stillOpen ? "text-alarm" : undefined,
    },
    {
      id: m.rate,
      label: "Called back",
      value: s.total ? s.calledBackRate : null,
      prev: p.total ? p.calledBackRate : null,
      display: s.total ? fmtPct(s.calledBackRate) : "–",
      sub: `Of ${cfg.noun} callers`,
      bar: s.calledBackRate,
    },
  ];
  return (
    <section aria-label="Summary">
      <div className="grid grid-cols-2 overflow-hidden rounded-[var(--radius-hero)] border border-line bg-panel lg:grid-cols-4">
        {cells.map((c, i) => {
          const def = metric(c.id);
          return (
            <div key={c.id} className={cn("flex flex-col p-5 sm:p-6", i % 2 === 0 && "border-r border-line", i < 2 && "border-b border-line lg:border-b-0", i === 1 && "lg:border-r")}>
              <div className="flex items-center gap-1.5 text-small text-muted-foreground">
                <span>{c.label}</span>
                <InfoTip id={c.id} label={c.label} />
              </div>
              <p className={cn("num mt-2 text-[2.5rem] leading-none font-semibold tracking-[-0.03em] sm:text-[3rem]", "tone" in c ? c.tone : undefined)}>{c.display}</p>
              <p className="mt-2 text-caption text-muted-foreground">{c.sub}</p>
              {"bar" in c && c.bar !== undefined ? (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-subtle" aria-hidden>
                  <div className="h-full rounded-full bg-level-1 transition-[width] duration-500" style={{ width: `${Math.round(c.bar * 100)}%` }} />
                </div>
              ) : null}
              {c.id === m.calledBack ? (
                <p className="mt-auto pt-3 text-caption text-muted-foreground">See called back % for the trend</p>
              ) : (
                <Change value={c.value} previous={c.prev} higherIsBetter={def.higherIsBetter} format={def.format} compareLabel={compareLabel} className="mt-auto pt-3" />
              )}
            </div>
          );
        })}
      </div>
      {aiBooked !== null ? (
        <p className="mt-3 flex items-center gap-1.5 text-caption text-muted-foreground">
          <Info className="size-3.5" aria-hidden />
          Broccoli also booked {fmtInt(aiBooked)} {aiBooked === 1 ? "call" : "calls"} on its own in this period. Those need no call back and are not counted here.
        </p>
      ) : null}
    </section>
  );
}

/* ---------------- Donut ---------------- */

function Donut({ slices, total, selected, onSelect, noun }: { slices: Slice[]; total: number; selected: string | null; onSelect: (id: string) => void; noun: string }) {
  const data = slices.filter((x) => x.items.length > 0).map((x) => ({ id: x.id, name: x.label, value: x.items.length, color: x.color }));
  const sel = slices.find((x) => x.id === selected);
  const center = sel
    ? { big: fmtPct(total ? sel.items.length / total : 0), small: sel.label }
    : { big: fmtInt(total), small: `${noun} calls` };
  return (
    <div className="relative mx-auto w-full max-w-[22rem]">
      <ChartBox height={300} label={`Donut chart of ${noun} calls: ${data.map((d) => `${d.name} ${d.value}`).join(", ")}.`}>
        <PieChart>
          <Tooltip
            content={({ active, payload }) => {
              const d = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !d) return null;
              return <TooltipCard title={d.name} rows={[{ label: "Calls", value: fmtInt(d.value), color: d.color }, { label: "Share", value: fmtPct(d.value / total), strong: true }]} footer="Click to see details" />;
            }}
          />
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="62%"
            outerRadius="96%"
            paddingAngle={data.length > 1 ? 1.2 : 0}
            cornerRadius={4}
            stroke="var(--panel)"
            strokeWidth={2}
            startAngle={90}
            endAngle={-270}
            isAnimationActive={false}
            onClick={(_, index) => onSelect(data[index].id)}
            className="cursor-pointer outline-none"
          >
            {data.map((d) => (
              <Cell key={d.id} fill={d.color} fillOpacity={selected && selected !== d.id ? 0.3 : 1} className="transition-[fill-opacity] duration-200" />
            ))}
          </Pie>
        </PieChart>
      </ChartBox>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-16 text-center" aria-hidden>
        <span className="num text-[2.25rem] leading-none font-semibold tracking-[-0.03em]">{center.big}</span>
        <span className="mt-1.5 text-caption leading-tight text-muted-foreground">{center.small}</span>
      </div>
    </div>
  );
}

/* ---------------- Slice details ---------------- */

function Details({
  slice,
  total,
  view,
  cfg,
  bins,
  rows,
}: {
  slice: Slice;
  total: number;
  view: ViewBy;
  cfg: KindConfig;
  bins: ReturnType<typeof timeBins>;
  rows: Map<string, CallbackRow>;
}) {
  const n = slice.items.length;
  const share = total ? n / total : 0;
  const calledBack = slice.items.filter((i) => i.returnedAt !== null);
  const booked = slice.items.filter((i) => i.booked).length;
  const lengths = slice.items.map((i) => i.call.durationSec);
  const series = binCounts(bins, slice.items.map((i) => i.call.startedAt));
  const list = slice.items.map((i) => rows.get(i.call.id)).filter((r): r is CallbackRow => !!r);
  const isOpen = slice.id === "open";

  const stats: { label: string; value: string }[] = [
    { label: "Calls", value: fmtInt(n) },
    ...(view === "speed"
      ? isOpen
        ? [{ label: "Called back", value: "0" }]
        : [
            { label: "Booked", value: fmtInt(booked) },
            { label: "Book rate", value: n ? fmtPct(booked / n) : "–" },
          ]
      : [
          { label: "Called back", value: n ? fmtPct(calledBack.length / n) : "–" },
          { label: "Booked", value: fmtInt(booked) },
        ]),
    { label: "Typical call length", value: n ? `${Math.round(median(lengths))} sec` : "–" },
  ];

  const columns: Col<CallbackRow>[] = [
    { id: "date", header: "Call date", value: (r) => r.at, cell: (r) => <span className="num whitespace-nowrap">{fmt(r.at, "MMM d")}</span> },
    { id: "time", header: "Time", value: (r) => Number(fmt(r.at, "HHmm")), cell: (r) => <span className="num whitespace-nowrap">{fmtTime(r.at)}</span> },
    { id: "name", header: "Customer name", mobile: "title", value: (r) => r.customerName, cell: (r) => <span className="font-medium whitespace-nowrap">{r.customerName}</span> },
    { id: "phone", header: "Caller phone", value: (r) => r.phone, cell: (r) => <span className="num whitespace-nowrap">{r.phone}</span> },
    { id: "length", header: "Length (sec)", align: "right", value: (r) => r.lengthSec, cell: (r) => fmtInt(r.lengthSec) },
    { id: "attempts", header: "Attempt", align: "right", value: (r) => r.attempts, cell: (r) => fmtInt(r.attempts) },
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
    <section aria-label={`Details: ${slice.label}`} className="mt-6 overflow-hidden rounded-[var(--radius-panel)] border border-line bg-panel">
      <div className="h-1.5" style={{ background: slice.color }} aria-hidden />
      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-10">
        <div>
          <p className="flex items-center gap-2 text-small font-medium">
            <span className="size-3 rounded-[4px]" style={{ background: slice.color }} aria-hidden />
            {slice.label}
          </p>
          <p className="mt-3 flex items-baseline gap-3">
            <span className="num text-[3.5rem] leading-none font-semibold tracking-[-0.035em]">{fmtPct(share)}</span>
            <span className="text-small text-muted-foreground">
              of {fmtInt(total)} {cfg.noun} calls
            </span>
          </p>
          <p className="mt-2 text-small text-muted-foreground">{slice.note}</p>
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4 lg:grid-cols-2">
            {stats.map((st) => (
              <div key={st.label}>
                <dt className="text-caption text-muted-foreground">{st.label}</dt>
                <dd className="num mt-0.5 text-section font-semibold">{st.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <p className="text-small font-medium">Calls per {bins.unit}</p>
          <p className="text-caption text-muted-foreground">When these calls came in during the period.</p>
          <Sparkline className="mt-3 h-36" values={series} labels={bins.labels} color={slice.color === OPEN_COLOR ? "var(--ink)" : slice.color} name={slice.label} max={Math.max(1, ...series)} unit="call" per={bins.unit} />
        </div>
      </div>
      <div className="border-t border-line p-5 sm:p-6">
        <h3 className="mb-3 text-small font-semibold">The calls in this slice</h3>
        <DataTable
          caption={`Calls in ${slice.label}`}
          rows={list}
          columns={columns}
          rowKey={(r) => r.id}
          initialSort={{ id: "date", desc: true }}
          pageSize={10}
          empty={<EmptyState title="No calls in this slice">Pick another slice or a longer date range.</EmptyState>}
        />
      </div>
    </section>
  );
}
