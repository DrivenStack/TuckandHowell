import type { AvailabilityBlock, Csr } from "@/lib/types";
import type { SourceAdapter, TimeRange } from "./types";

/**
 * Dialpad: phone service. Source of truth for CSR availability, breaks and status.
 * Dialpad counts internal calls, so call counts come from ServiceTitan instead.
 */
export interface DialpadAdapter extends SourceAdapter {
  getCsrs(): Promise<Csr[]>;
  getAvailability(range: TimeRange): Promise<AvailabilityBlock[]>;
  /** Internal CSR to CSR calls by New York day key, shown to explain count differences */
  getInternalCallCounts(range: TimeRange): Promise<Record<string, number>>;
}

export function createDialpadAdapter(): DialpadAdapter {
  const notConnected = () => Promise.reject(new Error("Dialpad API is not configured yet."));
  return {
    status: async () => ({ system: "Dialpad", state: "Not connected", lastSyncedAt: null, note: "Add API credentials to connect." }),
    getCsrs: notConnected,
    getAvailability: notConnected,
    getInternalCallCounts: notConnected,
  };
}
