import { describe, expect, it } from "vitest";
import { generateDataset } from "@/lib/data/mock/generate";
import { nyAddDays, nyStartOfDay } from "@/lib/time";
import { buildLogIndex, callbackLog, MAX_ATTEMPTS } from "./callback-log";

const NOW = Date.UTC(2026, 10, 20, 16, 30);

describe("callback log", () => {
  const data = generateDataset(NOW);
  const rows = callbackLog(data, buildLogIndex(data), nyAddDays(nyStartOfDay(NOW), -6), NOW);

  it("lists every type, newest first", () => {
    const types = new Set(rows.map((r) => r.type));
    expect([...types].sort()).toEqual(["Abandoned", "Broccoli", "Missed"]);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].at).toBeGreaterThanOrEqual(rows[i].at);
  });

  it("actions follow the attempts and reach", () => {
    for (const r of rows) {
      if (r.reachedCsr || r.booked) expect(r.action).toBe("None");
      else if (r.attempts === 0) expect(r.action).toBe("Call back");
      else if (r.attempts >= MAX_ATTEMPTS) expect(r.action).toBe("No more attempts");
      else expect(r.action).toBe("Try again");
      expect(r.reviewedBy).toBe(r.reviewerIds.length);
    }
    const counts = rows.reduce<Record<string, number>>((m, r) => ((m[r.action] = (m[r.action] ?? 0) + 1), m), {});
    console.log(rows.length, counts);
    expect(rows.some((r) => r.reachedCsr)).toBe(true);
  });
});
