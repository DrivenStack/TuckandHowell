/**
 * Live cache of ServiceTitan calls. Server only.
 *
 * First request for a window loads every call created in it. After that, each sync asks
 * ServiceTitan only for calls modified since the last sync (with a minute of overlap), so
 * new calls and call backs show up within seconds without re-downloading everything.
 */
import type { LiveCall } from "@/lib/callbacks/live";
import { stGetAll } from "./client";

const CALLS = "telecom/v3/tenant/{tenant}/calls";
/** Do not ask ServiceTitan for changes more often than this */
const MIN_SYNC_GAP_MS = 8_000;
const OVERLAP_MS = 60_000;

interface RawCall {
  id: number;
  leadCall: {
    id: number;
    receivedOn: string;
    modifiedOn: string;
    duration: string | null;
    from: string | null;
    to: string | null;
    direction: "Inbound" | "Outbound";
    callType: string | null;
    voiceMailUrl: string | null;
    active: boolean;
    customer: { id: number; name: string | null } | null;
    agent: { id: number; name: string | null } | null;
  };
}

interface Cache {
  calls: Map<number, LiveCall>;
  /** Calls created at or after this time are fully loaded */
  loadedFrom: number | null;
  lastSyncAt: number;
  pending: Promise<void> | null;
}

const g = globalThis as typeof globalThis & { __stCalls?: Cache };
const cache: Cache = (g.__stCalls ??= { calls: new Map(), loadedFrom: null, lastSyncAt: 0, pending: null });

function seconds(d: string | null): number {
  if (!d) return 0;
  const [h, m, s] = d.split(":").map(Number);
  return Math.round((h || 0) * 3600 + (m || 0) * 60 + (s || 0));
}

function toLive(r: RawCall): LiveCall {
  const c = r.leadCall;
  return {
    id: c.id,
    at: Date.parse(c.receivedOn),
    direction: c.direction === "Outbound" ? "outbound" : "inbound",
    callType: c.callType || null,
    durationSec: seconds(c.duration),
    from: c.from ?? "",
    to: c.to ?? "",
    agentName: c.agent?.id ? (c.agent.name ?? "CSR") : null,
    customerName: c.customer?.name ?? null,
    voicemail: !!c.voiceMailUrl,
    active: c.active !== false,
  };
}

function merge(rows: RawCall[]) {
  // Note: ServiceTitan's "active" flag is false on most finished calls, so it is not used to drop calls
  for (const r of rows) {
    const call = toLive(r);
    cache.calls.set(call.id, call);
  }
}

async function run(task: () => Promise<void>) {
  // One ServiceTitan sync at a time; other requests wait for it
  while (cache.pending) await cache.pending;
  cache.pending = task().finally(() => {
    cache.pending = null;
  });
  await cache.pending;
}

/** Make sure every call created since `from` is loaded, then pull recent changes. */
export async function syncCalls(from: number): Promise<{ calls: LiveCall[]; syncedAt: number }> {
  if (cache.loadedFrom === null || from < cache.loadedFrom) {
    await run(async () => {
      if (cache.loadedFrom !== null && from >= cache.loadedFrom) return;
      const started = Date.now();
      const before = cache.loadedFrom ?? started + 86_400_000;
      const rows = await stGetAll<RawCall>(CALLS, {
        createdOnOrAfter: new Date(from).toISOString(),
        createdBefore: new Date(before).toISOString(),
      });
      merge(rows);
      if (cache.loadedFrom === null) cache.lastSyncAt = started;
      cache.loadedFrom = from;
    });
  }
  if (Date.now() - cache.lastSyncAt >= MIN_SYNC_GAP_MS) {
    await run(async () => {
      if (Date.now() - cache.lastSyncAt < MIN_SYNC_GAP_MS) return;
      const started = Date.now();
      const rows = await stGetAll<RawCall>(CALLS, { modifiedOnOrAfter: new Date(cache.lastSyncAt - OVERLAP_MS).toISOString() });
      merge(rows.filter((r) => cache.loadedFrom !== null && Date.parse(r.leadCall.receivedOn) >= cache.loadedFrom - 86_400_000));
      cache.lastSyncAt = started;
    });
  }
  return { calls: [...cache.calls.values()], syncedAt: cache.lastSyncAt };
}
