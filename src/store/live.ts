"use client";

import { create } from "zustand";

/** Shared status of the live ServiceTitan connection, for the header. */
interface LiveState {
  syncedAt: number;
  status: "connecting" | "live" | "error";
  error: string | null;
  report: (s: { syncedAt?: number; status: LiveState["status"]; error?: string | null }) => void;
}

export const useLiveStore = create<LiveState>()((set) => ({
  syncedAt: 0,
  status: "connecting",
  error: null,
  report: ({ syncedAt, status, error }) => set((cur) => ({ syncedAt: syncedAt ?? cur.syncedAt, status, error: error ?? null })),
}));
