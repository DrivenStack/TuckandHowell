"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, Tooltip, XAxis } from "recharts";
import { Columns3, PauseCircle, Rows3, Workflow } from "lucide-react";
import { dayStarts, deriveLeads, fmtInt, fmtUsd, fmtUsdShort, type RangePreset } from "@/lib/metrics/calculations";
import { fmt, fmtDuration, fmtStamp, HOUR, nyDayKey } from "@/lib/time";
import { cn } from "@/lib/utils";
import { LEAD_STAGES, type Lead, type LeadChannel, type LeadStage } from "@/lib/types";
import { useCustomers, useLocalRange, useReady } from "@/components/app/hooks";
import { Funnel } from "@/components/charts/charts";
import { axisProps, C, ChartBox, cursorFill, makeTooltip } from "@/components/charts/kit";
import { Chip } from "@/components/common/chips";
import { DataTable, type Col } from "@/components/common/data-table";
import { Kpi } from "@/components/common/kpi";
import { DateRangePicker, EmptyState, PageHeader, PageSkeleton, Section, SourceNote } from "@/components/common/page";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/overlays";
import { Tooltip as UiTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/primitives";

const CHANNELS: { id: LeadChannel; label: string; disabled?: boolean }[] = [
  { id: "Phone", label: "Phone" },
  { id: "Web Form", label: "Web Form" },
  { id: "Angi", label: "Angi (GoHighLevel)" },
  { id: "AI Voice Agent", label: "AI Voice Agent" },
  { id: "Referral", label: "Referral" },
  { id: "Hatch", label: "Hatch (on hold)", disabled: true },
];

const STAGE_TONE: Record<LeadStage, "neutral" | "cool" | "success"> = {
  New: "neutral",
  Contacted: "cool",
  Booked: "success",
  "Job completed": "success",
  Paid: "success",
};

export function LeadsView() {
  const ready = useReady();
  if (!ready) return <PageSkeleton kpis={4} charts={2} />;
  return <Leads />;
}

function Leads() {
  const { data, now } = useReady()!;
  const [preset, setPreset] = useState<RangePreset>("7d");
  const [custom, setCustom] = useState<{ from: number; to: number } | null>(null);
  const range = useLocalRange(preset, custom);
  const customers = useCustomers();
  const [channel, setChannel] = useState<LeadChannel | "all">("all");
  const [view, setView] = useState<"board" | "table">("board");
  const [selected, setSelected] = useState<Lead | null>(null);

  const all = useMemo(() => deriveLeads(data, range.from, range.to, now), [data, range.from, range.to, now]);
  const prev = useMemo(() => deriveLeads(data, range.compare.from, range.compare.to, now), [data, range.compare.from, range.compare.to, now]);
  const leads = channel === "all" ? all : all.filter((l) => l.channel === channel);
  const prevLeads = channel === "all" ? prev : prev.filter((l) => l.channel === channel);

  const reached = (ls: Lead[], s: LeadStage) => ls.filter((l) => LEAD_STAGES.indexOf(l.stage) >= LEAD_STAGES.indexOf(s)).length;
  const conv = (ls: Lead[]) => (ls.length ? reached(ls, "Booked") / ls.length : 0);
  const bookedValue = leads.filter((l) => l.jobId).reduce((s, l) => s + l.value, 0);
  const prevBookedValue = prevLeads.filter((l) => l.jobId).reduce((s, l) => s + l.value, 0);

  const campaignName = (id: string | null) => data.campaigns.find((c) => c.id === id)?.name ?? "Unknown";
  const name = (l: Lead) => customers.get(l.customerId)?.name ?? "Customer";

  const cols: Col<Lead>[] = [
    { id: "customer", header: "Customer", mobile: "title", value: name, cell: (l) => <span className="font-medium">{name(l)}</span> },
    { id: "channel", header: "Source", value: (l) => l.channel },
    { id: "job", header: "Job type", value: (l) => l.jobType },
    { id: "stage", header: "Stage", value: (l) => LEAD_STAGES.indexOf(l.stage), cell: (l) => <Chip tone={STAGE_TONE[l.stage]}>{l.stage}</Chip> },
    { id: "value", header: "Value", align: "right", value: (l) => l.value, cell: (l) => fmtUsd(l.value) },
    { id: "created", header: "First contact", value: (l) => l.createdAt, cell: (l) => fmtStamp(l.createdAt, now) },
  ];

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Every lead from first contact to money in the bank, wherever it came in."
        actions={<DateRangePicker value={preset} custom={custom} onChange={(p, c) => { setPreset(p); setCustom(c ?? null); }} />}
      />

      <div className="scrollbar-none -mx-4 mb-8 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" role="radiogroup" aria-label="Filter by source">
        {[{ id: "all" as const, label: "All sources" }, ...CHANNELS].map((c) => {
          const disabled = "disabled" in c && c.disabled;
          const active = channel === c.id;
          const btn = (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-disabled={disabled || undefined}
              disabled={disabled}
              onClick={() => setChannel(c.id)}
              className={cn(
                "flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-small transition-colors",
                active ? "border-ink bg-ink text-on-ink" : "border-line-strong hover:bg-subtle",
                disabled && "cursor-not-allowed border-dashed opacity-60 hover:bg-transparent",
              )}
            >
              {disabled ? <PauseCircle className="size-3.5" aria-hidden /> : null}
              {c.label}
            </button>
          );
          return disabled ? (
            <UiTooltip key={c.id}>
              <TooltipTrigger asChild>
                <span>{btn}</span>
              </TooltipTrigger>
              <TooltipContent>Hatch is on hold because its syncing was unreliable.</TooltipContent>
            </UiTooltip>
          ) : (
            btn
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-7 sm:grid-cols-4">
        <Kpi id="new_leads" value={leads.length} previous={prevLeads.length} compareLabel={range.compare.label} />
        <Kpi id="leads_booked" value={reached(leads, "Booked")} previous={reached(prevLeads, "Booked")} compareLabel={range.compare.label} />
        <Kpi id="lead_conversion" value={conv(leads)} previous={conv(prevLeads)} compareLabel={range.compare.label} />
        <Kpi id="lead_value" value={bookedValue} previous={prevBookedValue} compareLabel={range.compare.label} />
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-12">
        <Section className="lg:col-span-5" title="Lead funnel" description="How many leads reached each stage, and the share that moved on." source="GoHighLevel and ServiceTitan">
          <Funnel steps={LEAD_STAGES.map((s) => ({ label: s, value: reached(leads, s) }))} />
        </Section>
        <Section className="lg:col-span-7" title="Leads by source over time" description="One small chart per source, same scale, so you can compare." source="GoHighLevel and ServiceTitan">
          <SourceMultiples leads={all} from={range.from} to={range.to} />
        </Section>
      </div>

      <section className="mt-12" aria-labelledby="pipeline-title">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="pipeline-title" className="text-section font-semibold">
              Pipeline
            </h2>
            <p className="text-small text-muted-foreground">{fmtInt(leads.length)} leads. Open one to see its journey.</p>
          </div>
          <div className="flex rounded-[10px] border border-line-strong p-0.5" role="radiogroup" aria-label="View">
            {(["board", "table"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={view === v}
                onClick={() => setView(v)}
                className={cn("flex h-9 items-center gap-1.5 rounded-[8px] px-3 text-small", view === v ? "bg-ink text-on-ink" : "text-muted-foreground hover:text-ink")}
              >
                {v === "board" ? <Columns3 className="size-4" aria-hidden /> : <Rows3 className="size-4" aria-hidden />}
                {v === "board" ? "Board" : "Table"}
              </button>
            ))}
          </div>
        </div>
        {!leads.length ? (
          <EmptyState icon={Workflow} title="No leads in this period">Try a longer date range or another source.</EmptyState>
        ) : view === "board" ? (
          <Board leads={leads} name={name} onOpen={setSelected} onShowTable={() => setView("table")} />
        ) : (
          <DataTable caption="Leads" rows={leads} columns={cols} rowKey={(l) => l.id} onRowClick={setSelected} initialSort={{ id: "created", desc: true }} csvName={`leads-${range.preset}`} />
        )}
      </section>

      <LeadDrawer lead={selected} onClose={() => setSelected(null)} name={selected ? name(selected) : ""} campaign={selected ? campaignName(selected.campaignId) : ""} now={now} />
    </div>
  );
}

function Board({ leads, name, onOpen, onShowTable }: { leads: Lead[]; name: (l: Lead) => string; onOpen: (l: Lead) => void; onShowTable: () => void }) {
  const LIMIT = 20;
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="grid min-w-[62rem] grid-cols-5 gap-3">
        {LEAD_STAGES.map((stage) => {
          const items = leads.filter((l) => l.stage === stage);
          const total = items.reduce((s, l) => s + l.value, 0);
          return (
            <div key={stage} className="rounded-[var(--radius-panel)] bg-subtle/70 p-2">
              <div className="flex items-baseline justify-between px-2 pt-1 pb-2.5">
                <h3 className="text-small font-semibold">
                  {stage} <span className="num font-normal text-muted-foreground">{items.length}</span>
                </h3>
                <span className="num text-caption text-muted-foreground">{fmtUsdShort(total)}</span>
              </div>
              <ul className="space-y-1.5">
                {items.slice(0, LIMIT).map((l) => (
                  <li key={l.id}>
                    <button type="button" onClick={() => onOpen(l)} className="block w-full rounded-[10px] border border-line bg-panel p-3 text-left hover:border-line-strong">
                      <span className="block truncate text-small font-medium">{name(l)}</span>
                      <span className="mt-0.5 block truncate text-caption text-muted-foreground">{l.jobType}</span>
                      <span className="mt-2 flex items-center justify-between gap-2">
                        <span className="truncate text-caption text-muted-foreground">{l.channel}</span>
                        <span className={cn("num text-caption font-semibold", !l.jobId && "font-normal text-muted-foreground")}>
                          {l.jobId ? fmtUsd(l.value) : `about ${fmtUsdShort(l.value)}`}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {items.length > LIMIT ? (
                <button type="button" onClick={onShowTable} className="mt-2 h-10 w-full rounded-[8px] text-caption text-muted-foreground hover:bg-panel hover:text-ink">
                  And {items.length - LIMIT} more, see the table
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SourceMultiples({ leads, from, to }: { leads: Lead[]; from: number; to: number }) {
  const starts = dayStarts(from, to);
  const keys = starts.map((s) => nyDayKey(s + HOUR));
  const channels = CHANNELS.filter((c) => !c.disabled);
  const series = channels.map((c) => {
    const counts = new Map(keys.map((k) => [k, 0]));
    for (const l of leads) if (l.channel === c.id) counts.set(nyDayKey(l.createdAt), (counts.get(nyDayKey(l.createdAt)) ?? 0) + 1);
    return { channel: c, rows: starts.map((s, i) => ({ label: fmt(s + HOUR, "MMM d"), value: counts.get(keys[i]) ?? 0 })) };
  });
  const max = Math.max(1, ...series.flatMap((s) => s.rows.map((r) => r.value)));
  const Tip = makeTooltip<{ label: string; value: number }>((p) => ({ title: p.label, rows: [{ label: "Leads", value: String(p.value), strong: true }] }));
  if (starts.length < 2) {
    return (
      <ul className="space-y-3">
        {series.map((s) => (
          <li key={s.channel.id} className="flex items-baseline justify-between border-b border-line pb-2 text-small">
            <span>{s.channel.label}</span>
            <span className="num font-semibold">{s.rows.reduce((a, r) => a + r.value, 0)}</span>
          </li>
        ))}
        <li className="text-caption text-muted-foreground">Pick a longer range to see this over time.</li>
      </ul>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
      {series.map((s) => (
        <div key={s.channel.id}>
          <div className="flex items-baseline justify-between text-small">
            <span className="truncate">{s.channel.label}</span>
            <span className="num font-semibold">{s.rows.reduce((a, r) => a + r.value, 0)}</span>
          </div>
          <ChartBox height={64} label={`Leads per day from ${s.channel.label}`}>
            <BarChart data={s.rows} margin={{ top: 6, right: 0, bottom: 0, left: 0 }} barCategoryGap="12%">
              <XAxis dataKey="label" hide {...axisProps} />
              <Tooltip content={Tip} cursor={cursorFill} />
              <Bar dataKey="value" fill={C.csr} radius={[2, 2, 0, 0]} isAnimationActive={false} maxBarSize={14} background={false} />
            </BarChart>
          </ChartBox>
          <div className="flex justify-between text-[0.6875rem] text-muted-foreground" aria-hidden>
            <span>{s.rows[0]?.label}</span>
            <span>{s.rows[s.rows.length - 1]?.label}</span>
          </div>
        </div>
      ))}
      <p className="col-span-full text-caption text-muted-foreground">Tallest bar is {max} leads in a day.</p>
    </div>
  );
}

function LeadDrawer({ lead, onClose, name, campaign, now }: { lead: Lead | null; onClose: () => void; name: string; campaign: string; now: number }) {
  return (
    <Sheet open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right">
        {lead ? (
          <div className="flex h-full flex-col">
            <div className="border-b border-line px-5 pt-5 pb-4 pr-16">
              <Chip tone={STAGE_TONE[lead.stage]}>{lead.stage}</Chip>
              <SheetTitle className="mt-3 text-[1.375rem] leading-7">{name}</SheetTitle>
              <SheetDescription className="mt-1">
                {lead.jobType} from {lead.channel}. Marketing source: {campaign}.
              </SheetDescription>
              <p className="num mt-3 text-figure font-semibold">{fmtUsd(lead.value)}</p>
              <p className="text-caption text-muted-foreground">{lead.jobId ? "Job value from ServiceTitan" : "Estimated value for this job type"}</p>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5">
              <h3 className="mb-3 text-small font-semibold">Journey</h3>
              <ol>
                {LEAD_STAGES.map((stage, i) => {
                  const hit = lead.stageHistory.find((h) => h.stage === stage);
                  const next = lead.stageHistory.find((h) => LEAD_STAGES.indexOf(h.stage) === i + 1);
                  const current = lead.stage === stage;
                  return (
                    <li key={stage} className="relative flex gap-3 pb-6 last:pb-0">
                      {i < LEAD_STAGES.length - 1 ? <span className={cn("absolute top-7 bottom-0 left-[11px] w-0.5", hit && next ? "bg-cool" : "bg-line")} aria-hidden /> : null}
                      <span
                        className={cn(
                          "relative mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2",
                          hit ? "border-cool bg-cool" : "border-line-strong bg-panel",
                        )}
                        aria-hidden
                      >
                        {current ? <span className="size-2 rounded-full bg-white" /> : null}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-small font-medium", !hit && "text-muted-foreground")}>{stage}</p>
                        {hit ? (
                          <p className="text-caption text-muted-foreground">
                            {fmtStamp(hit.at, now)}
                            {next ? `. ${fmtDuration(next.at - hit.at)} in this stage` : current ? `. ${fmtDuration(now - hit.at)} so far` : ""}
                          </p>
                        ) : (
                          <p className="text-caption text-muted-foreground">Not yet</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-6 text-small text-muted-foreground">
                {lead.firstContactAt ? `First reached ${fmtDuration(lead.firstContactAt - lead.createdAt)} after the lead came in.` : "No one has reached this customer yet."}
              </p>
              <SourceNote source={lead.channel === "Angi" ? "GoHighLevel and ServiceTitan" : "ServiceTitan"} className="mt-6" />
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
