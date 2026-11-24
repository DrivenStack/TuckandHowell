"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { CallbackRow } from "@/lib/callbacks/live";
import { rangeFromPreset, type Range, type RangePreset } from "@/lib/range";
import { useLiveStore } from "@/store/live";

/* ---------------- Clock ---------------- */

const TICK_MS = 30_000;
let clockNow = 0;
const clockListeners = new Set<() => void>();
let clockTimer: number | undefined;

function subscribeClock(cb: () => void) {
  clockListeners.add(cb);
  if (clockTimer === undefined) {
    clockNow = Date.now();
    clockTimer = window.setInterval(() => {
      clockNow = Date.now();
      clockListeners.forEach((l) => l());
    }, TICK_MS);
  }
  return () => {
    clockListeners.delete(cb);
    if (!clockListeners.size && clockTimer !== undefined) {
      window.clearInterval(clockTimer);
      clockTimer = undefined;
    }
  };
}

/** Current time, updated every 30 seconds. 0 during server render. */
export function useNow(): number {
  return useSyncExternalStore(
    subscribeClock,
    () => clockNow || (clockNow = Date.now()),
    () => 0,
  );
}

export function useLocalRange(preset: RangePreset, custom: { from: number; to: number } | null): Range {
  const now = useNow();
  return useMemo(() => rangeFromPreset(preset, now || 0, custom ?? undefined), [preset, custom, now]);
}

/* ---------------- Live call backs from ServiceTitan ---------------- */

/** How often the page asks for new calls and call backs */
export const POLL_MS = 15_000;

export interface LiveCallbacks {
  status: "loading" | "ready" | "error";
  rows: CallbackRow[];
  syncedAt: number;
  error: string | null;
  /** Rows that turned done since the previous check (someone called back) */
  justDone: string[];
  /** Calls that appeared since the previous check */
  justAdded: string[];
}

/**
 * Call backs for a date range, kept up to date by asking the server every 15 seconds
 * (and right away when the tab becomes visible again). A range that ends now stays open-ended,
 * so new calls appear as they come in.
 */
export function useLiveCallbacks(range: Range | null): LiveCallbacks {
  const [state, setState] = useState<LiveCallbacks & { key: string }>({ status: "loading", rows: [], syncedAt: 0, error: null, justDone: [], justAdded: [], key: "" });
  const report = useLiveStore((s) => s.report);
  const now = useNow();
  // A range that reaches the current time (today, last 7 days...) stays open-ended
  const openEnded = range ? (now || range.to) - range.to < 5 * 60_000 : true;
  const key = range ? `${range.from}:${openEnded ? "now" : range.to}` : "";

  useEffect(() => {
    if (!key) return;
    const [from, to] = key.split(":");
    let alive = true;
    let timer: number | undefined;
    const load = async () => {
      window.clearTimeout(timer);
      try {
        const url = `/api/callbacks?from=${from}${to === "now" ? "" : `&to=${to}`}`;
        const res = await fetch(url, { cache: "no-store" });
        const body = (await res.json()) as { rows?: CallbackRow[]; syncedAt?: number; error?: string };
        if (!alive) return;
        if (!res.ok || !body.rows) throw new Error(body.error ?? `HTTP ${res.status}`);
        const fresh = body.rows;
        setState((cur) => {
          // Compare with the previous check of the same range
          const before = cur.key === key ? new Map(cur.rows.map((r) => [r.id, r])) : null;
          const justDone = before ? fresh.filter((r) => r.doneByData && before.get(r.id)?.doneByData === false).map((r) => r.id) : [];
          const justAdded = before ? fresh.filter((r) => !before.has(r.id)).map((r) => r.id) : [];
          return { status: "ready", rows: fresh, syncedAt: body.syncedAt ?? Date.now(), error: null, justDone, justAdded, key };
        });
        report({ syncedAt: body.syncedAt, status: "live" });
      } catch (err) {
        if (!alive) return;
        const message = err instanceof Error ? err.message : "Could not reach ServiceTitan.";
        setState((cur) => ({ ...cur, status: cur.key === key && cur.rows.length ? "ready" : "error", error: message, key }));
        report({ status: "error", error: message });
      } finally {
        if (alive && document.visibilityState === "visible") timer = window.setTimeout(load, POLL_MS);
      }
    };
    void load();
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
      else window.clearTimeout(timer);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [key, report]);

  // Rows from a previous range are not shown while the new range loads
  if (state.key !== key) return { status: "loading", rows: [], syncedAt: state.syncedAt, error: null, justDone: [], justAdded: [] };
  return { status: state.status, rows: state.rows, syncedAt: state.syncedAt, error: state.error, justDone: state.justDone, justAdded: state.justAdded };
}

/* ---------------- Layout ---------------- */

const mdQuery = "(min-width: 768px)";
const subscribeMd = (cb: () => void) => {
  const m = window.matchMedia(mdQuery);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

/**
 * True on tablet and desktop widths (768px and up). Used to render only the visible
 * layout, so charts never mount inside a hidden container.
 */
export function useIsWide(): boolean {
  return useSyncExternalStore(subscribeMd, () => window.matchMedia(mdQuery).matches, () => true);
}
