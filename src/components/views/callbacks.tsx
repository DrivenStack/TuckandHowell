"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, ListChecks, Minus, PhoneMissed, PhoneOff, RefreshCw, Search, Voicemail, type LucideIcon } from "lucide-react";
import { CALLBACK_TYPES, REACHED_MIN_SECONDS, RETURN_WINDOW_MS, type CallbackRow, type CallbackType } from "@/lib/callbacks/live";
import { fmtInt, fmtMinutes } from "@/lib/format";
import type { RangePreset } from "@/lib/range";
import { fmt, fmtTime, MINUTE } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app";
import { useLiveCallbacks, useLocalRange } from "@/components/app/hooks";
import { DataTable, type Col } from "@/components/common/data-table";
import { DateRangePicker, EmptyState, PageHeader, PageSkeleton, SourceNote } from "@/components/common/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/primitives";

const TYPE_META: Record<CallbackType, { icon: LucideIcon; hint: string }> = {
  Abandoned: { icon: PhoneOff, hint: "The caller hung up before anyone answered (ServiceTitan call type: Abandoned)" },
  Missed: { icon: PhoneMissed, hint: "Inbound call with no agent on it in ServiceTitan" },
};

type Status = "all" | "open" | "done";

export function CallbacksView() {
  const [preset, setPreset] = useState<RangePreset>("7d");
  const [custom, setCustom] = useState<{ from: number; to: number } | null>(null);
  const range = useLocalRange(preset, custom);
  const live = useLiveCallbacks(range.from ? range : null);

  return (
    <div>
      <PageHeader
        title="Callbacks"
        description="Every missed and abandoned call, live from ServiceTitan. Open calls stay on top; once someone calls back, the row turns done and moves down."
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
      {live.status === "loading" ? (
        <LiveLoading />
      ) : live.status === "error" ? (
        <ConnectionError message={live.error} />
      ) : (
        <Callbacks rows={live.rows} rangeLabel={range.label} preset={preset} justDone={live.justDone} justAdded={live.justAdded} error={live.error} />
      )}
    </div>
  );
}

export function LiveLoading() {
  return (
    <div>
      <p className="mb-4 flex items-center gap-2 text-small text-muted-foreground" role="status">
        <RefreshCw className="size-4 animate-spin" aria-hidden />
        Loading calls from ServiceTitan…
      </p>
      <PageSkeleton kpis={4} charts={1} />
    </div>
  );
}

export function ConnectionError({ message }: { message: string | null }) {
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-[var(--radius-panel)] border border-alarm/30 bg-alarm-tint px-6 py-12 text-center">
      <AlertTriangle className="size-6 text-alarm" aria-hidden />
      <h2 className="text-section font-semibold">Could not reach ServiceTitan</h2>
      <p className="text-small text-muted-foreground">{message ?? "Something went wrong."} The page keeps trying every 15 seconds.</p>
      <Button variant="outline" onClick={() => window.location.reload()}>
        Try again now
      </Button>
    </div>
  );
}

export function StaleNotice({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="status" className="mb-4 flex items-center gap-2 rounded-[10px] bg-warm-tint px-3 py-2 text-small text-warm-text">
      <AlertTriangle className="size-4 shrink-0" aria-hidden />
      The last check with ServiceTitan failed ({error}). Showing the last good data; retrying every 15 seconds.
    </p>
  );
}

function Callbacks({
  rows: all,
  rangeLabel,
  preset,
  justDone,
  justAdded,
  error,
}: {
  rows: CallbackRow[];
  rangeLabel: string;
  preset: RangePreset;
  justDone: string[];
  justAdded: string[];
  error: string | null;
}) {
  const overrides = useAppStore((s) => s.doneOverrides);
  const setDone = useAppStore((s) => s.setDone);
  const [type, setType] = useState<CallbackType | "all">("all");
  const [status, setStatus] = useState<Status>("all");
  const [query, setQuery] = useState("");
  const isDone = (r: CallbackRow) => overrides[String(r.callId)] ?? r.doneByData;

  // Live notifications: someone called a customer back, or a new missed or abandoned call came in
  useEffect(() => {
    const byId = new Map(all.map((r) => [r.id, r]));
    for (const id of justDone.slice(0, 3)) {
      const r = byId.get(id);
      if (r) toast.success(`Done: ${r.customerName} was called back${r.calledBackBy ? ` by ${r.calledBackBy}` : ""}`);
    }
    for (const id of justAdded.slice(0, 3)) {
      const r = byId.get(id);
      if (r) toast(`New ${r.type.toLowerCase()} call: ${r.customerName}, ${r.phone}`);
    }
    // Only when a new check reports changes, not on every re-render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justDone, justAdded]);

  const counts = useMemo(() => {
    const byType: Record<string, number> = { all: all.length };
    for (const t of CALLBACK_TYPES) byType[t] = all.filter((r) => r.type === t).length;
    return byType;
  }, [all]);
  const open = all.filter((r) => !isDone(r)).length;
  const reached = all.filter((r) => r.reachedCsr).length;
  const done = new Set(justDone);
  const added = new Set(justAdded);

  const q = query.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, "");
  const rows = all.filter((r) => {
    if (type !== "all" && r.type !== type) return false;
    if (status === "open" && isDone(r)) return false;
    if (status === "done" && !isDone(r)) return false;
    if (q && !r.customerName.toLowerCase().includes(q) && !(qDigits.length >= 3 && r.phone.replace(/\D/g, "").includes(qDigits))) return false;
    return true;
  });
  // Open calls on top (newest first), done calls below them
  rows.sort((a, b) => Number(isDone(a)) - Number(isDone(b)) || b.at - a.at);

  const columns: Col<CallbackRow>[] = [
    { id: "date", header: "Call date", value: (r) => r.at, cell: (r) => <span className="num whitespace-nowrap" title={fmt(r.at, "EEEE, MMMM d, yyyy")}>{fmt(r.at, "MMM d")}</span> },
    { id: "time", header: "Time", value: (r) => Number(fmt(r.at, "HHmm")), cell: (r) => <span className="num whitespace-nowrap">{fmtTime(r.at)}</span> },
    {
      id: "type",
      header: "Type",
      value: (r) => r.type,
      cell: (r) => {
        const m = TYPE_META[r.type];
        return (
          <span title={m.hint} className="inline-flex h-6 items-center gap-1 rounded-full bg-subtle px-2 text-caption font-medium whitespace-nowrap">
            <m.icon className="size-3.5 text-muted-foreground" aria-hidden />
            {r.type}
          </span>
        );
      },
    },
    { id: "phone", header: "Caller phone", value: (r) => r.phone, cell: (r) => <span className="num whitespace-nowrap">{r.phone}</span> },
    {
      id: "name",
      header: "Customer name",
      mobile: "title",
      value: (r) => r.customerName,
      cell: (r) => <span className={cn("font-medium whitespace-nowrap", r.customerName === "Unknown caller" && "font-normal text-muted-foreground")}>{r.customerName}</span>,
    },
    {
      id: "assigned",
      header: "Assigned to",
      sortable: false,
      value: () => "",
      cell: () => (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="cursor-help whitespace-nowrap text-muted-foreground underline decoration-line-strong decoration-dotted underline-offset-4">
              Not recorded
            </span>
          </TooltipTrigger>
          <TooltipContent>ServiceTitan does not record whose line rang when nobody picked up. Connecting Dialpad will fill this in.</TooltipContent>
        </Tooltip>
      ),
    },
    {
      id: "length",
      header: "Length (sec)",
      align: "right",
      value: (r) => r.lengthSec,
      cell: (r) => (
        <span className="inline-flex items-center gap-1">
          {r.voicemail ? <Voicemail className="size-3.5 text-muted-foreground" aria-label="Left a voicemail" /> : null}
          {fmtInt(r.lengthSec)}
        </span>
      ),
    },
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
    {
      id: "action",
      header: "Action needed",
      value: (r) => (isDone(r) ? 1 : 0),
      cell: (r) =>
        isDone(r) ? (
          r.calledBackAt ? (
            <span className="whitespace-nowrap text-muted-foreground" title={`Called back ${fmtMinutes((r.calledBackAt - r.at) / MINUTE)} after the call`}>
              None, {r.calledBackBy ? `called by ${r.calledBackBy.split(" ")[0]}` : "called back"}
            </span>
          ) : (
            <span className="text-muted-foreground">None</span>
          )
        ) : (
          <span className="inline-flex h-6 items-center rounded-full bg-alarm-tint px-2.5 text-caption font-medium whitespace-nowrap text-alarm">Call back</span>
        ),
    },
    {
      id: "done",
      header: "Done?",
      sortable: false,
      value: (r) => (isDone(r) ? 1 : 0),
      cell: (r) => (
        <label className="-m-2 inline-flex cursor-pointer items-center p-2" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isDone(r)}
            onChange={(e) => setDone(String(r.callId), e.target.checked)}
            className="size-5 cursor-pointer rounded accent-[var(--success)]"
            aria-label={`Done: ${r.customerName}, ${r.type} call at ${fmtTime(r.at)}`}
          />
        </label>
      ),
    },
  ];

  const statusTabs: { id: Status; label: string; count: number }[] = [
    { id: "all", label: "All", count: all.length },
    { id: "open", label: "Needs action", count: open },
    { id: "done", label: "Done", count: all.length - open },
  ];

  return (
    <>
      <StaleNotice error={error} />

      <section aria-label="Summary" className="mb-8 grid grid-cols-2 overflow-hidden rounded-[var(--radius-hero)] border border-line bg-panel sm:grid-cols-4">
        {[
          { label: "Missed and abandoned", value: all.length, sub: rangeLabel, tone: undefined },
          { label: "Needs action", value: open, sub: open ? "Nobody has called back yet" : "All handled", tone: open ? "text-alarm" : undefined },
          { label: "Reached a CSR", value: reached, sub: `Spoke ${REACHED_MIN_SECONDS} sec or more, or called in`, tone: undefined },
          { label: "Done", value: all.length - open, sub: "Called back, or ticked by hand", tone: undefined },
        ].map((c, i) => (
          <div key={c.label} className={cn("p-5 sm:p-6", i % 2 === 0 && "border-r border-line", i < 2 && "border-b border-line sm:border-b-0", i === 1 && "sm:border-r")}>
            <p className="text-small text-muted-foreground">{c.label}</p>
            <p className={cn("num mt-2 text-[2.25rem] leading-none font-semibold tracking-[-0.03em]", c.tone)}>{fmtInt(c.value)}</p>
            <p className="mt-2 text-caption text-muted-foreground">{c.sub}</p>
          </div>
        ))}
      </section>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Type">
          {(["all", ...CALLBACK_TYPES] as const).map((t) => {
            const active = type === t;
            const Icon = t === "all" ? ListChecks : TYPE_META[t].icon;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setType(t)}
                className={cn("flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-small transition-colors", active ? "border-ink bg-ink text-on-ink" : "border-line-strong hover:bg-subtle")}
              >
                <Icon className="size-4" aria-hidden />
                {t === "all" ? "All types" : t}
                <span className={cn("num rounded-full px-1.5 text-caption", active ? "bg-white/15" : "bg-subtle")}>{counts[t] ?? 0}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex rounded-[10px] border border-line-strong p-0.5" role="radiogroup" aria-label="Show">
            {statusTabs.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={status === s.id}
                onClick={() => setStatus(s.id)}
                className={cn("flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[8px] px-3 text-small whitespace-nowrap", status === s.id ? "bg-ink text-on-ink" : "text-muted-foreground hover:text-ink")}
              >
                {s.label}
                <span className="num opacity-70">{s.count}</span>
              </button>
            ))}
          </div>
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or phone" aria-label="Search by name or phone" className="pl-9" />
          </div>
        </div>
      </div>

      <DataTable
        caption="Missed and abandoned calls"
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        animateRows
        pageSize={25}
        csvName={`callbacks-${preset}`}
        rowClassName={(r) => (done.has(r.id) ? "bg-success-tint" : added.has(r.id) ? "bg-cool-tint" : !isDone(r) ? "bg-alarm-tint/40" : undefined)}
        empty={
          <EmptyState icon={ListChecks} title={all.length ? "No calls match" : "No missed or abandoned calls in this period"} className="rounded-[var(--radius-panel)] border border-dashed border-line-strong">
            {all.length ? "Try another type, status or date range, or clear the search." : "New ones will appear here within 15 seconds of reaching ServiceTitan."}
          </EmptyState>
        }
      />

      <p className="mt-4 text-caption text-muted-foreground">
        Abandoned is ServiceTitan&apos;s call type for callers who hung up before anyone answered. Missed is any other inbound call with no agent on it. A call back is any
        outbound call to the caller&apos;s number within {Math.round(RETURN_WINDOW_MS / 86_400_000)} days, or the caller calling again and a CSR answering; it marks the row done.
        Attempt counts our outbound calls. Reached CSR means a call of {REACHED_MIN_SECONDS} seconds or more, or the caller reaching a CSR.
      </p>
      <SourceNote source="ServiceTitan, live" className="mt-2" />
    </>
  );
}
