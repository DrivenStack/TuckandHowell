"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { MotionConfig } from "framer-motion";
import { nextDelay, simulateTick } from "@/lib/callbacks/simulator";
import { Rng } from "@/lib/data/mock/rng";
import { USE_MOCK_DATA } from "@/lib/data";
import { THEME_STORAGE_KEY, useAppStore } from "@/store/app";
import { useDataStore } from "@/store/data";
import { TooltipProvider } from "@/components/ui/primitives";
import { Toaster } from "@/components/ui/sonner";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider>
        <StoreBootstrap />
        <ThemeSync />
        <Ticker />
        {USE_MOCK_DATA ? <SimulationRunner /> : null}
        {children}
        <Toaster />
      </TooltipProvider>
    </MotionConfig>
  );
}

/** Rehydrate persisted settings after mount, then load data. */
function StoreBootstrap() {
  useEffect(() => {
    // Storage can be unavailable (private mode, embedded frames). Load data either way.
    const load = () => void useDataStore.getState().load();
    try {
      void Promise.resolve(useAppStore.persist.rehydrate()).then(load, load);
    } catch {
      load();
    }
    // Re-derive callbacks when the rules change
    return useAppStore.subscribe((s, prev) => {
      if (s.settings !== prev.settings) useDataStore.getState().recompute();
    });
  }, []);
  return null;
}

function ThemeSync() {
  const theme = useAppStore((s) => s.theme);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* storage unavailable */
    }
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  return null;
}

/** Keeps "now" fresh so waits, retry timers and claim expiry update. */
function Ticker() {
  useEffect(() => {
    const id = window.setInterval(() => useDataStore.getState().tick(), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return null;
}

/** Demo only: one realistic event every 20 to 40 seconds while switched on. */
function SimulationRunner() {
  const on = useAppStore((s) => s.simulationOn);
  const ready = useDataStore((s) => s.status === "ready");
  const rngRef = useRef<Rng | null>(null);

  useEffect(() => {
    if (!on || !ready) return;
    if (!rngRef.current) rngRef.current = new Rng(Date.now());
    const rng = rngRef.current;
    let timer: number;
    const schedule = () => {
      timer = window.setTimeout(() => {
        const s = useDataStore.getState();
        if (s.data) {
          const now = Date.now();
          const event = simulateTick(
            { customers: s.data.customers, csrs: s.data.csrs, callbacks: s.callbacks, goLiveAt: s.data.goLiveAt, now },
            rng,
          );
          s.applyEvent(event, { notify: false });
        }
        schedule();
      }, nextDelay(rng));
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [on, ready]);
  return null;
}
