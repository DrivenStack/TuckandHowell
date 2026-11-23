import { describe, expect, it } from "vitest";
import { generateDataset } from "@/lib/data/mock/generate";
import { nyAddDays, nyParts, nyStartOfDay } from "@/lib/time";
import { buildLogIndex, callbackLog, PLATFORM_OF, PLATFORMS } from "./callback-log";

const NOW = Date.UTC(2026, 10, 20, 16, 30);

describe("callback log", () => {
  const data = generateDataset(NOW);
  const rows = callbackLog(data, buildLogIndex(data), nyAddDays(nyStartOfDay(NOW), -6), NOW);

  it("lists every type, newest first", () => {
    const types = new Set(rows.map((r) => r.type));
    expect([...types].sort()).toEqual(["Abandoned", "Broccoli", "Lace flag", "Missed", "Web form"]);
    const platforms = new Set(rows.map((r) => r.platform));
    expect([...platforms].sort()).toEqual([...PLATFORMS].sort());
    for (const r of rows) expect(r.platform).toBe(PLATFORM_OF[r.type]);
    const by = rows.reduce<Record<string, number>>((m, r) => ((m[r.platform] = (m[r.platform] ?? 0) + 1), m), {});
    console.log(by);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].at).toBeGreaterThanOrEqual(rows[i].at);
  });

  it("a call back makes the row done; open rows need a call back", () => {
    for (const r of rows) {
      const calledBack = r.calledBackAt !== null;
      expect(r.doneByData).toBe(calledBack || r.reachedCsr || r.booked);
      expect(r.action).toBe(r.doneByData ? "None" : "Call back");
      if (r.attempts > 0) expect(calledBack).toBe(true);
    }
    expect(rows.some((r) => !r.doneByData)).toBe(true);
  });

  it("every call during open hours is assigned to the CSR it rang", () => {
    const daytime = rows.filter((r) => {
      if (r.type === "Web form") return false;
      const p = nyParts(r.at);
      return p.weekday >= 1 && p.weekday <= 5 && p.hour >= 8 && p.hour < 18;
    });
    expect(daytime.length).toBeGreaterThan(50);
    for (const r of daytime) expect(r.assignedCsrId, r.callId).not.toBeNull();
  });
});
