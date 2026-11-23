"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Bot, Check, ListChecks, Minus, PhoneMissed, PhoneOff, Search, type LucideIcon } from "lucide-react";
import { buildLogIndex, callbackLog, CALLBACK_TYPES, REACHED_MIN_SECONDS, type ActionNeeded, type CallbackRow, type CallbackType } from "@/lib/metrics/callback-log";
import { fmtInt, type RangePreset } from "@/lib/metrics/calculations";
import { fmt, fmtTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app";
import { useDataStore } from "@/store/data";
import { useLocalRange, useReady } from "@/components/app/hooks";
import { DataTable, type Col } from "@/components/common/data-table";
import { DateRangePicker, EmptyState, PageHeader, PageSkeleton, SourceNote } from "@/components/common/page";
import { Input } from "@/components/ui/input";

const TYPE_META: Record<CallbackType, { icon: LucideIcon; hint: string }> = {
  Abandoned: { icon: PhoneOff, hint: "Hung up while waiting on hold" },
  Broccoli: { icon: Bot, hint: "AI Voice Agent took the call, no booking" },
  Missed: { icon: PhoneMissed, hint: "Rang a CSR, nobody picked up" },
};

const ACTION_STYLE: Record<ActionNeeded, string> = {
  "Call back": "bg-alarm-tint text-alarm",
  None: "text-muted-foreground",
};

type Status = "all" | "open" | "done";

export function CallbacksView() {
  const ready = useReady();
  if (!ready) return <PageSkeleton kpis={4} charts={1} />;
  return <Callbacks />;
}

function Callbacks() {
  const { data } = useReady()!;
  const [preset, setPreset] = useState<RangePreset>("7d");
  const [custom, setCustom] = useState<{ from: number; to: number } | null>(null);
  const range = useLocalRange(preset, custom);
  const overrides = useAppStore((s) => s.doneOverrides);
  const setDone = useAppStore((s) => s.setDone);
  const [type, setType] = useState<CallbackType | "all">("all");
  const [status, setStatus] = useState<Status>("all");
  const [query, setQuery] = useState("");

  const index = useMemo(() => buildLogIndex(data), [data]);
  const all = useMemo(() => callbackLog(data, index, range.from, range.to), [data, index, range.from, range.to]);
  const csrNames = useMemo(() => new Map(data.csrs.map((c) => [c.id, c.name])), [data.csrs]);
  const isDone = (r: CallbackRow) => overrides[r.callId] ?? r.doneByData;

  // Live: when someone calls back a person on the list, their row turns done and drops down.
  const [recent, setRecent] = useState<Record<string, number>>({});
  const openRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    openRef.current = new Set(all.filter((r) => !(overrides[r.callId] ?? r.doneByData)).map((r) => r.callId));
  }, [all, overrides]);
  useEffect(() => {
    const timers: number[] = [];
    const unsubscribe = useDataStore.subscribe((st, prev) => {
      if (!st.data || st.data === prev.data || !openRef.current.size) return;
      const fresh = callbackLog(st.data, buildLogIndex(st.data), range.from, Number.MAX_SAFE_INTEGER);
      const names = new Map(st.data.csrs.map((c) => [c.id, c.name]));
      const done = fresh.filter((r) => openRef.current.has(r.callId) && r.doneByData);
      if (!done.length) return;
      for (const r of done) {
        toast.success(`Done: ${r.customerName} was called back${r.calledBackBy ? ` by ${names.get(r.calledBackBy)}` : ""}`);
      }
      const at = Date.now();
      setRecent((cur) => ({ ...cur, ...Object.fromEntries(done.map((r) => [r.callId, at])) }));
      timers.push(
        window.setTimeout(() => {
          setRecent((cur) => Object.fromEntries(Object.entries(cur).filter(([, t]) => t !== at)));
        }, 6000),
      );
    });
    return () => {
      unsubscribe();
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [range.from]);

  const counts = useMemo(() => {
    const byType: Record<string, number> = { all: all.length };
    for (const t of CALLBACK_TYPES) byType[t] = all.filter((r) => r.type === t).length;
    return byType;
  }, [all]);
  const open = all.filter((r) => !isDone(r)).length;
  const reached = all.filter((r) => r.reachedCsr).length;

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
    { id: "name", header: "Customer name", mobile: "title", value: (r) => r.customerName, cell: (r) => <span className="font-medium whitespace-nowrap">{r.customerName}</span> },
    {
      id: "assigned",
      header: "Assigned to",
      value: (r) => (r.assignedCsrId ? csrNames.get(r.assignedCsrId) ?? "" : ""),
      cell: (r) =>
        r.assignedCsrId ? (
          <span className="whitespace-nowrap">{csrNames.get(r.assignedCsrId) ?? "CSR"}</span>
        ) : (
          <span className="whitespace-nowrap text-muted-foreground" title="Came in when no CSR was on shift">
            After hours
          </span>
        ),
    },
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
    {
      id: "action",
      header: "Action needed",
      value: (r) => ["Call back", "Try again", "No more attempts", "None"].indexOf(r.action),
      cell: (r) =>
        r.action === "None" ? (
          <span className="whitespace-nowrap text-muted-foreground">{!r.reachedCsr && r.booked ? "Booked" : "None"}</span>
        ) : (
          <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-caption font-medium whitespace-nowrap", ACTION_STYLE[r.action])}>{r.action}</span>
        ),
    },
    {
      id: "done",
      header: "Done?",
      value: (r) => (isDone(r) ? 1 : 0),
      sortable: false,
      cell: (r) => {
        const done = isDone(r);
        return (
          <label className="-m-2 inline-flex cursor-pointer items-center p-2" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={done}
              onChange={(e) => setDone(r.callId, e.target.checked)}
              className="size-5 cursor-pointer rounded accent-[var(--success)]"
              aria-label={`Done: ${r.customerName}, ${r.type} call at ${fmtTime(r.at)}`}
            />
          </label>
        );
      },
    },
  ];

  const statusTabs: { id: Status; label: string; count: number }[] = [
    { id: "all", label: "All", count: all.length },
    { id: "open", label: "Needs action", count: open },
    { id: "done", label: "Done", count: all.length - open },
  ];

  return (
    <div>
      <PageHeader
        title="Callbacks"
        description="Every call that needed a call back, from every source. Open calls stay on top; once someone calls back, the row turns done and moves down."
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

      {/* Summary */}
      <section aria-label="Summary" className="mb-8 grid grid-cols-2 overflow-hidden rounded-[var(--radius-hero)] border border-line bg-panel sm:grid-cols-4">
        {[
          { label: "Calls needing a call back", value: all.length, sub: range.label },
          { label: "Needs action", value: open, sub: open ? "Not done yet" : "All handled", tone: open ? "text-alarm" : undefined },
          { label: "Reached a CSR", value: reached, sub: `Spoke for ${REACHED_MIN_SECONDS} sec or more` },
          { label: "Done", value: all.length - open, sub: "Called back, reached, or booked" },
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
                className={cn(
                  "flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-small transition-colors",
                  active ? "border-ink bg-ink text-on-ink" : "border-line-strong hover:bg-subtle",
                )}
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
                className={cn(
                  "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[8px] px-3 text-small whitespace-nowrap",
                  status === s.id ? "bg-ink text-on-ink" : "text-muted-foreground hover:text-ink",
                )}
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
        caption="Calls that needed a call back"
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        animateRows
        pageSize={25}
        csvName={`callbacks-${range.preset}`}
        rowClassName={(r) => (recent[r.callId] ? "bg-success-tint" : !isDone(r) ? "bg-alarm-tint/40" : undefined)}
        empty={
          <EmptyState icon={ListChecks} title="No calls match" className="rounded-[var(--radius-panel)] border border-dashed border-line-strong">
            Try another type, status or date range, or clear the search.
          </EmptyState>
        }
      />

      <p className="mt-4 text-caption text-muted-foreground">
        Assigned to is the CSR whose line rang and did not pick up; calls that came in when nobody was on shift show After hours. A call back to any of the
        customer&apos;s numbers marks the row done and moves it below the open ones. Attempt counts our call backs within 3 days. Reached CSR means a call of{" "}
        {REACHED_MIN_SECONDS} seconds or more, or the customer called again and a CSR answered.
      </p>
      <SourceNote source="ServiceTitan and the Broccoli AI Voice Agent" className="mt-2" />
    </div>
  );
}
