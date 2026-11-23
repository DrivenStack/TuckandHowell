"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtAgo, fmtTime } from "@/lib/time";
import { useAppStore, type ThemeChoice } from "@/store/app";
import { useDataStore } from "@/store/data";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/overlays";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/primitives";
import { isActive, NAV } from "./nav";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const status = useDataStore((s) => s.status);

  return (
    <div className="min-h-dvh overflow-x-clip lg:pl-[15.5rem]">
      <a
        href="#main"
        className="sr-only z-[60] rounded-md bg-ink px-3 py-2 text-on-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <Sidebar pathname={pathname} />
      <Header pathname={pathname} />
      <main id="main" className="mx-auto w-full min-w-0 max-w-[1240px] px-4 pt-5 pb-16 sm:px-6 lg:px-8 lg:pt-8">
        {status === "error" ? <LoadError /> : children}
      </main>
    </div>
  );
}

function LoadError() {
  const error = useDataStore((s) => s.error);
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
      <h1 className="text-section font-semibold">We could not load the call center data</h1>
      <p className="text-small text-muted-foreground">{error ?? "Something went wrong."} Reload the page to try again.</p>
      <Button onClick={() => window.location.reload()}>Reload the page</Button>
    </div>
  );
}

function Wordmark({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex flex-col leading-none outline-none", className)} aria-label="Tuck & Howell Call Center, home">
      <span className="text-[1.0625rem] font-semibold tracking-[-0.01em] whitespace-nowrap">Tuck &amp; Howell</span>
      <span className="mt-1 text-caption opacity-70">Call Center</span>
    </Link>
  );
}

/* ---------------- Sidebar (desktop) ---------------- */

function Sidebar({ pathname }: { pathname: string }) {
  const simulationOn = useAppStore((s) => s.simulationOn);
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[15.5rem] flex-col bg-rail text-rail-text lg:flex">
      <div className="px-6 pt-7 pb-8 text-rail-active">
        <Wordmark />
      </div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3">
        <ul className="space-y-0.5">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-10 items-center gap-3 rounded-[10px] px-3 text-small transition-colors focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[var(--cool)]",
                    active ? "bg-white/[0.08] font-medium text-rail-active" : "hover:bg-white/[0.04] hover:text-rail-active",
                  )}
                >
                  <item.icon className={cn("size-[18px]", active ? "opacity-100" : "opacity-70")} aria-hidden />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="space-y-1 px-6 pt-4 pb-6 text-caption">
        <p className="flex items-center gap-2">
          <span className={cn("size-1.5 rounded-full", simulationOn ? "bg-[#7cc4a0]" : "bg-rail-text/50")} aria-hidden />
          {simulationOn ? "Live demo running" : "Live demo paused"}
        </p>
        <p className="opacity-70">Dummy data for now</p>
      </div>
    </aside>
  );
}

/* ---------------- Header ---------------- */

function Header({ pathname }: { pathname: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-ground/90 pt-[env(safe-area-inset-top)] backdrop-blur-md supports-[backdrop-filter]:bg-ground/75">
      <div className="mx-auto flex h-14 w-full max-w-[1240px] items-center gap-1 px-4 sm:px-6 lg:h-16 lg:px-8">
        <Wordmark className="text-ink lg:hidden" />
        <div className="flex-1" />
        <Freshness />
        <ThemeToggle />
      </div>
      {/* Tabs on phones and tablets: a full-width switch under the header */}
      <nav aria-label="Main" className="px-4 pb-3 sm:px-6 lg:hidden">
        <div className="grid grid-cols-2 gap-1 rounded-[12px] bg-subtle p-1">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center justify-center gap-1.5 rounded-[9px] px-1 text-[0.8125rem] font-medium whitespace-nowrap transition-colors",
                  active ? "bg-panel text-ink shadow-sm" : "text-muted-foreground hover:text-ink",
                )}
              >
                <item.icon className={cn("hidden size-4 shrink-0 min-[400px]:block", active && "text-cool")} aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}

function Freshness() {
  const last = useDataStore((s) => s.lastUpdatedAt);
  const now = useDataStore((s) => s.now);
  const statuses = useDataStore((s) => s.sourceStatuses);
  const [clock, setClock] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);
  if (!last) return <span className="mr-2 h-4 w-24 animate-pulse rounded bg-subtle" aria-hidden />;
  const ref = Math.max(now, clock);
  const ago = fmtAgo(last, ref);
  const fresh = ref - last < 5 * 60_000;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="mr-1 flex h-11 shrink-0 items-center gap-2 rounded-[10px] px-2 text-caption text-muted-foreground hover:bg-subtle sm:text-small"
          aria-label={`Data updated ${ago}. Source: ServiceTitan.`}
        >
          <span className={cn("size-2 rounded-full", fresh ? "bg-success" : "bg-warm")} aria-hidden />
          <span className="hidden sm:inline">Updated {ago}</span>
          <span className="num whitespace-nowrap sm:hidden">{ago.replace(" ago", "")}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end" className="w-64">
        <p className="mb-2 font-medium">Last update {fmtTime(last)}</p>
        <ul className="space-y-1">
          {statuses.map((s) => (
            <li key={s.system} className="flex justify-between gap-3">
              <span>{s.system}</span>
              <span className="opacity-70">{s.state === "On hold" ? "On hold" : s.lastSyncedAt ? fmtAgo(s.lastSyncedAt, ref) : "Not synced"}</span>
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

const THEMES: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

function ThemeToggle() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Change appearance">
          <Sun className="size-5 dark:hidden" aria-hidden />
          <Moon className="hidden size-5 dark:block" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {THEMES.map((t) => (
          <DropdownMenuItem key={t.value} onSelect={() => setTheme(t.value)}>
            <t.icon aria-hidden />
            <span className="flex-1">{t.label}</span>
            {theme === t.value ? <Check className="text-cool" aria-label="Selected" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
