import type { Call, Campaign, Customer, InboundLead, Job, TextMessage } from "@/lib/types";
import type { SourceAdapter, TimeRange } from "./types";

/**
 * ServiceTitan: the main system and source of truth for calls, customers, jobs,
 * invoices and marketing campaigns. Calls here exclude internal (CSR to CSR) calls.
 */
export interface ServiceTitanAdapter extends SourceAdapter {
  getCustomers(): Promise<Customer[]>;
  /** Inbound and outbound calls. Excludes AI Voice Agent calls, see aiVoiceAgent.ts */
  getCalls(range: TimeRange): Promise<Call[]>;
  getTexts(range: TimeRange): Promise<TextMessage[]>;
  getJobs(range: TimeRange): Promise<Job[]>;
  getCampaigns(): Promise<Campaign[]>;
  /** Web form bookings and requests */
  getWebLeads(range: TimeRange): Promise<InboundLead[]>;
}

export function createServiceTitanAdapter(): ServiceTitanAdapter {
  const notConnected = () => Promise.reject(new Error("ServiceTitan API is not configured yet."));
  return {
    status: async () => ({ system: "ServiceTitan", state: "Not connected", lastSyncedAt: null, note: "Add API credentials to connect." }),
    getCustomers: notConnected,
    getCalls: notConnected,
    getTexts: notConnected,
    getJobs: notConnected,
    getCampaigns: notConnected,
    getWebLeads: notConnected,
  };
}
