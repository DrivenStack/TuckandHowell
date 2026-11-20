"use client";

import { toast } from "sonner";
import { create } from "zustand";
import { deriveCallbacks, diffLists, LIST_LABELS } from "@/lib/callbacks/engine";
import { makeBookedJob, type SimEvent } from "@/lib/callbacks/simulator";
import { loadDataset, loadSourceStatuses, type AdapterStatus } from "@/lib/data";
import { Rng } from "@/lib/data/mock/rng";
import { fmtTime } from "@/lib/time";
import type {
  Call,
  Callback,
  CallbackAction,
  CloseReason,
  Dataset,
  Job,
  ManualOutcome,
  OutboundCall,
  TextMessage,
} from "@/lib/types";
import { useAppStore } from "./app";

export interface ActivityItem {
  id: string;
  at: number;
  text: string;
  tone: "calm" | "attention" | "good";
  callbackId: string;
}

interface Live {
  calls: Call[];
  jobs: Job[];
  texts: TextMessage[];
  actions: CallbackAction[];
}

interface DataState {
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  base: Dataset | null;
  /** base + live events, sorted, what every page reads */
  data: Dataset | null;
  live: Live;
  callbacks: Callback[];
  sourceStatuses: AdapterStatus[];
  now: number;
  lastUpdatedAt: number;
  activity: ActivityItem[];
  /** Callback ids that just changed list, for highlight animation */
  recentlyMoved: Record<string, number>;

  load: () => Promise<void>;
  tick: () => void;
  recompute: (opts?: { notify?: boolean }) => void;
  applyEvent: (event: Omit<SimEvent, "kind">, opts?: { notify?: boolean }) => void;

  claim: (callbackId: string, csrId: string) => void;
  release: (callbackId: string, csrId: string) => void;
  recordOutcome: (callbackId: string, outcome: ManualOutcome, csrId: string) => void;

}

const EMPTY_LIVE: Live = { calls: [], jobs: [], texts: [], actions: [] };
let seq = 0;
const uid = (p: string) => `${p}_${Date.now().toString(36)}_${(seq++).toString(36)}`;

function insertSorted<T>(arr: T[], items: T[], at: (x: T) => number): T[] {
  if (!items.length) return arr;
  const out = [...arr];
  for (const item of items) {
    const t = at(item);
    let lo = 0;
    let hi = out.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (at(out[mid]) <= t) lo = mid + 1;
      else hi = mid;
    }
    out.splice(lo, 0, item);
  }
  return out;
}

export const useDataStore = create<DataState>()((set, get) => ({
  status: "idle",
  error: null,
  base: null,
  data: null,
  live: EMPTY_LIVE,
  callbacks: [],
  sourceStatuses: [],
  now: 0,
  lastUpdatedAt: 0,
  activity: [],
  recentlyMoved: {},

  load: async () => {
    if (get().status === "loading" || get().status === "ready") return;
    set({ status: "loading" });
    try {
      const now = Date.now();
      const [base, sourceStatuses] = await Promise.all([loadDataset(now), loadSourceStatuses(now)]);
      base.jobs.sort((a, b) => a.bookedAt - b.bookedAt);
      base.calls.sort((a, b) => a.startedAt - b.startedAt);
      set({
        base,
        data: base,
        sourceStatuses,
        now,
        lastUpdatedAt: now,
        status: "ready",
      });
      get().recompute();
    } catch (err) {
      set({ status: "error", error: err instanceof Error ? err.message : "Could not load data." });
    }
  },

  tick: () => {
    if (get().status !== "ready") return;
    set({ now: Date.now() });
    get().recompute({ notify: true });
  },

  recompute: (opts) => {
    const { data, now, callbacks: prev } = get();
    if (!data) return;
    const settings = useAppStore.getState().settings;
    const csrNames = Object.fromEntries(data.csrs.map((c) => [c.id, c.name]));
    const callbacks = deriveCallbacks({
      customers: data.customers,
      calls: data.calls,
      texts: data.texts,
      jobs: data.jobs,
      actions: get().live.actions,
      settings,
      now,
      csrNames,
    });
    const moves = prev.length ? diffLists(prev, callbacks) : [];
    const recentlyMoved = { ...get().recentlyMoved };
    for (const m of moves) recentlyMoved[m.callbackId] = now;
    for (const [k, t] of Object.entries(recentlyMoved)) if (now - t > 8000) delete recentlyMoved[k];

    const activity: ActivityItem[] = [];
    if (moves.length) {
      const byId = new Map(callbacks.map((c) => [c.id, c]));
      const customers = new Map(data.customers.map((c) => [c.id, c]));
      for (const m of moves) {
        const cb = byId.get(m.callbackId);
        if (!cb || cb.firstMissedAt < data.goLiveAt) continue;
        const who = customers.get(cb.customerId)?.name ?? "Customer";
        const by = cb.resolvedByCsrId ? csrNames[cb.resolvedByCsrId] : null;
        let text: string;
        let tone: ActivityItem["tone"] = "calm";
        switch (m.to) {
          case "needs_callback":
            text = m.from ? `Back to Needs callback: ${who}` : `New callback needed: ${who}, ${cb.jobType}`;
            tone = "attention";
            break;
          case "attempted":
            text = `Attempt ${cb.attempts}: ${who}, no answer`;
            break;
          case "called_back":
            text = `Called back: ${who}${by ? `, by ${by}` : ""} at ${fmtTime(cb.resolvedAt ?? now)}`;
            break;
          case "booked":
            text = `Booked: ${who}${by ? `, by ${by}` : ""} at ${fmtTime(cb.resolvedAt ?? now)}`;
            tone = "good";
            break;
          case "closed":
            text = `Closed: ${who}, ${cb.closeReason ?? LIST_LABELS.closed}`;
            break;
        }
        activity.push({ id: uid("act"), at: now, text, tone, callbackId: cb.id });
      }
    }
    set({ callbacks, recentlyMoved, activity: activity.length ? [...activity, ...get().activity].slice(0, 40) : get().activity });
    if (opts?.notify) {
      for (const a of activity.slice(0, 2)) {
        if (a.tone === "good") toast.success(a.text);
        else toast(a.text);
      }
    }
  },

  applyEvent: (event, opts) => {
    const { base, live } = get();
    if (!base) return;
    const nextLive: Live = {
      calls: [...live.calls, ...event.calls],
      jobs: [...live.jobs, ...event.jobs],
      texts: [...live.texts, ...event.texts],
      actions: [...live.actions, ...event.actions],
    };
    const prevData = get().data ?? base;
    const data: Dataset = {
      ...prevData,
      calls: insertSorted(prevData.calls, event.calls, (c) => c.startedAt),
      jobs: insertSorted(prevData.jobs, event.jobs, (j) => j.bookedAt),
      texts: [...prevData.texts, ...event.texts],
    };
    const now = Math.max(Date.now(), ...event.calls.map((c) => c.startedAt), ...event.actions.map((a) => a.at));
    set({ live: nextLive, data, now, lastUpdatedAt: now });
    get().recompute({ notify: opts?.notify ?? true });
  },

  claim: (callbackId, csrId) => {
    get().applyEvent(
      { calls: [], jobs: [], texts: [], actions: [{ id: uid("act"), kind: "claim", callbackId, csrId, at: Date.now() }] },
      { notify: false },
    );
  },

  release: (callbackId, csrId) => {
    get().applyEvent(
      { calls: [], jobs: [], texts: [], actions: [{ id: uid("act"), kind: "release", callbackId, csrId, at: Date.now() }] },
      { notify: false },
    );
  },

  recordOutcome: (callbackId, outcome, csrId) => {
    const { callbacks, data } = get();
    const cb = callbacks.find((c) => c.id === callbackId);
    const customer = data?.customers.find((c) => c.id === cb?.customerId);
    if (!cb || !customer) return;
    const now = Date.now();
    const settings = useAppStore.getState().settings;
    const call = (o: OutboundCall["outcome"], durationSec: number): OutboundCall => ({
      id: uid("out"),
      direction: "outbound",
      customerId: customer.id,
      phone: customer.phones[0],
      startedAt: now,
      durationSec,
      jobType: cb.jobType,
      outcome: o,
      csrId,
      source: "ServiceTitan",
    });
    const closeReasons: Partial<Record<ManualOutcome, CloseReason>> = {
      not_interested: "Not interested",
      wrong_number: "Wrong number",
      spam: "Spam",
      duplicate: "Duplicate",
    };
    const event: Omit<SimEvent, "kind"> = { calls: [], jobs: [], texts: [], actions: [] };
    const realLength = Math.max(settings.minCallSeconds + 60, 150);
    switch (outcome) {
      case "spoke":
        event.calls.push(call("answered", realLength));
        break;
      case "no_answer":
        event.calls.push(call("no_answer", 0));
        break;
      case "voicemail":
        event.calls.push(call("voicemail", 35));
        break;
      case "booked":
        if (cb.list !== "called_back") event.calls.push(call("answered", realLength));
        event.jobs.push(makeBookedJob(new Rng(now), cb, csrId, now + 1));
        break;
      default: {
        const reason = closeReasons[outcome];
        if (!reason) break;
        event.actions.push({ id: uid("act"), kind: "close", callbackId, csrId, at: now, reason });
      }
    }
    get().applyEvent(event, { notify: false });
  },
}));
