import { describe, expect, it } from "vitest";
import { nyTime } from "@/lib/time";
import { buildCallbackRows, formatPhone, summarize, type LiveCall } from "./live";

const T0 = nyTime(2026, 11, 23, 10, 0); // 10:00 am New York, open hours
const MIN = 60_000;
let seq = 1;

const call = (over: Partial<LiveCall>): LiveCall => ({
  id: seq++,
  at: T0,
  direction: "inbound",
  callType: null,
  durationSec: 30,
  from: "8645550101",
  to: "8645559999",
  agentName: null,
  customerName: "Dana Whitfield",
  voicemail: false,
  active: true,
  ...over,
});

const rows = (calls: LiveCall[]) => buildCallbackRows(calls, T0 - 60 * MIN, T0 + 5 * 24 * 60 * MIN);

describe("call backs from ServiceTitan calls", () => {
  it("abandoned call type becomes Abandoned; unanswered inbound becomes Missed", () => {
    const r = rows([call({ callType: "Abandoned" }), call({ from: "8645550202" }), call({ from: "8645550303", agentName: "Marcus Lee", callType: "Booked" })]);
    expect(r.map((x) => x.type).sort()).toEqual(["Abandoned", "Missed"]);
    expect(r.every((x) => x.action === "Call back" && !x.doneByData)).toBe(true);
  });

  it("leaves out calls typed Abandoned that have an agent on them", () => {
    expect(rows([call({ callType: "Abandoned", agentName: "Small, Lexa", durationSec: 23 })])).toHaveLength(0);
  });

  it("leaves out calls ServiceTitan types Not a lead", () => {
    expect(rows([call({ callType: "NotLead", voicemail: true }), call({ from: "Restricted", callType: "NotLead" })])).toHaveLength(0);
  });

  it("ignores outbound calls as call backs owed", () => {
    expect(rows([call({ direction: "outbound", to: "8645550101", agentName: "Tasha Greene" })])).toHaveLength(0);
  });

  it("an outbound call to the caller's number marks it done, by any phone format", () => {
    const [r] = rows([
      call({ callType: "Abandoned", from: "+18645550101" }),
      call({ direction: "outbound", at: T0 + 7 * MIN, to: "(864) 555-0101", durationSec: 5, agentName: "Tasha Greene" }),
    ]);
    expect(r.doneByData).toBe(true);
    expect(r.attempts).toBe(1);
    expect(r.reachedCsr).toBe(false);
    expect(r.calledBackBy).toBe("Tasha Greene");
    expect(r.returnMs).toBe(7 * MIN);
  });

  it("a call back of 20 seconds or more reaches the customer", () => {
    const [r] = rows([call({}), call({ direction: "outbound", at: T0 + 3 * MIN, to: "8645550101", durationSec: 95, agentName: "Marcus Lee" })]);
    expect(r.reachedCsr).toBe(true);
  });

  it("the customer calling again and a CSR answering marks it done, with no call back from us", () => {
    const [r] = rows([call({}), call({ at: T0 + 30 * MIN, agentName: "Keisha Morrow", callType: "Booked" })]);
    expect(r.doneByData).toBe(true);
    expect(r.doneBy).toBe("customer");
    expect(r.reachedCsr).toBe(true);
    expect(r.booked).toBe(true);
    expect(r.attempts).toBe(0);
    // Not counted as our callback speed
    expect(r.returnMs).toBeNull();
  });

  it("the customer getting through days later still closes it (abandoned Nov 19, called us Nov 24)", () => {
    const [r] = rows([
      call({ callType: "Abandoned" }),
      call({ at: T0 + (4 * 24 + 18) * 60 * MIN, agentName: "Small, Lexa", callType: "Excused" }),
    ]);
    expect(r.doneByData).toBe(true);
    expect(r.doneBy).toBe("customer");
    expect(r.calledBackBy).toBe("Small, Lexa");
  });

  it("another unanswered call from the customer does not close it", () => {
    const r = rows([call({ callType: "Abandoned" }), call({ at: T0 + 2 * MIN, callType: "Abandoned" })]);
    expect(r.every((x) => !x.doneByData)).toBe(true);
  });

  it("our call back is credited to us when it comes first", () => {
    const [r] = rows([
      call({}),
      call({ direction: "outbound", at: T0 + 5 * MIN, to: "8645550101", durationSec: 60, agentName: "Marcus Lee" }),
      call({ at: T0 + 60 * MIN, agentName: "Keisha Morrow" }),
    ]);
    expect(r.doneBy).toBe("us");
    expect(r.returnMs).toBe(5 * MIN);
  });

  it("calls before the missed call, or our calls more than 3 days later, do not count", () => {
    const [r] = rows([
      call({ direction: "outbound", at: T0 - 10 * MIN, to: "8645550101", agentName: "Ben Alvarez" }),
      call({}),
      call({ direction: "outbound", at: T0 + 4 * 24 * 60 * MIN, to: "8645550101", agentName: "Ben Alvarez" }),
    ]);
    expect(r.doneByData).toBe(false);
    expect(r.attempts).toBe(0);
  });

  it("overnight calls are timed from 7 am", () => {
    const night = nyTime(2026, 11, 23, 22, 0);
    const [r] = buildCallbackRows(
      [call({ at: night }), call({ direction: "outbound", at: nyTime(2026, 11, 24, 7, 20), to: "8645550101", agentName: "Marcus Lee" })],
      night - MIN,
      night + MIN,
    );
    expect(r.returnMs).toBe(20 * MIN);
  });

  it("summary and phone formatting", () => {
    const r = rows([call({}), call({ from: "8645550202" }), call({ direction: "outbound", at: T0 + MIN, to: "8645550101", agentName: "A" })]);
    expect(summarize(r)).toEqual({ total: 2, calledBack: 1, stillOpen: 1, rate: 0.5 });
    expect(formatPhone("+18645550101")).toBe("(864) 555-0101");
  });
});

describe("elapsed time wording", () => {
  it("uses seconds, minutes, hours and days", async () => {
    const { fmtElapsed } = await import("@/lib/format");
    expect(fmtElapsed(45_000)).toBe("45 sec");
    expect(fmtElapsed(12 * 60_000 + 30_000)).toBe("12 min");
    expect(fmtElapsed(2 * 3_600_000 + 5 * 60_000)).toBe("2 hr 5 min");
    expect(fmtElapsed(3 * 3_600_000)).toBe("3 hr");
    expect(fmtElapsed(26 * 3_600_000)).toBe("1 day 2 hr");
  });

  it("first names from ServiceTitan's 'Last, First' format", async () => {
    const { firstName } = await import("./live");
    expect(firstName("Small, Lexa")).toBe("Lexa");
    expect(firstName("Kielah Bersano")).toBe("Kielah");
    expect(firstName("Hicks, Jesse - OFFICE")).toBe("Jesse");
  });
});
