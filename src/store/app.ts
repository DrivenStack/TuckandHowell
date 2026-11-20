"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { RangePreset } from "@/lib/metrics/calculations";
import { DEFAULT_CALLBACK_SETTINGS, type CallbackSettings } from "@/lib/types";

export type Role = "owner" | "manager" | "csr";
export type ThemeChoice = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "th-theme";

interface AppState {
  role: Role;
  /** Which CSR the demo is acting as when role is "csr" (and who acts for owner/manager actions) */
  csrId: string;
  theme: ThemeChoice;
  settings: CallbackSettings;
  simulationOn: boolean;
  rangePreset: RangePreset;
  customRange: { from: number; to: number } | null;

  setRole: (role: Role, csrId?: string) => void;
  setTheme: (theme: ThemeChoice) => void;
  updateSettings: (patch: Partial<CallbackSettings>) => void;
  resetSettings: () => void;
  setSimulation: (on: boolean) => void;
  setRange: (preset: RangePreset, custom?: { from: number; to: number }) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      role: "owner",
      csrId: "csr_marcus",
      theme: "system",
      settings: DEFAULT_CALLBACK_SETTINGS,
      simulationOn: true,
      rangePreset: "today",
      customRange: null,

      setRole: (role, csrId) => set((s) => ({ role, csrId: csrId ?? s.csrId })),
      setTheme: (theme) => set({ theme }),
      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      resetSettings: () => set({ settings: DEFAULT_CALLBACK_SETTINGS }),
      setSimulation: (simulationOn) => set({ simulationOn }),
      setRange: (rangePreset, custom) => set({ rangePreset, customRange: custom ?? null }),
    }),
    {
      name: "th-call-center",
      version: 2,
      // Drop fields from older saved versions (alert rules were removed)
      migrate: (persisted) => persisted as AppState,
      storage: createJSONStorage(() => {
        try {
          if (typeof window === "undefined") throw new Error("server");
          return window.localStorage;
        } catch {
          // No storage available: settings last for this visit only
          const mem = new Map<string, string>();
          return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) };
        }
      }),
      // Rehydrated after mount (see AppProviders) so server and first client render match.
      skipHydration: true,
      partialize: (s) => ({
        role: s.role,
        csrId: s.csrId,
        theme: s.theme,
        settings: s.settings,
        simulationOn: s.simulationOn,
      }),
    },
  ),
);

/** Pages a CSR may open */
export function canView(role: Role, path: string): boolean {
  if (role !== "csr") return true;
  return path.startsWith("/callbacks") || path.startsWith("/team/");
}
