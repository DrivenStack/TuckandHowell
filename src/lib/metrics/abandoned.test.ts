import { describe, expect, it } from "vitest";
import { generateDataset } from "@/lib/data/mock/generate";
import { nyAddDays, nyStartOfDay } from "@/lib/time";
import {
  abandonedCalls,
  AI_LENGTH_BUCKETS,
  aiBookedCount,
  buildContactIndex,
  followUpCalls,
  lengthTable,
  speedTable,
  summarize,
  timeBins,
} from "./abandoned";

const NOW = Date.UTC(2026, 10, 20, 16, 30); // 11:30 am New York

describe("abandoned call metrics", () => {
  const data = generateDataset(NOW);
  const index = buildContactIndex(data);
  const from = nyAddDays(nyStartOfDay(NOW), -6);
  const items = abandonedCalls(data, index, from, NOW);
  const bins = timeBins(from, NOW);

  it("counts add up", () => {
    const s = summarize(items);
    expect(s.total).toBeGreaterThan(20);
    expect(s.calledBack + s.stillOpen).toBe(s.total);
    expect(s.calledBackRate).toBeGreaterThan(0.7);
  });

  it("speed rows cover every returned call and shares sum to 100%", () => {
    const { rows, total } = speedTable(items, bins);
    expect(rows.reduce((a, r) => a + r.count, 0)).toBe(total.count);
    expect(rows.reduce((a, r) => a + r.shareOfReturned, 0)).toBeCloseTo(1, 5);
    for (const r of rows) {
      expect(r.series.reduce((a, b) => a + b, 0)).toBe(r.count);
      expect(r.booked).toBeLessThanOrEqual(r.count);
    }
    console.log(rows.map((r) => `${r.bucket.label}: ${r.count} (${Math.round(r.bookRate * 100)}% booked)`).join("\n"));
  });

  it("length rows cover every abandoned call, most within 10 seconds", () => {
    const rows = lengthTable(items, bins);
    expect(rows.reduce((a, r) => a + r.count, 0)).toBe(items.length);
    expect(rows[0].shareOfAbandoned).toBeGreaterThan(0.4);
    console.log(rows.map((r) => `${r.bucket.label}: ${r.count}`).join("\n"));
  });

  it("uses hourly bins for a single day and daily bins for a week", () => {
    expect(timeBins(nyStartOfDay(NOW), NOW).unit).toBe("hour");
    expect(bins.unit).toBe("day");
    expect(bins.starts.length).toBe(7);
  });

  it("Broccoli calls are AI Voice Agent calls with no booking", () => {
    const ai = followUpCalls(data, index, from, NOW, "ai_agent");
    expect(ai.length).toBeGreaterThan(20);
    for (const i of ai) {
      expect(i.call.outcome).toBe("ai_agent");
      expect(i.call.booked).toBe(false);
    }
    expect(aiBookedCount(data, from, NOW)).toBeGreaterThan(0);
    const s = summarize(ai);
    expect(s.calledBack + s.stillOpen).toBe(s.total);
    const { rows, total } = speedTable(ai, bins);
    expect(rows.reduce((a, r) => a + r.count, 0)).toBe(total.count);
    const lengths = lengthTable(ai, bins, AI_LENGTH_BUCKETS);
    expect(lengths.reduce((a, r) => a + r.count, 0)).toBe(ai.length);
    console.log("broccoli", s, lengths.map((r) => `${r.bucket.label}: ${r.count}`).join(", "));
  });
});
