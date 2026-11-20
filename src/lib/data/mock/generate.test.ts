import { describe, expect, it } from "vitest";
import { deriveCallbacks, neverReturned } from "@/lib/callbacks/engine";
import { DEFAULT_CALLBACK_SETTINGS } from "@/lib/types";
import { nyStartOfDay } from "@/lib/time";
import { generateDataset } from "./generate";

const NOW = Date.UTC(2026, 10, 20, 16, 30); // Fri Nov 20, 11:30 am New York

describe("mock data", () => {
  const data = generateDataset(NOW);

  it("is identical on every run", () => {
    const again = generateDataset(NOW);
    expect(again.calls.length).toBe(data.calls.length);
    expect(again.calls[500]).toEqual(data.calls[500]);
    expect(again.customers[10]).toEqual(data.customers[10]);
  });

  it("has believable volume and outcome mix", () => {
    const inbound = data.calls.filter((c) => c.direction === "inbound");
    const n = inbound.length;
    const share = (o: string) => inbound.filter((c) => c.outcome === o).length / n;
    const csr = share("csr_answered");
    const ai = share("ai_agent");
    const missed = share("missed") + share("abandoned");
    const answered = inbound.filter((c) => c.outcome === "csr_answered");
    const bookRate = answered.filter((c) => c.booked).length / answered.length;
    const legacy = inbound.filter((c) => c.campaignId === "legacy_main").length / n;
    console.log({ n, csr, ai, missed, bookRate, legacy, jobs: data.jobs.length });
    expect(csr).toBeGreaterThan(0.64);
    expect(csr).toBeLessThan(0.8);
    expect(ai).toBeGreaterThan(0.12);
    expect(ai).toBeLessThan(0.26);
    expect(missed).toBeGreaterThan(0.06);
    expect(missed).toBeLessThan(0.14);
    expect(bookRate).toBeGreaterThan(0.53);
    expect(bookRate).toBeLessThan(0.67);
    expect(legacy).toBeGreaterThan(0.25);
  });

  it("phone numbers use the 555-0xxx format and are unique", () => {
    const all = data.customers.flatMap((c) => c.phones);
    expect(new Set(all).size).toBe(all.length);
    for (const p of all) expect(p).toMatch(/^\((864|828)\) 555-0\d{3}$/);
  });

  it("callbacks: AI never-returned is high before go-live and low after", () => {
    const cbs = deriveCallbacks({
      customers: data.customers,
      calls: data.calls,
      texts: data.texts,
      jobs: data.jobs,
      actions: [],
      settings: DEFAULT_CALLBACK_SETTINGS,
      now: NOW,
    });
    const todayStart = nyStartOfDay(NOW);
    const ai = cbs.filter((c) => c.trigger === "ai_agent");
    const before = ai.filter((c) => c.firstMissedAt < data.goLiveAt);
    const after = ai.filter((c) => c.firstMissedAt >= data.goLiveAt && c.firstMissedAt < todayStart);
    const rate = (xs: typeof ai) => xs.filter(neverReturned).length / xs.length;
    const live = cbs.filter((c) => c.firstMissedAt >= data.goLiveAt);
    const counts = live.reduce<Record<string, number>>((m, c) => ((m[c.list] = (m[c.list] ?? 0) + 1), m), {});
    const waitingOld = live.filter((c) => c.list === "needs_callback" && c.firstMissedAt < todayStart).length;
    console.log({ before: rate(before), after: rate(after), counts, waitingOld, total: cbs.length });
    expect(rate(before)).toBeGreaterThan(0.6);
    expect(rate(after)).toBeLessThan(0.15);
    expect(waitingOld).toBe(0);
  });
});
