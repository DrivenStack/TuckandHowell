import type { Dataset } from "@/lib/types";
import { MINUTE } from "@/lib/time";
import type { AiVoiceAgentAdapter } from "../sources/aiVoiceAgent";
import { AI_VOICE_AGENT_VENDOR } from "../sources/aiVoiceAgent";
import type { DialpadAdapter } from "../sources/dialpad";
import type { GoHighLevelAdapter } from "../sources/goHighLevel";
import type { ServiceTitanAdapter } from "../sources/serviceTitan";
import type { TimeRange } from "../sources/types";
import { generateDataset } from "./generate";

/** Mock adapters read from one seeded dataset, generated once per page load. */
let cache: { key: number; data: Dataset } | null = null;

function dataset(now: number): Dataset {
  const key = Math.floor(now / (10 * MINUTE));
  if (!cache || cache.key !== key) cache = { key, data: generateDataset(now) };
  return cache.data;
}

const inRange = (t: number, r: TimeRange) => t >= r.from && t <= r.to;
const delay = <T,>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), 120));

export function createMockAdapters(now: () => number) {
  const d = () => dataset(now());
  const synced = (minsAgo: number) => now() - minsAgo * MINUTE;

  const serviceTitan: ServiceTitanAdapter = {
    status: async () => ({ system: "ServiceTitan", state: "Connected", lastSyncedAt: synced(1), note: "Calls, customers, jobs, invoices, campaigns." }),
    getCustomers: async () => delay(d().customers),
    getCalls: async (r) =>
      delay(d().calls.filter((c) => inRange(c.startedAt, r) && !(c.direction === "inbound" && c.outcome === "ai_agent"))),
    getTexts: async (r) => delay(d().texts.filter((t) => inRange(t.sentAt, r))),
    getJobs: async (r) => delay(d().jobs.filter((j) => inRange(j.bookedAt, r))),
    getCampaigns: async () => delay(d().campaigns),
    getWebLeads: async (r) => delay(d().inboundLeads.filter((l) => l.channel === "Web Form" && inRange(l.receivedAt, r))),
  };

  const dialpad: DialpadAdapter = {
    status: async () => ({ system: "Dialpad", state: "Connected", lastSyncedAt: synced(0.5), note: "CSR availability, breaks and call events." }),
    getCsrs: async () => delay(d().csrs),
    getAvailability: async (r) => delay(d().availability.filter((b) => b.end >= r.from && b.start <= r.to)),
    getInternalCallCounts: async () => delay(d().dialpadInternalCallsByDay),
  };

  const aiVoiceAgent: AiVoiceAgentAdapter = {
    vendor: AI_VOICE_AGENT_VENDOR,
    status: async () => ({ system: "AI Voice Agent", state: "Connected via ServiceTitan", lastSyncedAt: synced(2), note: `${AI_VOICE_AGENT_VENDOR}, synced into ServiceTitan.` }),
    getCalls: async (r) =>
      delay(
        d().calls.filter(
          (c): c is Extract<typeof c, { direction: "inbound" }> =>
            c.direction === "inbound" && c.outcome === "ai_agent" && inRange(c.startedAt, r),
        ),
      ),
  };

  const goHighLevel: GoHighLevelAdapter = {
    status: async () => ({ system: "GoHighLevel", state: "Connected", lastSyncedAt: synced(4), note: "Angi leads." }),
    getLeads: async (r) => delay(d().inboundLeads.filter((l) => l.channel === "Angi" && inRange(l.receivedAt, r))),
  };

  return {
    serviceTitan,
    dialpad,
    aiVoiceAgent,
    goHighLevel,
    /** Generation metadata the real systems do not have */
    meta: () => ({ goLiveAt: d().goLiveAt, users: d().users }),
  };
}
