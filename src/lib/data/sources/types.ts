/** Shared shapes for every source adapter. */
export interface TimeRange {
  from: number;
  to: number;
}

export interface AdapterStatus {
  system: string;
  /** Shown in Settings > Data sources */
  state: "Connected" | "Connected via ServiceTitan" | "On hold" | "Not connected";
  lastSyncedAt: number | null;
  note: string;
}

export interface SourceAdapter {
  status(): Promise<AdapterStatus>;
}
