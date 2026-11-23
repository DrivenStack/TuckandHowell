"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { RangePreset } from "@/lib/metrics/calculations";
import { DEFAULT_CALLBACK_SETTINGS, type CallbackSettings } from "@/lib/types";

export type ThemeChoice = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "th-theme";

interface AppState {
  theme: ThemeChoice;
  settings: CallbackSettings;
  simulationOn: boolean;
  rangePreset: RangePreset;
  customRange: { from: number; to: number } | null;
  /** Manual "Done?" ticks on the Callbacks tab, keyed by call id. Overrides what the data says. */
  doneOverrides: Record<string, boolean>;

  setTheme: (theme: ThemeChoice) => void;
  updateSettings: (patch: Partial<CallbackSettings>) => void;
  resetSettings: () => void;
  setSimulation: (on: boolean) => void;
  setRange: (preset: RangePreset, custom?: { from: number; to: number }) => void;
  setDone: (callId: string, done: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: "system",
      settings: DEFAULT_CALLBACK_SETTINGS,
      simulationOn: true,
      rangePreset: "today",
      customRange: null,
      doneOverrides: {},

      setTheme: (theme) => set({ theme }),
      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      resetSettings: () => set({ settings: DEFAULT_CALLBACK_SETTINGS }),
      setSimulation: (simulationOn) => set({ simulationOn }),
      setRange: (rangePreset, custom) => set({ rangePreset, customRange: custom ?? null }),
      setDone: (callId, done) => set((s) => ({ doneOverrides: { ...s.doneOverrides, [callId]: done } })),
    }),
    {
      name: "th-call-center",
      version: 3,
      // Older saved versions had roles and alert rules; extra fields are ignored
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
        theme: s.theme,
        settings: s.settings,
        simulationOn: s.simulationOn,
        doneOverrides: s.doneOverrides,
      }),
    },
  ),
);
