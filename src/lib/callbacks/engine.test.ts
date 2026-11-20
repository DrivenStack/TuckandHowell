import { describe, expect, it } from "vitest";
import {
  DEFAULT_CALLBACK_SETTINGS,
  type Call,
  type CallbackAction,
  type CallbackSettings,
  type Customer,
  type InboundCall,
  type Job,
  type OutboundCall,
  type TextMessage,
} from "@/lib/types";
import {
  callbackIdFor,
  computePriority,
  deriveCallbacks,
  diffLists,
  neverReturned,
  sortByPriority,
  timeToCallback,
} from "./engine";

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 20, 14, 0); // 9:00 am New York

const customer = (over: Partial<Customer> = {}): Customer => ({
  id: "c1",
  firstName: "Dana",
  lastName: "Whitfield",
  name: "Dana Whitfield",
  phones: ["(864) 555-0101", "(864) 555-0102"],
  city: "Greer",
  state: "SC",
  address: "1 Main St",
  isVip: false,
  membershipSince: null,
  type: "Residential",
  createdAt: 0,
  ...over,
});

const missed = (id: string, at: number, over: Partial<InboundCall> = {}): InboundCall => ({
  id,
  direction: "inbound",
  customerId: "c1",
  phone: "(864) 555-0101",
  startedAt: at,
  durationSec: 0,
  jobType: "Plumbing Service",
  outcome: "missed",
  campaignId: "seo",
  csrId: null,
  booked: false,
  jobId: null,
  aiSummary: null,
  hotLead: false,
  source: "ServiceTitan",
  ...over,
});

const outbound = (id: string, at: number, over: Partial<OutboundCall> = {}): OutboundCall => ({
  id,
  direction: "outbound",
  customerId: "c1",
  phone: "(864) 555-0101",
  startedAt: at,
  durationSec: 120,
  jobType: "Plumbing Service",
  outcome: "answered",
  csrId: "csr_a",
  source: "ServiceTitan",
  ...over,
});

const job = (id: string, at: number): Job => ({
  id,
  customerId: "c1",
  jobType: "Plumbing Service",
  bookedAt: at,
  scheduledFor: at + 86_400_000,
  completedAt: null,
  paidAt: null,
  status: "Booked",
  bookedByCsrId: "csr_a",
  bookedBy: "csr",
  campaignId: "seo",
  originCallId: null,
  amount: 450,
  isReplacement: false,
});

function run(opts: {
  calls: Call[];
  jobs?: Job[];
  texts?: TextMessage[];
  actions?: CallbackAction[];
  settings?: Partial<CallbackSettings>;
  now?: number;
  customers?: Customer[];
}) {
  return deriveCallbacks({
    customers: opts.customers ?? [customer()],
    calls: opts.calls,
    texts: opts.texts ?? [],
    jobs: opts.jobs ?? [],
    actions: opts.actions ?? [],
    settings: { ...DEFAULT_CALLBACK_SETTINGS, ...opts.settings },
    now: opts.now ?? T0 + 60 * MIN,
  });
}

describe("callback engine", () => {
  it("puts a missed call in Needs callback", () => {
    const [cb] = run({ calls: [missed("m1", T0)] });
    expect(cb.list).toBe("needs_callback");
    expect(cb.id).toBe(callbackIdFor("m1"));
    expect(neverReturned(cb)).toBe(true);
  });

  it("does not create callbacks for answered or AI-booked calls", () => {
    const cbs = run({
      calls: [
        missed("a1", T0, { outcome: "csr_answered", csrId: "csr_a" }),
        missed("a2", T0 + MIN, { outcome: "ai_agent", booked: true }),
      ],
    });
    expect(cbs).toHaveLength(0);
  });

  it("includes AI Voice Agent calls with no booking and abandoned calls", () => {
    const cbs = run({
      customers: [customer(), customer({ id: "c2", phones: ["(864) 555-0200"] })],
      calls: [
        missed("ai1", T0, { outcome: "ai_agent", aiSummary: "No heat." }),
        missed("ab1", T0, { outcome: "abandoned", customerId: "c2", phone: "(864) 555-0200" }),
      ],
    });
    expect(cbs.map((c) => c.trigger).sort()).toEqual(["abandoned", "ai_agent"]);
    expect(cbs.find((c) => c.trigger === "ai_agent")?.events.some((e) => e.kind === "ai_summary")).toBe(true);
  });

  it("rule 1: matches an outbound call to the customer's other phone number", () => {
    const [cb] = run({
      calls: [missed("m1", T0), outbound("o1", T0 + 10 * MIN, { phone: "864-555-0102", customerId: "unknown" })],
    });
    expect(cb.list).toBe("called_back");
  });

  it("rule 2: ignores outbound calls made before the missed call", () => {
    const [cb] = run({ calls: [outbound("o1", T0 - 10 * MIN), missed("m1", T0)] });
    expect(cb.list).toBe("needs_callback");
    expect(cb.attempts).toBe(0);
  });

  it("rule 3: answered call over the minimum moves to Called back", () => {
    const [cb] = run({ calls: [missed("m1", T0), outbound("o1", T0 + 5 * MIN, { durationSec: 20 })] });
    expect(cb.list).toBe("called_back");
    expect(cb.resolvedByCsrId).toBe("csr_a");
    expect(timeToCallback(cb)).toBe(5 * MIN);
  });

  it("rule 4: short, unanswered and voicemail calls move to Attempted", () => {
    for (const over of [
      { durationSec: 19 },
      { outcome: "no_answer" as const, durationSec: 0 },
      { outcome: "voicemail" as const, durationSec: 30 },
    ]) {
      const [cb] = run({ calls: [missed("m1", T0), outbound("o1", T0 + 5 * MIN, over)] });
      expect(cb.list).toBe("attempted");
      expect(cb.attempts).toBe(1);
    }
  });

  it("respects a custom minimum call length", () => {
    const [cb] = run({
      calls: [missed("m1", T0), outbound("o1", T0 + 5 * MIN, { durationSec: 25 })],
      settings: { minCallSeconds: 30 },
    });
    expect(cb.list).toBe("attempted");
  });

  it("Attempted returns to Needs callback after the retry wait", () => {
    const calls = [missed("m1", T0), outbound("o1", T0 + 5 * MIN, { outcome: "no_answer", durationSec: 0 })];
    expect(run({ calls, now: T0 + 60 * MIN })[0].list).toBe("attempted");
    const later = run({ calls, now: T0 + 5 * MIN + 120 * MIN })[0];
    expect(later.list).toBe("needs_callback");
    expect(later.attempts).toBe(1);
    expect(later.events.some((e) => e.kind === "back_to_needs")).toBe(true);
  });

  it("rule 5: customer calls in and a CSR answers moves to Called back", () => {
    const [cb] = run({
      calls: [missed("m1", T0), missed("i1", T0 + 30 * MIN, { outcome: "csr_answered", csrId: "csr_b", durationSec: 200 })],
    });
    expect(cb.list).toBe("called_back");
    expect(cb.resolvedByCsrId).toBe("csr_b");
  });

  it("rule 6: a booking wins, even after Called back", () => {
    const [cb] = run({
      calls: [missed("m1", T0), outbound("o1", T0 + 5 * MIN)],
      jobs: [job("j1", T0 + 50 * MIN)],
    });
    expect(cb.list).toBe("booked");
    expect(cb.jobId).toBe("j1");
  });

  it("rule 6: a booking made before the missed call does not count", () => {
    const [cb] = run({ calls: [missed("m1", T0)], jobs: [job("j0", T0 - 5 * MIN)] });
    expect(cb.list).toBe("needs_callback");
  });

  it("rule 7: closes after max attempts with no contact", () => {
    const calls: Call[] = [missed("m1", T0)];
    for (let i = 0; i < 3; i++) calls.push(outbound(`o${i}`, T0 + (5 + i * 130) * MIN, { outcome: "no_answer", durationSec: 0 }));
    const [cb] = run({ calls, now: T0 + 600 * MIN });
    expect(cb.list).toBe("closed");
    expect(cb.closeReason).toBe("No answer after 3 attempts");
  });

  it("rule 7: honours a custom max attempts", () => {
    const calls: Call[] = [missed("m1", T0), outbound("o1", T0 + 5 * MIN, { outcome: "no_answer", durationSec: 0 })];
    const [cb] = run({ calls, settings: { maxAttempts: 1 } });
    expect(cb.list).toBe("closed");
    expect(cb.closeReason).toBe("No answer after 1 attempts");
  });

  it("rule 8: texts only count as contact when the setting is on", () => {
    const texts: TextMessage[] = [
      { id: "t1", customerId: "c1", phone: "(864) 555-0102", sentAt: T0 + 5 * MIN, csrId: "csr_a", body: "Hi" },
    ];
    expect(run({ calls: [missed("m1", T0)], texts })[0].list).toBe("needs_callback");
    expect(run({ calls: [missed("m1", T0)], texts, settings: { textsCountAsContact: true } })[0].list).toBe("called_back");
  });

  it("rule 9: groups repeat missed calls into one item", () => {
    const cbs = run({
      calls: [missed("m1", T0), missed("m2", T0 + 8 * MIN, { phone: "(864) 555-0102" }), missed("m3", T0 + 20 * MIN, { outcome: "ai_agent" })],
    });
    expect(cbs).toHaveLength(1);
    expect(cbs[0].missedCount).toBe(3);
    expect(cbs[0].id).toBe(callbackIdFor("m1"));
  });

  it("starts a new item when the customer misses again after being called back", () => {
    const cbs = run({
      calls: [missed("m1", T0), outbound("o1", T0 + 5 * MIN), missed("m2", T0 + 40 * MIN)],
    });
    expect(cbs.map((c) => c.list).sort()).toEqual(["called_back", "needs_callback"]);
  });

  it("claims lock to a CSR and expire when no call is made", () => {
    const id = callbackIdFor("m1");
    const actions: CallbackAction[] = [{ id: "a1", kind: "claim", callbackId: id, csrId: "csr_a", at: T0 + 2 * MIN }];
    const active = run({ calls: [missed("m1", T0)], actions, now: T0 + 10 * MIN })[0];
    expect(active.claim?.csrId).toBe("csr_a");
    const expired = run({ calls: [missed("m1", T0)], actions, now: T0 + 20 * MIN })[0];
    expect(expired.claim).toBeNull();
    expect(expired.events.some((e) => e.kind === "claim_expired")).toBe(true);
  });

  it("a second claim on an already claimed item is ignored", () => {
    const id = callbackIdFor("m1");
    const [cb] = run({
      calls: [missed("m1", T0)],
      actions: [
        { id: "a1", kind: "claim", callbackId: id, csrId: "csr_a", at: T0 + 1 * MIN },
        { id: "a2", kind: "claim", callbackId: id, csrId: "csr_b", at: T0 + 2 * MIN },
      ],
      now: T0 + 5 * MIN,
    });
    expect(cb.claim?.csrId).toBe("csr_a");
  });

  it("manual close moves the item to Closed with the reason", () => {
    const id = callbackIdFor("m1");
    const [cb] = run({
      calls: [missed("m1", T0)],
      actions: [{ id: "a1", kind: "close", callbackId: id, csrId: "csr_a", at: T0 + 5 * MIN, reason: "Wrong number" }],
    });
    expect(cb.list).toBe("closed");
    expect(cb.closeReason).toBe("Wrong number");
  });

  it("priority uses emergency, VIP, repeat calls, wait and hot lead", () => {
    const base = { jobType: "Plumbing Service" as const, missedCount: 1, firstMissedAt: T0, hotLead: false };
    expect(computePriority(base, { isVip: false }, T0 + 2 * MIN).priority).toBe("Normal");
    expect(computePriority({ ...base, jobType: "No Heat" }, { isVip: false }, T0 + 2 * MIN).priority).toBe("High");
    expect(computePriority({ ...base, jobType: "No Heat" }, { isVip: true }, T0 + 20 * MIN).priority).toBe("Urgent");
    expect(computePriority(base, { isVip: false }, T0 + 90 * MIN).priority).toBe("High");
  });

  it("sorts by priority, then by oldest wait", () => {
    const cbs = run({
      customers: [
        customer(),
        customer({ id: "c2", phones: ["(864) 555-0200"], isVip: true }),
        customer({ id: "c3", phones: ["(864) 555-0300"] }),
      ],
      calls: [
        missed("m1", T0),
        missed("m2", T0 + 5 * MIN, { customerId: "c2", phone: "(864) 555-0200", jobType: "No Heat" }),
        missed("m3", T0 - 5 * MIN, { customerId: "c3", phone: "(864) 555-0300" }),
      ],
      now: T0 + 10 * MIN,
    });
    expect(sortByPriority(cbs).map((c) => c.customerId)).toEqual(["c2", "c3", "c1"]);
  });

  it("diffLists reports moves between lists", () => {
    const before = run({ calls: [missed("m1", T0)] });
    const after = run({ calls: [missed("m1", T0), outbound("o1", T0 + 5 * MIN)] });
    expect(diffLists(before, after)).toEqual([{ callbackId: callbackIdFor("m1"), from: "needs_callback", to: "called_back" }]);
  });
});

describe("New York time helpers", () => {
  it("round-trips wall-clock times across the DST change", async () => {
    const { nyTime, nyParts, nyAddDays, nyStartOfDay } = await import("@/lib/time");
    const t = nyTime(2026, 11, 1, 1, 30); // after fall-back ambiguity resolves
    expect(nyParts(t).hour).toBe(1);
    const a = nyTime(2026, 10, 31, 9, 0);
    expect(nyParts(a)).toMatchObject({ year: 2026, month: 10, day: 31, hour: 9, minute: 0 });
    const b = nyAddDays(a, 2);
    expect(nyParts(b)).toMatchObject({ month: 11, day: 2, hour: 0 });
    expect(nyStartOfDay(nyTime(2026, 11, 20, 23, 59))).toBe(nyTime(2026, 11, 20));
    expect(nyTime(2026, 7, 1, 12) - Date.UTC(2026, 6, 1, 16)).toBe(0); // EDT, UTC-4
    expect(nyTime(2026, 12, 1, 12) - Date.UTC(2026, 11, 1, 17)).toBe(0); // EST, UTC-5
  });

  it("starts the callback clock at 7 am for after-hours calls", async () => {
    const { clockStart } = await import("./engine");
    const { nyTime } = await import("@/lib/time");
    expect(clockStart(nyTime(2026, 11, 20, 10, 0))).toBe(nyTime(2026, 11, 20, 10, 0));
    expect(clockStart(nyTime(2026, 11, 20, 21, 0))).toBe(nyTime(2026, 11, 21, 7, 0));
    expect(clockStart(nyTime(2026, 11, 20, 3, 0))).toBe(nyTime(2026, 11, 20, 7, 0));
  });
});
