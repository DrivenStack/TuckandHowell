"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import { CheckCircle2, Monitor, Moon, PauseCircle, Play, RotateCcw, Sun, Zap } from "lucide-react";
import { simulateTick } from "@/lib/callbacks/simulator";
import { Rng } from "@/lib/data/mock/rng";
import { callStats } from "@/lib/metrics/calculations";
import { METRICS, SOURCE_OF_TRUTH_NOTE, type MetricDefinition } from "@/lib/metrics/definitions";
import { fmtAgo, nyDayKey, nyStartOfDay } from "@/lib/time";
import { cn } from "@/lib/utils";
import { DEFAULT_CALLBACK_SETTINGS, type CallbackSettings } from "@/lib/types";
import { useAppStore, type ThemeChoice } from "@/store/app";
import { useDataStore } from "@/store/data";
import { useReady } from "@/components/app/hooks";
import { Chip } from "@/components/common/chips";
import { CsrAvatar } from "@/components/common/csr-avatar";
import { PageHeader, PageSkeleton, Section } from "@/components/common/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, Switch } from "@/components/ui/primitives";

export function SettingsView() {
  const ready = useReady();
  if (!ready) return <PageSkeleton kpis={0} charts={1} />;
  return <Settings />;
}

const NAV = [
  ["rules", "Callback rules"],
  ["sources", "Data sources"],
  ["metrics", "Metric definitions"],
  ["users", "Users and roles"],
  ["simulation", "Simulation"],
  ["appearance", "Appearance"],
] as const;

function Settings() {
  return (
    <div>
      <PageHeader title="Settings" description="Callback rules, where the data comes from, what every number means, and how the app looks." />
      <nav aria-label="Settings sections" className="scrollbar-none -mx-4 mb-10 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {NAV.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="flex h-10 shrink-0 items-center rounded-full border border-line-strong px-3.5 text-small hover:bg-subtle">
            {label}
          </a>
        ))}
      </nav>
      <div className="space-y-16">
        <Rules />
        <Sources />
        <Metrics />
        <Users />
        <Simulation />
        <Appearance />
      </div>
    </div>
  );
}

/* ---------------- Callback rules ---------------- */

const RULE_FIELDS: { key: keyof CallbackSettings; label: string; help: string; unit: string; min: number; max: number; step?: number; scale?: number }[] = [
  { key: "minCallSeconds", label: "Minimum call length that counts as a real callback", help: "Shorter answered calls count as an attempt, not contact.", unit: "seconds", min: 5, max: 300 },
  { key: "maxAttempts", label: "Attempts before closing", help: "After this many tries with no answer, the item closes.", unit: "attempts", min: 1, max: 10 },
  { key: "retryWaitMinutes", label: "Wait between attempts", help: "How long an item stays in Attempted before it comes back to Needs callback.", unit: "hours", min: 0.25, max: 24, step: 0.25, scale: 60 },
  { key: "claimExpiryMinutes", label: "Claim expires after", help: "If the CSR who claimed it has not called by then, anyone can take it.", unit: "minutes", min: 1, max: 120 },
  { key: "alertAfterMinutes", label: "Mark a waiting customer as urgent after", help: "After this long, the customer shows as urgent in red on Today and Callbacks.", unit: "minutes", min: 5, max: 240 },
];

function Rules() {
  const settings = useAppStore((s) => s.settings);
  const update = useAppStore((s) => s.updateSettings);
  const reset = useAppStore((s) => s.resetSettings);
  const changed = JSON.stringify(settings) !== JSON.stringify(DEFAULT_CALLBACK_SETTINGS);
  return (
    <Section
      id="rules"
      title="Callback rules"
      description="These rules decide when a customer moves between Needs callback, Attempted, Called back, Booked and Closed. Changes apply right away."
      actions={
        changed ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              reset();
              toast("Rules reset to the defaults");
            }}
          >
            <RotateCcw aria-hidden />
            Reset to defaults
          </Button>
        ) : null
      }
    >
      <p className="mb-5 inline-flex rounded-[10px] bg-warm-tint px-3 py-2 text-small text-warm-text">Draft rules. To be confirmed with the call center manager.</p>
      <div className="divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-panel">
        {RULE_FIELDS.map((f) => {
          const raw = settings[f.key] as number;
          const shown = f.scale ? raw / f.scale : raw;
          const def = DEFAULT_CALLBACK_SETTINGS[f.key] as number;
          return (
            <div key={f.key} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="max-w-xl">
                <Label htmlFor={`rule-${f.key}`}>{f.label}</Label>
                <p className="mt-0.5 text-caption text-muted-foreground">
                  {f.help} Default {f.scale ? def / f.scale : def} {f.unit}.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  id={`rule-${f.key}`}
                  type="number"
                  inputMode="decimal"
                  min={f.min}
                  max={f.max}
                  step={f.step ?? 1}
                  value={shown}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isNaN(v)) return;
                    const clamped = Math.min(f.max, Math.max(f.min, v));
                    update({ [f.key]: f.scale ? Math.round(clamped * f.scale) : Math.round(clamped) } as Partial<CallbackSettings>);
                  }}
                  className="w-24 text-right"
                />
                <span className="w-16 text-small text-muted-foreground">{f.unit}</span>
              </div>
            </div>
          );
        })}
        <div className="flex items-center justify-between gap-4 p-4 sm:p-5">
          <div className="max-w-xl">
            <Label htmlFor="rule-texts">Texts count as contact</Label>
            <p className="mt-0.5 text-caption text-muted-foreground">When on, a text to the customer moves them to Called back like an answered call. Default off.</p>
          </div>
          <Switch id="rule-texts" checked={settings.textsCountAsContact} onCheckedChange={(v) => update({ textsCountAsContact: v })} />
        </div>
      </div>
    </Section>
  );
}

/* ---------------- Data sources ---------------- */

function Sources() {
  const statuses = useDataStore((s) => s.sourceStatuses);
  const now = useDataStore((s) => s.now);
  const order = ["ServiceTitan", "Dialpad", "AI Voice Agent", "GoHighLevel", "Hatch", "Lace AI"];
  return (
    <Section id="sources" title="Data sources" description="Where each number comes from. All connections are simulated in this demo.">
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[...statuses]
          .sort((a, b) => order.indexOf(a.system) - order.indexOf(b.system))
          .map((s) => {
            const onHold = s.state === "On hold";
            return (
              <li key={s.system} className={cn("rounded-[var(--radius-panel)] border p-4", onHold ? "border-dashed border-line-strong" : "border-line bg-panel")}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-body font-semibold">{s.system}</p>
                  <Chip tone={onHold ? "warm" : "success"} icon={onHold ? PauseCircle : CheckCircle2}>
                    {s.state}
                  </Chip>
                </div>
                <p className="mt-1 text-small text-muted-foreground">{s.note}</p>
                <p className="mt-3 text-caption text-muted-foreground">
                  {s.lastSyncedAt ? `Last sync ${fmtAgo(s.lastSyncedAt, now)}` : "Never synced"}
                </p>
              </li>
            );
          })}
      </ul>
    </Section>
  );
}

/* ---------------- Metric definitions ---------------- */

function Metrics() {
  const { data, now } = useReady()!;
  const groups = useMemo(() => {
    const m = new Map<string, MetricDefinition[]>();
    for (const d of Object.values(METRICS)) m.set(d.group, [...(m.get(d.group) ?? []), d]);
    return [...m.entries()];
  }, []);
  const today = callStats(data, nyStartOfDay(now), now).callsIn;
  const internal = data.dialpadInternalCallsByDay[nyDayKey(now)] ?? 0;
  return (
    <Section id="metrics" title="Metric definitions" description="Every number in the app, in plain words, with how it is worked out and which system we trust for it.">
      <div className="mb-6 max-w-3xl rounded-[var(--radius-panel)] border border-line bg-panel p-4 sm:p-5">
        <p className="text-small font-medium">Source of truth</p>
        <p className="mt-1 text-small text-muted-foreground">{SOURCE_OF_TRUTH_NOTE}</p>
        <p className="num mt-3 text-small">
          Today so far: ServiceTitan shows {today} customer calls. Dialpad would show {today + internal}, because it also counts {internal} internal calls between staff.
        </p>
      </div>
      <div className="space-y-8">
        {groups.map(([group, defs]) => (
          <div key={group}>
            <h3 className="mb-2 text-small font-semibold text-muted-foreground">{group}</h3>
            <dl className="divide-y divide-line border-y border-line">
              {defs.map((d) => (
                <div key={d.id} className="grid gap-1 py-3 sm:grid-cols-[14rem_1fr_12rem] sm:gap-4">
                  <dt className="text-small font-medium">{d.name}</dt>
                  <dd className="text-small">
                    {d.explanation}
                    <span className="mt-0.5 block text-caption text-muted-foreground">{d.formula}</span>
                  </dd>
                  <dd className="text-caption text-muted-foreground sm:text-right">From {d.source}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ---------------- Users ---------------- */

function Users() {
  const { data } = useReady()!;
  const access: Record<string, string> = {
    Owner: "Everything",
    "Co-owner": "Everything, starts on Owner snapshot",
    Manager: "Everything",
    CSR: "Callbacks and their own numbers",
  };
  return (
    <Section id="users" title="Users and roles" description="Who can see what. Use the role switcher in the header to try each view.">
      <ul className="divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-panel">
        {data.users.map((u) => {
          const csr = u.csrId ? data.csrs.find((c) => c.id === u.csrId) : undefined;
          return (
            <li key={u.id} className="flex items-center gap-3 px-4 py-3">
              {csr ? (
                <CsrAvatar csr={csr} size="sm" />
              ) : (
                <span className="flex size-7 items-center justify-center rounded-full bg-ink text-[0.6875rem] font-semibold text-on-ink">{u.name.slice(0, 2)}</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-small font-medium">{u.name}</p>
                <p className="truncate text-caption text-muted-foreground">{access[u.role]}</p>
              </div>
              <Chip tone={u.role === "CSR" ? "neutral" : "cool"}>{u.role}</Chip>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/* ---------------- Simulation ---------------- */

function Simulation() {
  const on = useAppStore((s) => s.simulationOn);
  const set = useAppStore((s) => s.setSimulation);
  return (
    <Section id="simulation" title="Simulation" description="While on, a realistic event happens every 20 to 40 seconds: missed calls, AI Voice Agent calls, callbacks, customers calling in, and bookings.">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant={on ? "outline" : "default"}
          onClick={() => {
            set(!on);
            toast(on ? "Simulation paused" : "Simulation playing");
          }}
        >
          {on ? <PauseCircle aria-hidden /> : <Play aria-hidden />}
          {on ? "Pause simulation" : "Play simulation"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            const s = useDataStore.getState();
            if (!s.data) return;
            const event = simulateTick(
              { customers: s.data.customers, csrs: s.data.csrs, callbacks: s.callbacks, goLiveAt: s.data.goLiveAt, now: Date.now() },
              new Rng(Date.now()),
            );
            s.applyEvent(event, { notify: true });
          }}
        >
          <Zap aria-hidden />
          Make something happen now
        </Button>
        <span className="text-small text-muted-foreground">{on ? "Running" : "Paused"}</span>
      </div>
    </Section>
  );
}

/* ---------------- Appearance ---------------- */

function Appearance() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const opts: { v: ThemeChoice; label: string; icon: typeof Sun }[] = [
    { v: "light", label: "Light", icon: Sun },
    { v: "dark", label: "Dark", icon: Moon },
    { v: "system", label: "Match my device", icon: Monitor },
  ];
  return (
    <Section id="appearance" title="Appearance">
      <div role="radiogroup" aria-label="Appearance" className="grid max-w-xl grid-cols-3 gap-2">
        {opts.map((o) => (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={theme === o.v}
            onClick={() => setTheme(o.v)}
            className={cn(
              "flex h-20 flex-col items-center justify-center gap-1.5 rounded-[12px] border text-small",
              theme === o.v ? "border-cool bg-cool-tint font-medium" : "border-line-strong hover:bg-subtle",
            )}
          >
            <o.icon className="size-5" aria-hidden />
            {o.label}
          </button>
        ))}
      </div>
    </Section>
  );
}
