/**
 * Every metric shown in the app. Names are written the way the owner would say them.
 * Components look metrics up here so name, explanation and source are identical everywhere.
 */
export type MetricSource = "ServiceTitan" | "Dialpad" | "ServiceTitan and Dialpad";

export type MetricFormat = "count" | "percent" | "currency" | "minutes" | "duration";

export interface MetricDefinition {
  id: MetricId;
  name: string;
  explanation: string;
  formula: string;
  source: MetricSource;
  format: MetricFormat;
  /** Whether a higher value is good. Drives the better / worse color. */
  higherIsBetter: boolean;
  group: "Calls" | "Callbacks" | "Bookings" | "Revenue" | "Team" | "AI Voice Agent" | "Leads" | "Marketing";
}

export const METRIC_IDS = [
  "callbacks_total",
  "callbacks_called_back",
  "callbacks_still_open",
  "callbacks_called_back_rate",
  "callbacks_speed",
] as const;

export type MetricId = (typeof METRIC_IDS)[number];

const defs: Omit<MetricDefinition, "id">[] = [
  {
    name: "Missed and abandoned calls",
    explanation: "Inbound calls nobody answered: callers who hung up before anyone picked up (Abandoned) and other unanswered calls (Missed).",
    formula: "Inbound calls marked Abandoned, plus inbound calls with no agent",
    source: "ServiceTitan",
    format: "count",
    higherIsBetter: false,
    group: "Callbacks",
  },
  {
    name: "Got called back",
    explanation: "Missed and abandoned calls where someone called the number back, or the caller called again and a CSR answered, within 3 days.",
    formula: "Calls followed by an outbound call to the caller's number, or an answered inbound call from it",
    source: "ServiceTitan",
    format: "count",
    higherIsBetter: true,
    group: "Callbacks",
  },
  {
    name: "Call backs still open",
    explanation: "Missed and abandoned callers nobody has called back yet.",
    formula: "Missed and abandoned calls − got called back",
    source: "ServiceTitan",
    format: "count",
    higherIsBetter: false,
    group: "Callbacks",
  },
  {
    name: "Called back rate",
    explanation: "Out of every missed and abandoned call, the share we have called back.",
    formula: "Got called back ÷ missed and abandoned calls",
    source: "ServiceTitan",
    format: "percent",
    higherIsBetter: true,
    group: "Callbacks",
  },
  {
    name: "Typical callback speed",
    explanation: "How long a customer usually waits for our first call back, counted from when we open (7 am to 7 pm). Half wait less than this.",
    formula: "Median of (first call back − request time during open hours)",
    source: "ServiceTitan",
    format: "minutes",
    higherIsBetter: false,
    group: "Callbacks",
  },
];

export const METRICS: Record<MetricId, MetricDefinition> = Object.fromEntries(
  METRIC_IDS.map((id, i) => [id, { id, ...defs[i] }]),
) as Record<MetricId, MetricDefinition>;

export const metric = (id: MetricId) => METRICS[id];
