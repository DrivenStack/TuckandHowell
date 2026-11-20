"use client";

import { useState, type ReactNode } from "react";
import { CalendarDays, ChevronDown, Database, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt, nyStartOfDay, nyAddDays, TZ } from "@/lib/time";
import { RANGE_LABELS, type RangePreset } from "@/lib/metrics/calculations";
import { metric, type MetricId } from "@/lib/metrics/definitions";
import { useAppStore } from "@/store/app";
import { useDataStore } from "@/store/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, Popover, PopoverContent, PopoverTrigger, Skeleton, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/primitives";
import { fromZonedTime } from "date-fns-tz";

/* ---------------- Page header ---------------- */

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between lg:mb-8", className)}>
      <div className="min-w-0">
        <h1 className="text-[1.5rem] leading-8 font-semibold tracking-[-0.015em] sm:text-title">{title}</h1>
        <p className="mt-1 max-w-2xl text-body text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">{actions}</div> : null}
    </div>
  );
}

/* ---------------- Sections ---------------- */

/** Content sits on the ground by default. Use `raised` only for tables and important panels. */
export function Section({
  title,
  description,
  actions,
  children,
  className,
  raised,
  source,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  raised?: boolean;
  source?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
      className={cn(raised && "rounded-[var(--radius-panel)] border border-line bg-panel p-4 sm:p-5", className)}
    >
      {title || actions ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            {title ? (
              <h2 id={id ? `${id}-title` : undefined} className="text-section font-semibold">
                {title}
              </h2>
            ) : null}
            {description ? <p className="mt-0.5 text-small text-muted-foreground">{description}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
      {source ? <SourceNote source={source} className="mt-3" /> : null}
    </section>
  );
}

export function SourceNote({ source, className }: { source: string; className?: string }) {
  return (
    <p className={cn("flex items-center gap-1.5 text-caption text-muted-foreground", className)}>
      <Database className="size-3" aria-hidden />
      From {source}
    </p>
  );
}

/* ---------------- Info tip ---------------- */

export function InfoTip({ id, text, label }: { id?: MetricId; text?: string; label?: string }) {
  const def = id ? metric(id) : null;
  const body = text ?? def?.explanation ?? "";
  const name = label ?? def?.name ?? "this number";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="-m-2 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-ink"
          aria-label={`What is ${name}?`}
        >
          <Info className="size-3.5" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{body}</p>
        {def ? <p className="mt-1.5 text-caption opacity-70">From {def.source}</p> : null}
      </TooltipContent>
    </Tooltip>
  );
}

/* ---------------- Empty states ---------------- */

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      {Icon ? (
        <span className="mb-3 flex size-11 items-center justify-center rounded-full bg-subtle">
          <Icon className="size-5 text-muted-foreground" aria-hidden />
        </span>
      ) : null}
      <p className="text-body font-medium">{title}</p>
      {children ? <p className="mt-1 max-w-sm text-small text-muted-foreground">{children}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/* ---------------- Loading skeletons ---------------- */

export function PageSkeleton({ kpis = 4, charts = 2 }: { kpis?: number; charts?: number }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="mt-3 h-4 w-80 max-w-full" />
      <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
        {Array.from({ length: kpis }).map((_, i) => (
          <div key={i}>
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="mt-3 h-8 w-20" />
            <Skeleton className="mt-2 h-3 w-28" />
          </div>
        ))}
      </div>
      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        {Array.from({ length: charts }).map((_, i) => (
          <div key={i}>
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-4 h-56 w-full rounded-[14px]" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Date range picker ---------------- */

const PRESETS: RangePreset[] = ["today", "yesterday", "7d", "30d", "month"];

const toInput = (ts: number) => fmt(ts, "yyyy-MM-dd");
const fromInput = (v: string) => fromZonedTime(`${v}T00:00:00`, TZ).getTime();

export function DateRangePicker({
  value,
  custom,
  onChange,
  presets = PRESETS,
}: {
  value?: RangePreset;
  custom?: { from: number; to: number } | null;
  onChange?: (preset: RangePreset, custom?: { from: number; to: number }) => void;
  presets?: RangePreset[];
}) {
  const globalPreset = useAppStore((s) => s.rangePreset);
  const globalCustom = useAppStore((s) => s.customRange);
  const setRange = useAppStore((s) => s.setRange);
  const now = useDataStore((s) => s.now);
  const preset = value ?? globalPreset;
  const customRange = custom !== undefined ? custom : globalCustom;
  const change = onChange ?? setRange;
  const [open, setOpen] = useState(false);
  const today = nyStartOfDay(now || 0);
  const minDay = nyAddDays(today, -89);
  const [from, setFrom] = useState(() => toInput(customRange?.from ?? nyAddDays(today, -13)));
  const [to, setTo] = useState(() => toInput(customRange?.to ?? today));

  const label =
    preset === "custom" && customRange ? `${fmt(customRange.from, "MMM d")} to ${fmt(customRange.to, "MMM d")}` : RANGE_LABELS[preset];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="min-w-0 flex-1 justify-between sm:min-w-40 sm:flex-none" aria-label={`Date range: ${label}. Change`}>
          <CalendarDays className="text-muted-foreground" aria-hidden />
          <span className="flex-1 text-left">{label}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <div role="radiogroup" aria-label="Date range" className="grid gap-0.5">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={preset === p}
              onClick={() => {
                change(p);
                setOpen(false);
              }}
              className={cn(
                "flex h-10 items-center rounded-[8px] px-2.5 text-left text-small hover:bg-subtle",
                preset === p && "bg-subtle font-medium",
              )}
            >
              {RANGE_LABELS[p]}
            </button>
          ))}
        </div>
        <form
          className="mt-2 border-t border-line px-1 pt-3 pb-1"
          onSubmit={(e) => {
            e.preventDefault();
            const f = fromInput(from);
            const t = fromInput(to);
            if (Number.isNaN(f) || Number.isNaN(t)) return;
            change("custom", { from: Math.min(f, t), to: Math.max(f, t) });
            setOpen(false);
          }}
        >
          <p className="mb-2 text-caption text-muted-foreground">Custom range, up to 90 days back</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="range-from" className="text-caption">
                From
              </Label>
              <Input id="range-from" type="date" value={from} min={toInput(minDay)} max={toInput(today)} onChange={(e) => setFrom(e.target.value)} className="mt-1 px-2" />
            </div>
            <div>
              <Label htmlFor="range-to" className="text-caption">
                To
              </Label>
              <Input id="range-to" type="date" value={to} min={toInput(minDay)} max={toInput(today)} onChange={(e) => setTo(e.target.value)} className="mt-1 px-2" />
            </div>
          </div>
          <Button type="submit" size="sm" className="mt-3 w-full">
            Show custom range
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
