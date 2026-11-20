import type { InboundLead } from "@/lib/types";
import type { SourceAdapter, TimeRange } from "./types";

/** GoHighLevel: where Angi leads land. */
export interface GoHighLevelAdapter extends SourceAdapter {
  getLeads(range: TimeRange): Promise<InboundLead[]>;
}

export function createGoHighLevelAdapter(): GoHighLevelAdapter {
  return {
    status: async () => ({ system: "GoHighLevel", state: "Not connected", lastSyncedAt: null, note: "Add API key to connect." }),
    getLeads: () => Promise.reject(new Error("GoHighLevel API is not configured yet.")),
  };
}
