"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Clock, Filter, Hourglass, PhoneMissed, Search, X } from "lucide-react";
import { LIST_LABELS, sortByPriority, sortByResolved, timeToCallback } from "@/lib/callbacks/engine";
import { median, dailySeries, fmtMinutes, fmtPct, type Range } from "@/lib/metrics/calculations";
import { fmtDuration, fmtStamp, MINUTE, nyAddDays, nyStartOfDay } from "@/lib/time";
import { cn } from "@/lib/utils";
import { CITIES, JOB_TYPES, type Callback, type CallbackList, type CallbackTrigger, type Customer, type Priority } from "@/lib/types";
import { useAppStore } from "@/store/app";
import { useDataStore } from "@/store/data";
import { useCsrs, useCustomers, useRange, useReady } from "@/components/app/hooks";
import { CallButton, ClaimControl, OutcomeMenu } from "@/components/callbacks/actions";
import { CallbackDrawer } from "@/components/callbacks/drawer";
import { StackedBars, TrendLineChart } from "@/components/charts/charts";
import { C } from "@/components/charts/kit";
import { Chip, PriorityLabel, TRIGGER_LABELS, TriggerLabel, VipBadge, waitTone } from "@/components/common/chips";
import { CsrAvatar } from "@/components/common/csr-avatar";
import { DateRangePicker, EmptyState, InfoTip, PageHeader, PageSkeleton, Section, SourceNote } from "@/components/common/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, Switch } from "@/components/ui/primitives";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/overlays";

type Tab = CallbackList | "mine";

interface Filters {
  priority: Priority | "all";
  trigger: CallbackTrigger | "all";
  jobType: string;
  vip: boolean;
  claimedBy: string;
  city: string;
}
const NO_FILTERS: Filters = { priority: "all", trigger: "all", jobType: "all", vip: false, claimedBy: "all", city: "all" };

export function CallbacksView() {
  const ready = useReady();
  if (!ready) return <PageSkeleton kpis={0} charts={1} />;
  return <Callbacks />;
}

function Callbacks() {
  const { data, callbacks, now } = useReady()!;
  const customers = useCustomers();
  const csrs = useCsrs();
  const role = useAppStore((s) => s.role);
  const csrId = useAppStore((s) => s.csrId);
  const setRole = useAppStore((s) => s.setRole);
  const range = useRange();
  const recentlyMoved = useDataStore((s) => s.recentlyMoved);
  const [tab, setTab] = useState<Tab>("needs_callback");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [chartsOpen, setChartsOpen] = useState(false);

  // Deep link to one customer: /callbacks?item=cb_...
  useEffect(() => {
    const item = new URLSearchParams(window.location.search).get("item");
    if (!item) return;
    const id = window.setTimeout(() => setSelected(item), 0);
    return () => window.clearTimeout(id);
  }, []);

  const tracked = useMemo(() => callbacks.filter((c) => c.firstMissedAt >= data.goLiveAt), [callbacks, data.goLiveAt]);
  const inRange = (cb: Callback) => (cb.resolvedAt ?? cb.lastMissedAt) >= range.from && (cb.resolvedAt ?? cb.lastMissedAt) <= range.to;

  const lists = useMemo(() => {
    const by: Record<CallbackList, Callback[]> = { needs_callback: [], attempted: [], called_back: [], booked: [], closed: [] };
    for (const cb of tracked) by[cb.list].push(cb);
    return by;
  }, [tracked]);

  const resolvedInRange = {
    called_back: lists.called_back.filter(inRange),
    booked: lists.booked.filter(inRange),
    closed: lists.closed.filter(inRange),
  };
  const mine = lists.needs_callback.filter((c) => c.claim?.csrId === csrId);

  const tabs: { id: Tab; label: string; count: number }[] =
    role === "csr"
      ? [
          { id: "needs_callback", label: "Needs callback", count: lists.needs_callback.length },
          { id: "mine", label: "My claims", count: mine.length },
        ]
      : [
          { id: "needs_callback", label: LIST_LABELS.needs_callback, count: lists.needs_callback.length },
          { id: "attempted", label: LIST_LABELS.attempted, count: lists.attempted.length },
          { id: "called_back", label: LIST_LABELS.called_back, count: resolvedInRange.called_back.length },
          { id: "booked", label: LIST_LABELS.booked, count: resolvedInRange.booked.length },
          { id: "closed", label: LIST_LABELS.closed, count: resolvedInRange.closed.length },
        ];
  const activeTab = tabs.some((t) => t.id === tab) ? tab : "needs_callback";

  const base: Callback[] =
    activeTab === "mine"
      ? mine
      : activeTab === "needs_callback"
        ? lists.needs_callback
        : activeTab === "attempted"
          ? lists.attempted
          : resolvedInRange[activeTab];

  const q = query.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, "");
  const filtered = base.filter((cb) => {
    const c = customers.get(cb.customerId);
    if (!c) return false;
    if (q) {
      const nameHit = c.name.toLowerCase().includes(q);
      const phoneHit = qDigits.length >= 3 && c.phones.some((p) => p.replace(/\D/g, "").includes(qDigits));
      if (!nameHit && !phoneHit) return false;
    }
    if (filters.priority !== "all" && cb.priority !== filters.priority) return false;
    if (filters.trigger !== "all" && cb.trigger !== filters.trigger) return false;
    if (filters.jobType !== "all" && cb.jobType !== filters.jobType) return false;
    if (filters.vip && !c.isVip) return false;
    if (filters.claimedBy !== "all" && (filters.claimedBy === "none" ? !!cb.claim : cb.claim?.csrId !== filters.claimedBy)) return false;
    if (filters.city !== "all" && c.city !== filters.city) return false;
    return true;
  });
  const sorted = activeTab === "needs_callback" || activeTab === "mine" || activeTab === "attempted" ? sortByPriority(filtered) : sortByResolved(filtered);
  const activeFilterCount = Object.entries(filters).filter(([k, v]) => v !== NO_FILTERS[k as keyof Filters]).length;
  const resolvedTab = activeTab === "called_back" || activeTab === "booked" || activeTab === "closed";
  const selectedCb = selected ? callbacks.find((c) => c.id === selected) ?? null : null;

  return (
    <div>
      <PageHeader
        title="Callbacks"
        description="Everyone who called and did not get help. Customers move between lists on their own as calls happen. Work from the top."
        actions={
          <>
            {role !== "csr" ? (
              <Select value={csrId} onValueChange={(v) => setRole(role, v)}>
                <SelectTrigger className="min-w-0 flex-1 sm:w-auto sm:flex-none sm:min-w-48" aria-label="Working as">
                  <span className="sr-only">Working as</span>
                  <span className="hidden text-muted-foreground sm:inline">Working as</span>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  {data.csrs.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {role !== "csr" ? <DateRangePicker /> : null}
          </>
        }
      />

      {role !== "csr" ? (
        <CallbackCharts range={range} open={chartsOpen} onToggle={() => setChartsOpen((o) => !o)} />
      ) : null}

      {/* Lists */}
      <div role="tablist" aria-label="Callback lists" className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {tabs.map((t) => {
          const active = t.id === activeTab;
          return (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex h-11 shrink-0 items-center gap-2 rounded-[10px] px-3.5 text-small font-medium transition-colors",
                active ? "bg-ink text-on-ink" : "text-muted-foreground hover:bg-subtle hover:text-ink",
              )}
            >
              {t.label}
              <motion.span
                key={t.count}
                initial={{ scale: 1.25, opacity: 0.6 }}
                animate={{ scale: 1, opacity: 1 }}
                className={cn(
                  "num min-w-6 rounded-full px-1.5 text-center text-caption",
                  active ? "bg-white/15" : t.id === "needs_callback" && t.count ? "bg-alarm-tint text-alarm" : "bg-subtle",
                )}
              >
                {t.count}
              </motion.span>
            </button>
          );
        })}
      </div>
      {resolvedTab ? <p className="mt-2 text-caption text-muted-foreground">Showing items handled in: {range.label.toLowerCase()}</p> : null}

      <div className="mt-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or phone"
            aria-label="Search by name or phone"
            className="pl-9"
          />
        </div>
        <Button variant="outline" onClick={() => setFiltersOpen(true)} aria-label={`Filters${activeFilterCount ? `, ${activeFilterCount} on` : ""}`}>
          <Filter aria-hidden />
          <span className="hidden sm:inline">Filters</span>
          {activeFilterCount ? <span className="num rounded-full bg-cool px-1.5 text-caption text-white dark:text-ground">{activeFilterCount}</span> : null}
        </Button>
      </div>

      <div role="tabpanel" aria-label={tabs.find((t) => t.id === activeTab)?.label} className="mt-4">
        {sorted.length ? (
          <ul className="space-y-2">
            <AnimatePresence initial={false} mode="popLayout">
              {sorted.slice(0, 120).map((cb) => (
                <CallbackRow
                  key={cb.id}
                  cb={cb}
                  customer={customers.get(cb.customerId)!}
                  now={now}
                  resolved={resolvedTab}
                  highlight={!!recentlyMoved[cb.id]}
                  handler={cb.resolvedByCsrId ? csrs.get(cb.resolvedByCsrId) : undefined}
                  onOpen={() => setSelected(cb.id)}
                />
              ))}
            </AnimatePresence>
            {sorted.length > 120 ? (
              <li className="py-3 text-center text-small text-muted-foreground">Showing 120 of {sorted.length}. Narrow the date range or search to see more.</li>
            ) : null}
          </ul>
        ) : (
          <EmptyList tab={activeTab} filtered={base.length > 0} onClear={() => { setFilters(NO_FILTERS); setQuery(""); }} />
        )}
      </div>
      <SourceNote source="ServiceTitan, Dialpad and the AI Voice Agent" className="mt-6" />

      <FiltersSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        filters={filters}
        setFilters={setFilters}
        csrs={data.csrs}
        resultCount={filtered.length}
      />
      <CallbackDrawer cb={selectedCb} onOpenChange={(o) => !o && setSelected(null)} />
    </div>
  );
}

function EmptyList({ tab, filtered, onClear }: { tab: Tab; filtered: boolean; onClear: () => void }) {
  if (filtered) {
    return (
      <EmptyState icon={Search} title="No one matches these filters" action={<Button variant="outline" onClick={onClear}>Clear search and filters</Button>}>
        Try a different name or phone number, or clear the filters.
      </EmptyState>
    );
  }
  const copy: Record<Tab, [string, string]> = {
    needs_callback: ["No one is waiting", "New missed calls will appear here."],
    mine: ["You have no claimed callbacks", "Claim someone from Needs callback to lock them to you while you call."],
    attempted: ["No one is in Attempted", "When a call goes unanswered, the customer waits here until it is time to try again."],
    called_back: ["No callbacks in this period", "Customers someone reached will show here with who called and how long it took."],
    booked: ["No bookings from callbacks in this period", "When a callback turns into a job, it moves here."],
    closed: ["Nothing closed in this period", "Wrong numbers, spam, and customers we could not reach after the last attempt end up here."],
  };
  return (
    <EmptyState icon={PhoneMissed} title={copy[tab][0]} className="rounded-[var(--radius-panel)] border border-dashed border-line-strong">
      {copy[tab][1]}
    </EmptyState>
  );
}

function CallbackRow({
  cb,
  customer,
  now,
  resolved,
  highlight,
  handler,
  onOpen,
}: {
  cb: Callback;
  customer: Customer;
  now: number;
  resolved: boolean;
  highlight: boolean;
  handler?: { name: string; initials: string; avatarTone: string; firstName: string };
  onOpen: () => void;
}) {
  const settings = useAppStore((s) => s.settings);
  const reduce = useReducedMotion();
  const waitMin = (now - cb.firstMissedAt) / MINUTE;
  const tone = waitTone(waitMin, settings.alertAfterMinutes);
  const ttc = timeToCallback(cb);
  const retryAt = cb.list === "attempted" && cb.lastAttemptAt ? cb.lastAttemptAt + settings.retryWaitMinutes * MINUTE : null;

  return (
    <motion.li
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, x: 40, transition: { duration: 0.25 } }}
      transition={{ duration: 0.25 }}
      className={cn(
        "rounded-[var(--radius-panel)] border bg-panel transition-colors duration-700",
        highlight ? "border-cool/60 bg-cool-tint" : "border-line",
        !resolved && cb.priority === "Urgent" && !highlight && "border-l-[3px] border-l-alarm",
      )}
    >
      <div className="grid gap-3 p-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto] md:items-center md:gap-5">
        {/* who */}
        <button type="button" onClick={onOpen} className="min-w-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-[8px]">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-body font-semibold">{customer.name}</span>
            {customer.isVip ? <VipBadge /> : null}
            {!resolved ? <PriorityLabel priority={cb.priority} /> : null}
          </span>
          <span className="num mt-0.5 block text-small text-muted-foreground">
            {customer.phones[0]}
            {customer.phones.length > 1 ? ` and 1 more` : ""}, {customer.city}
          </span>
        </button>

        {/* why */}
        <div className="min-w-0">
          <p className="text-small font-medium">{cb.jobType}</p>
          <TriggerLabel trigger={cb.trigger} className="text-caption" />
        </div>

        {/* wait or outcome */}
        <div className="min-w-0">
          {!resolved ? (
            <>
              <Chip tone={tone} icon={tone === "alarm" ? Hourglass : Clock} className="num">
                Waiting {fmtDuration(now - cb.firstMissedAt)}
              </Chip>
              <p className="num mt-1 text-caption text-muted-foreground">
                {cb.missedCount > 1 ? `${cb.missedCount} calls` : "1 call"}
                {cb.attempts ? `, ${cb.attempts} ${cb.attempts === 1 ? "attempt" : "attempts"}` : ""}
                {retryAt ? `, retry ${retryAt <= now ? "now" : `at ${fmtStamp(retryAt, now).replace("Today, ", "")}`}` : ""}
              </p>
            </>
          ) : (
            <div className="flex items-center gap-2">
              {handler ? <CsrAvatar csr={handler} size="sm" /> : null}
              <div className="min-w-0">
                <p className="truncate text-small">
                  {cb.list === "closed" ? cb.closeReason : handler ? `By ${handler.name}` : cb.list === "booked" ? "Booked" : "Called back"}
                </p>
                <p className="num text-caption text-muted-foreground">
                  {cb.resolvedAt ? fmtStamp(cb.resolvedAt, now) : ""}
                  {ttc !== null ? `, ${fmtDuration(ttc)} after missed call` : ""}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* actions */}
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {cb.list === "needs_callback" || cb.list === "attempted" ? (
            <>
              <ClaimControl cb={cb} compact />
              <CallButton cb={cb} customer={customer} compact />
              <OutcomeMenu cb={cb} compact />
            </>
          ) : (
            <Button variant="quiet" size="sm" onClick={onOpen}>
              View details
            </Button>
          )}
        </div>
      </div>
    </motion.li>
  );
}

/* ---------------- Charts ---------------- */

function CallbackCharts({ range, open, onToggle }: { range: Range; open: boolean; onToggle: () => void }) {
  const { data, callbacks, now } = useReady()!;
  const span = range.to - range.from < 6 * 24 * 60 * MINUTE;
  const from = span ? nyAddDays(nyStartOfDay(now), -13) : range.from;
  const to = span ? now : range.to;
  const days = useMemo(() => dailySeries(data, callbacks.filter((c) => c.firstMissedAt >= data.goLiveAt), Math.max(from, nyStartOfDay(data.goLiveAt)), to), [data, callbacks, from, to]);
  const ttcAll = days.map((d) => d.avgMinutesToCallback).filter((v): v is number => v !== null);
  const totals = days.reduce(
    (s, d) => ({ booked: s.booked + d.bookedFromCallbacks, spoke: s.spoke + d.spokeNoBooking, none: s.none + d.noAnswer, closed: s.closed + d.closedOther }),
    { booked: 0, spoke: 0, none: 0, closed: 0 },
  );
  const reached = totals.booked + totals.spoke;

  return (
    <div className="mb-8">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-[12px] border border-line bg-panel px-4 py-3 text-left lg:hidden"
      >
        <span>
          <span className="block text-small font-medium">How callbacks are going</span>
          <span className="num block text-caption text-muted-foreground">
            Typical time to call back {fmtMinutes(ttcAll.length ? median(ttcAll) : null)}, {fmtPct(reached ? totals.booked / reached : 0)} of reached customers booked
          </span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <div className={cn("mt-6 grid gap-10 lg:mt-0 lg:grid lg:grid-cols-2", open ? "grid" : "hidden")}>
        <Section
          title={
            <span className="flex items-center gap-1.5">
              Time to call back, by day
              <InfoTip id="time_to_callback" />
            </span>
          }
          description={span ? "Last 14 days since go-live. Lower is better." : `${range.label}. Lower is better.`}
          source="ServiceTitan"
        >
          <TrendLineChart
            data={days.map((d) => ({ label: d.label, value: d.avgMinutesToCallback === null ? null : Math.round(d.avgMinutesToCallback), callbacks: d.callbacks }))}
            format={(v) => fmtMinutes(v)}
            axisFormat={(v) => (v >= 60 ? `${Math.round(v / 6) / 10}h` : `${Math.round(v)}m`)}
            target={15}
            targetLabel="Goal"
            color={C.csr}
            area
            seriesName="Typical wait"
            label="Line chart of average minutes from missed call to first callback, by day."
            height={200}
            tooltipExtra={(p) => [{ label: "Callbacks needed", value: String(p.callbacks) }]}
          />
        </Section>
        <Section title="How callbacks ended" description="By the day the customer first called." source="ServiceTitan">
          <StackedBars
            data={days.map((d) => ({ label: d.label, booked: d.bookedFromCallbacks, spoke: d.spokeNoBooking, noAnswer: d.noAnswer, closed: d.closedOther }))}
            series={[
              { key: "booked", label: "Booked", color: C.success },
              { key: "spoke", label: "Spoke, no booking", color: C.csr },
              { key: "noAnswer", label: "No answer", color: C.warm },
              { key: "closed", label: "Closed", color: C.lineStrong },
            ]}
            height={200}
            label="Stacked bars of callback outcomes per day: booked, spoke but no booking, no answer, closed."
          />
        </Section>
      </div>
    </div>
  );
}

/* ---------------- Filters ---------------- */

function FiltersSheet({
  open,
  onOpenChange,
  filters,
  setFilters,
  csrs,
  resultCount,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  filters: Filters;
  setFilters: (f: Filters) => void;
  csrs: { id: string; name: string }[];
  resultCount: number;
}) {
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters({ ...filters, [k]: v });
  const field = (id: string, label: string, value: string, onChange: (v: string) => void, options: [string, string][]) => (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="mt-1.5">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => (
            <SelectItem key={v} value={v}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-sm">
        <div className="flex h-full flex-col">
          <div className="border-b border-line px-5 pt-5 pb-4">
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>Narrow the list. Search still applies.</SheetDescription>
          </div>
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
            {field("f-priority", "Priority", filters.priority, (v) => set("priority", v as Filters["priority"]), [
              ["all", "Any priority"],
              ["Urgent", "Urgent"],
              ["High", "High"],
              ["Normal", "Normal"],
            ])}
            {field("f-trigger", "Source", filters.trigger, (v) => set("trigger", v as Filters["trigger"]), [
              ["all", "Any source"],
              ...(Object.entries(TRIGGER_LABELS) as [string, string][]),
            ])}
            {field("f-job", "Job type", filters.jobType, (v) => set("jobType", v), [["all", "Any job type"], ...JOB_TYPES.map((j) => [j, j] as [string, string])])}
            {field("f-claim", "Claimed by", filters.claimedBy, (v) => set("claimedBy", v), [
              ["all", "Anyone or no one"],
              ["none", "Not claimed"],
              ...csrs.map((c) => [c.id, c.name] as [string, string]),
            ])}
            {field("f-city", "City", filters.city, (v) => set("city", v), [["all", "Any city"], ...CITIES.map((c) => [c, c] as [string, string])])}
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="f-vip">VIP members only</Label>
              <Switch id="f-vip" checked={filters.vip} onCheckedChange={(v) => set("vip", v)} />
            </div>
          </div>
          <div className="flex gap-2 border-t border-line px-5 py-4">
            <Button variant="outline" className="flex-1" onClick={() => setFilters(NO_FILTERS)}>
              <X aria-hidden />
              Clear filters
            </Button>
            <Button className="flex-1" onClick={() => onOpenChange(false)}>
              Show {resultCount}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
