/**
 * The one place the app gets data from.
 *
 * Flip USE_MOCK_DATA to false once the real adapters in ./sources are implemented.
 * UI components never import adapters directly; they read the Dataset assembled here
 * through the data store.
 */
import type { Call, Dataset } from "@/lib/types";
import { DAY, nyAddDays, nyStartOfDay } from "@/lib/time";
import { USERS } from "./mock/fixtures";
import { HISTORY_DAYS } from "./mock/generate";
import { createMockAdapters } from "./mock/adapters";
import { createAiVoiceAgentAdapter } from "./sources/aiVoiceAgent";
import { createDialpadAdapter } from "./sources/dialpad";
import { createGoHighLevelAdapter } from "./sources/goHighLevel";
import { createServiceTitanAdapter } from "./sources/serviceTitan";
import type { AdapterStatus } from "./sources/types";

export const USE_MOCK_DATA = true;

/** Date the callback app went live. Real deployments set this once. */
const REAL_GO_LIVE_AT: number | null = null;

export function getDataSources(now: () => number = () => Date.now()) {
  if (USE_MOCK_DATA) return createMockAdapters(now);
  return {
    serviceTitan: createServiceTitanAdapter(),
    dialpad: createDialpadAdapter(),
    aiVoiceAgent: createAiVoiceAgentAdapter(),
    goHighLevel: createGoHighLevelAdapter(),
    meta: () => ({ goLiveAt: REAL_GO_LIVE_AT ?? Date.now(), users: USERS }),
  };
}

/** Load everything the app needs for the last 90 days, from every source. */
export async function loadDataset(now: number): Promise<Dataset> {
  const src = getDataSources(() => now);
  const range = { from: nyAddDays(nyStartOfDay(now), -(HISTORY_DAYS - 1)), to: now };
  const [customers, stCalls, texts, jobs, campaigns, webLeads, csrs, availability, internal, aiCalls, angiLeads] =
    await Promise.all([
      src.serviceTitan.getCustomers(),
      src.serviceTitan.getCalls(range),
      src.serviceTitan.getTexts(range),
      src.serviceTitan.getJobs(range),
      src.serviceTitan.getCampaigns(),
      src.serviceTitan.getWebLeads(range),
      src.dialpad.getCsrs(),
      src.dialpad.getAvailability({ from: range.from, to: range.from + HISTORY_DAYS * DAY + DAY }),
      src.dialpad.getInternalCallCounts(range),
      src.aiVoiceAgent.getCalls(range),
      src.goHighLevel.getLeads(range),
    ]);
  const calls: Call[] = [...stCalls, ...aiCalls].sort((a, b) => a.startedAt - b.startedAt);
  const meta = src.meta();
  return {
    generatedAt: now,
    goLiveAt: meta.goLiveAt,
    customers,
    csrs,
    campaigns,
    calls,
    texts,
    jobs,
    inboundLeads: [...webLeads, ...angiLeads],
    availability,
    users: meta.users,
    dialpadInternalCallsByDay: internal,
  };
}

export async function loadSourceStatuses(now: number): Promise<AdapterStatus[]> {
  const src = getDataSources(() => now);
  const live = await Promise.all([
    src.serviceTitan.status(),
    src.dialpad.status(),
    src.aiVoiceAgent.status(),
    src.goHighLevel.status(),
  ]);
  return [
    ...live,
    { system: "Hatch", state: "On hold", lastSyncedAt: now - 9 * DAY, note: "Follow-up tool. Paused because syncing was unreliable." },
    { system: "Lace AI", state: "On hold", lastSyncedAt: null, note: "Call transcripts and lead labels. Not yet connected." },
  ];
}

export type { AdapterStatus, TimeRange } from "./sources/types";
