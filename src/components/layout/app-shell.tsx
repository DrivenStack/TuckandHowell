"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Check, ChevronDown, Lock, Monitor, Moon, MoreHorizontal, Sun, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtAgo, fmtTime } from "@/lib/time";
import { canView, useAppStore, type Role, type ThemeChoice } from "@/store/app";
import { useDataStore } from "@/store/data";
import { CsrAvatar } from "@/components/common/csr-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/overlays";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/primitives";
import { CSRS } from "@/lib/data/mock/fixtures";
import { isActive, MY_NUMBERS_ICON, NAV, type NavItem } from "./nav";

function useNavItems(): NavItem[] {
  const role = useAppStore((s) => s.role);
  const csrId = useAppStore((s) => s.csrId);
  if (role !== "csr") return NAV;
  return [
    NAV.find((n) => n.href === "/callbacks")!,
    { href: `/team/${csrId}`, label: "My numbers", icon: MY_NUMBERS_ICON, tab: true, csr: true },
  ];
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const role = useAppStore((s) => s.role);
  const csrId = useAppStore((s) => s.csrId);
  const status = useDataStore((s) => s.status);
  const allowed = canView(role, pathname) && !(role === "csr" && pathname.startsWith("/team/") && pathname !== `/team/${csrId}`);

  return (
    <div className="min-h-dvh overflow-x-clip lg:pl-[15.5rem]">
      <a
        href="#main"
        className="sr-only z-[60] rounded-md bg-ink px-3 py-2 text-on-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <Sidebar pathname={pathname} />
      <Header />
      <main id="main" className="mx-auto w-full min-w-0 max-w-[1240px] px-4 pt-5 pb-32 sm:px-6 lg:px-8 lg:pt-8 lg:pb-16">
        {status === "error" ? <LoadError /> : allowed ? children : <Restricted />}
      </main>
      <BottomTabs pathname={pathname} />
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

function Restricted() {
  const csrId = useAppStore((s) => s.csrId);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
      <Lock className="size-6 text-muted-foreground" aria-hidden />
      <h1 className="text-section font-semibold">This page is for owners and managers</h1>
      <p className="text-small text-muted-foreground">
        As a CSR you can work the callback list and see your own numbers. Switch role in the header to see everything.
      </p>
      <div className="mt-2 flex gap-2">
        <Button asChild>
          <Link href="/callbacks">Open callbacks</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/team/${csrId}`}>My numbers</Link>
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Sidebar (desktop) ---------------- */

function Wordmark({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("group flex flex-col leading-none outline-none", className)} aria-label="Tuck & Howell Call Center, home">
      <span className="text-[1.0625rem] font-semibold tracking-[-0.01em] whitespace-nowrap">Tuck &amp; Howell</span>
      <span className="mt-1 text-caption opacity-70">Call Center</span>
    </Link>
  );
}

function Sidebar({ pathname }: { pathname: string }) {
  const items = useNavItems();
  const simulationOn = useAppStore((s) => s.simulationOn);
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[15.5rem] flex-col bg-rail text-rail-text lg:flex">
      <div className="px-6 pt-7 pb-8 text-rail-active">
        <Wordmark />
      </div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3">
        <ul className="space-y-0.5">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
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
                  <Icon className={cn("size-[18px]", active ? "opacity-100" : "opacity-70")} aria-hidden />
                  <span className="flex-1">{item.label}</span>
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

function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-ground/90 pt-[env(safe-area-inset-top)] backdrop-blur-md supports-[backdrop-filter]:bg-ground/75">
      <div className="mx-auto flex h-14 w-full max-w-[1240px] items-center gap-1 px-4 sm:px-6 lg:h-16 lg:px-8">
        <Wordmark className="text-ink lg:hidden" />
        <div className="flex-1" />
        <Freshness />
        <RoleSwitcher />
        <ThemeToggle />
      </div>
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
          className="mr-1 flex h-11 items-center gap-2 rounded-[10px] px-2 text-caption text-muted-foreground hover:bg-subtle sm:text-small"
          aria-label={`Data updated ${ago}. Sources: ServiceTitan, Dialpad, AI Voice Agent, GoHighLevel.`}
        >
          <span className={cn("size-2 rounded-full", fresh ? "bg-success" : "bg-warm")} aria-hidden />
          <span className="hidden sm:inline">Updated {ago}</span>
          <span className="num sm:hidden">{ago.replace(" ago", "")}</span>
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

const ROLE_LABELS: Record<Role, string> = { owner: "Owner", manager: "Manager", csr: "CSR" };

function RoleSwitcher() {
  const role = useAppStore((s) => s.role);
  const csrId = useAppStore((s) => s.csrId);
  const setRole = useAppStore((s) => s.setRole);
  const csr = CSRS.find((c) => c.id === csrId);
  const value = role === "csr" ? `csr:${csrId}` : role;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-11 gap-2 px-2 sm:px-3" aria-label={`Viewing as ${ROLE_LABELS[role]}. Change role`}>
          {role === "csr" && csr ? (
            <CsrAvatar csr={csr} size="sm" />
          ) : (
            <span className="flex size-7 items-center justify-center rounded-full bg-subtle">
              <UserRound className="size-4" aria-hidden />
            </span>
          )}
          <span className="hidden text-small sm:inline">{role === "csr" && csr ? csr.firstName : ROLE_LABELS[role]}</span>
          <ChevronDown className="hidden size-3.5 text-muted-foreground sm:block" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>View the app as</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(v) => {
            if (v.startsWith("csr:")) setRole("csr", v.slice(4));
            else setRole(v as Role);
          }}
        >
          <DropdownMenuRadioItem value="owner">Owner</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="manager">Manager</DropdownMenuRadioItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>CSR</DropdownMenuLabel>
          {CSRS.map((c) => (
            <DropdownMenuRadioItem key={c.id} value={`csr:${c.id}`}>
              <CsrAvatar csr={c} size="xs" />
              {c.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
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

/* ---------------- Bottom tabs (mobile) ---------------- */

function BottomTabs({ pathname }: { pathname: string }) {
  const items = useNavItems();
  const role = useAppStore((s) => s.role);
  const [moreOpen, setMoreOpen] = useState(false);
  const tabs = items.filter((i) => i.tab);
  const rest = items.filter((i) => !i.tab);
  const moreActive = rest.some((i) => isActive(pathname, i.href));
  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        <ul className="mx-auto flex max-w-xl">
          {tabs.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium",
                    active ? "text-ink" : "text-muted-foreground",
                  )}
                >
                  <item.icon className={cn("size-[22px]", active && "text-cool")} strokeWidth={active ? 2.2 : 1.8} aria-hidden />
                  {item.label}
                </Link>
              </li>
            );
          })}
          {role !== "csr" ? (
            <li className="flex-1">
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                aria-haspopup="dialog"
                className={cn(
                  "relative flex h-16 w-full flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium",
                  moreActive ? "text-ink" : "text-muted-foreground",
                )}
              >
                <MoreHorizontal className={cn("size-[22px]", moreActive && "text-cool")} aria-hidden />
                More
              </button>
            </li>
          ) : null}
        </ul>
      </nav>
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="px-4 pt-5 pb-4">
          <SheetTitle className="px-2">More</SheetTitle>
          <SheetDescription className="sr-only">Other pages in the app</SheetDescription>
          <ul className="mt-3 grid grid-cols-2 gap-1">
            {rest.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-14 items-center gap-3 rounded-[12px] px-3 text-small",
                      active ? "bg-subtle font-medium" : "hover:bg-subtle",
                    )}
                  >
                    <item.icon className="size-5 text-muted-foreground" aria-hidden />
                    <span className="flex-1">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}
