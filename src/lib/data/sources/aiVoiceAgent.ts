import type { InboundCall } from "@/lib/types";
import type { SourceAdapter, TimeRange } from "./types";

/**
 * AI Voice Agent: answers calls when no CSR is free. The current vendor is Broccoli,
 * which syncs into ServiceTitan. The UI says "AI Voice Agent" so the vendor can change.
 */
export const AI_VOICE_AGENT_VENDOR = "Broccoli";

export interface AiVoiceAgentAdapter extends SourceAdapter {
  vendor: string;
  getCalls(range: TimeRange): Promise<InboundCall[]>;
}

export function createAiVoiceAgentAdapter(): AiVoiceAgentAdapter {
  return {
    vendor: AI_VOICE_AGENT_VENDOR,
    status: async () => ({ system: "AI Voice Agent", state: "Not connected", lastSyncedAt: null, note: `${AI_VOICE_AGENT_VENDOR}, via ServiceTitan.` }),
    getCalls: () => Promise.reject(new Error("AI Voice Agent sync is not configured yet.")),
  };
}
