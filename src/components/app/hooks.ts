"use client";

import { useMemo, useSyncExternalStore } from "react";
import { rangeFromPreset, type Range, type RangePreset } from "@/lib/metrics/calculations";
import type { Csr, Customer } from "@/lib/types";
import { useAppStore } from "@/store/app";
import { useDataStore } from "@/store/data";

/** Everything a page needs once data has loaded, or null while loading. */
export function useReady() {
  const status = useDataStore((s) => s.status);
  const data = useDataStore((s) => s.data);
  const callbacks = useDataStore((s) => s.callbacks);
  const now = useDataStore((s) => s.now);
  if (status !== "ready" || !data) return null;
  return { data, callbacks, now };
}

export function useCustomers(): Map<string, Customer> {
  const customers = useDataStore((s) => s.data?.customers);
  return useMemo(() => new Map((customers ?? []).map((c) => [c.id, c])), [customers]);
}

export function useCsrs(): Map<string, Csr> {
  const csrs = useDataStore((s) => s.data?.csrs);
  return useMemo(() => new Map((csrs ?? []).map((c) => [c.id, c])), [csrs]);
}

/** Global date range, defaulting per page when the page prefers another default. */
export function useRange(): Range {
  const preset = useAppStore((s) => s.rangePreset);
  const custom = useAppStore((s) => s.customRange);
  const now = useDataStore((s) => s.now);
  return useMemo(() => rangeFromPreset(preset, now || 0, custom ?? undefined), [preset, custom, now]);
}

export function useLocalRange(preset: RangePreset, custom: { from: number; to: number } | null): Range {
  const now = useDataStore((s) => s.now);
  return useMemo(() => rangeFromPreset(preset, now || 0, custom ?? undefined), [preset, custom, now]);
}

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
