"use client";

import { useEffect, type ReactNode } from "react";
import { MotionConfig } from "framer-motion";
import { THEME_STORAGE_KEY, useAppStore } from "@/store/app";
import { TooltipProvider } from "@/components/ui/primitives";
import { Toaster } from "@/components/ui/sonner";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider>
        <StoreBootstrap />
        <ThemeSync />
        {children}
        <Toaster />
      </TooltipProvider>
    </MotionConfig>
  );
}

/** Rehydrate saved settings (theme, Done ticks) after mount so server and first client render match. */
function StoreBootstrap() {
  useEffect(() => {
    try {
      void useAppStore.persist.rehydrate();
    } catch {
      /* storage unavailable: defaults for this visit */
    }
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
