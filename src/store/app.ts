"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ThemeChoice = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "th-theme";

interface AppState {
  theme: ThemeChoice;
  /** Manual "Done?" ticks on the Callbacks tab, keyed by ServiceTitan call id. Overrides what the data says. */
  doneOverrides: Record<string, boolean>;
  setTheme: (theme: ThemeChoice) => void;
  setDone: (callId: string, done: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: "system",
      doneOverrides: {},
      setTheme: (theme) => set({ theme }),
      setDone: (callId, done) => set((s) => ({ doneOverrides: { ...s.doneOverrides, [callId]: done } })),
    }),
    {
      name: "th-call-center",
      version: 4,
      // Older saved versions had dummy-data settings; only theme and real call ticks are kept
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        return { theme: p.theme ?? "system", doneOverrides: {} } as AppState;
      },
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
      partialize: (s) => ({ theme: s.theme, doneOverrides: s.doneOverrides }),
    },
  ),
);
