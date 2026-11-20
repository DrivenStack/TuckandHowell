import { describe, expect, it } from "vitest";
import { METRIC_IDS, METRICS } from "./definitions";

describe("metric definitions", () => {
  it("every metric has a name, explanation, formula and source", () => {
    for (const id of METRIC_IDS) {
      const m = METRICS[id];
      expect(m, id).toBeDefined();
      expect(m.name.length, id).toBeGreaterThan(2);
      expect(m.explanation.endsWith("."), id).toBe(true);
      expect(m.formula.length, id).toBeGreaterThan(5);
      expect(m.source.length, id).toBeGreaterThan(3);
    }
  });

  it("names are unique and in sentence case", () => {
    const names = METRIC_IDS.map((id) => METRICS[id].name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).not.toBe(n.toUpperCase());
  });
});
