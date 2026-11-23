/**
 * Domain types for the Call Center app.
 * All timestamps are epoch milliseconds (UTC). Display is always in America/New_York.
 */

export type SourceSystem =
  | "ServiceTitan"
  | "Dialpad"
  | "AI Voice Agent"
  | "GoHighLevel"
  | "Hatch"
  | "Lace AI";

export const JOB_TYPES = [
  "No Heat",
  "No Cool",
  "HVAC Service",
  "Plumbing Service",
  "Drains / Jetting",
  "Gas Service",
  "Water Heater",
  "Call Back",
  "Warranty",
  "Estimate Request",
] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const EMERGENCY_JOB_TYPES: readonly JobType[] = ["No Heat", "No Cool", "Gas Service"];

export const CITIES = [
  "Greenville",
  "Greer",
  "Duncan",
  "Simpsonville",
  "Spartanburg",
  "Taylors",
  "Mauldin",
  "Hendersonville",
] as const;
export type City = (typeof CITIES)[number];

export interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  /** Every phone number on the customer record. Callbacks match on any of these. */
  phones: string[];
  city: City;
  state: "SC" | "NC";
  address: string;
  isVip: boolean;
  membershipSince: number | null;
  type: "Residential" | "Commercial";
  createdAt: number;
}

export type CsrProfile = "strong" | "steady" | "struggling" | "new";

export interface Csr {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  initials: string;
  /** Avatar background, chosen from a fixed, calm set */
  avatarTone: string;
  shiftStartHour: number;
  shiftEndHour: number;
  hiredAt: number;
  profile: CsrProfile;
  email: string;
}

export type InboundOutcome = "csr_answered" | "ai_agent" | "abandoned" | "missed";
export type OutboundOutcome = "answered" | "no_answer" | "voicemail";

interface CallBase {
  id: string;
  customerId: string;
  phone: string;
  startedAt: number;
  durationSec: number;
  jobType: JobType;
}

export interface InboundCall extends CallBase {
  direction: "inbound";
  outcome: InboundOutcome;
  campaignId: string;
  /** CSR who answered (csr_answered), or whose line rang and did not pick up (missed, abandoned, AI during open hours) */
  csrId: string | null;
  /** True when a job was booked on this call */
  booked: boolean;
  jobId: string | null;
  /** AI Voice Agent call summary */
  aiSummary: string | null;
  /** Flag set when the caller signalled strong buying intent */
  hotLead: boolean;
  /** Lace AI flagged this answered call for a follow-up (the reason), or undefined */
  laceFlag?: string | null;
  source: "ServiceTitan";
}

export interface OutboundCall extends CallBase {
  direction: "outbound";
  outcome: OutboundOutcome;
  csrId: string;
  source: "ServiceTitan";
}

export type Call = InboundCall | OutboundCall;

export interface TextMessage {
  id: string;
  customerId: string;
  phone: string;
  sentAt: number;
  csrId: string;
  body: string;
}

export type JobStatus = "Booked" | "Completed" | "Paid" | "Canceled";

export interface Job {
  id: string;
  customerId: string;
  jobType: JobType;
  bookedAt: number;
  scheduledFor: number;
  completedAt: number | null;
  paidAt: number | null;
  status: JobStatus;
  bookedByCsrId: string | null;
  bookedBy: "csr" | "ai_agent" | "online";
  campaignId: string;
  originCallId: string | null;
  /** Invoice total once completed, otherwise the estimated value */
  amount: number;
  isReplacement: boolean;
}

export type CampaignCategory =
  | "Paid search"
  | "Organic"
  | "Google Business Profile"
  | "Lead marketplace"
  | "Offline"
  | "Referral"
  | "Web"
  | "Existing customers"
  | "Untracked";

export interface Campaign {
  id: string;
  name: string;
  category: CampaignCategory;
  isUntracked: boolean;
}

export type LeadChannel = "Phone" | "Web Form" | "Angi" | "AI Voice Agent" | "Referral" | "Hatch";

/** Leads that arrive outside the phone system (web forms, Angi via GoHighLevel) */
export interface InboundLead {
  id: string;
  customerId: string;
  channel: "Web Form" | "Angi";
  receivedAt: number;
  jobType: JobType;
  message: string;
  source: "GoHighLevel" | "ServiceTitan";
}

export type LeadStage = "New" | "Contacted" | "Booked" | "Job completed" | "Paid";
export const LEAD_STAGES: LeadStage[] = ["New", "Contacted", "Booked", "Job completed", "Paid"];

export interface Lead {
  id: string;
  customerId: string;
  channel: LeadChannel;
  campaignId: string | null;
  jobType: JobType;
  createdAt: number;
  stage: LeadStage;
  stageHistory: { stage: LeadStage; at: number }[];
  value: number;
  jobId: string | null;
  firstContactAt: number | null;
}

export type AvailabilityStatus = "Available" | "On call" | "Break" | "Lunch" | "Away" | "Offline";

export interface AvailabilityBlock {
  csrId: string;
  start: number;
  end: number;
  status: AvailabilityStatus;
}

export interface TeamUser {
  id: string;
  name: string;
  role: "Owner" | "Co-owner" | "Manager" | "CSR";
  email: string;
  csrId: string | null;
}

/* ---------- Callbacks ---------- */

export type CallbackList = "needs_callback" | "attempted" | "called_back" | "booked" | "closed";

export const CALLBACK_LISTS: CallbackList[] = [
  "needs_callback",
  "attempted",
  "called_back",
  "booked",
  "closed",
];

export type CallbackTrigger = "missed" | "abandoned" | "ai_agent";

export type ManualOutcome =
  | "spoke"
  | "no_answer"
  | "voicemail"
  | "booked"
  | "not_interested"
  | "wrong_number"
  | "spam"
  | "duplicate";

export type CloseReason =
  | "Wrong number"
  | "Not interested"
  | "Spam"
  | "Duplicate"
  | `No answer after ${number} attempts`;

/** User or simulator actions that are not phone system events */
export type CallbackAction =
  | { id: string; kind: "claim"; callbackId: string; csrId: string; at: number }
  | { id: string; kind: "release"; callbackId: string; csrId: string; at: number }
  | { id: string; kind: "close"; callbackId: string; csrId: string; at: number; reason: CloseReason };

export type Priority = "Urgent" | "High" | "Normal";

export type TimelineEventKind =
  | "missed_call"
  | "ai_summary"
  | "claimed"
  | "claim_expired"
  | "released"
  | "attempt"
  | "spoke"
  | "text"
  | "called_in"
  | "back_to_needs"
  | "booked"
  | "closed";

export interface TimelineEvent {
  id: string;
  at: number;
  kind: TimelineEventKind;
  title: string;
  detail?: string;
  csrId?: string | null;
}

export interface Callback {
  /** Stable id: derived from the first trigger call */
  id: string;
  customerId: string;
  trigger: CallbackTrigger;
  triggerCallIds: string[];
  missedCount: number;
  firstMissedAt: number;
  lastMissedAt: number;
  jobType: JobType;
  campaignId: string;
  hotLead: boolean;
  list: CallbackList;
  attempts: number;
  lastAttemptAt: number | null;
  firstAttemptAt: number | null;
  /** When the item reached a final list (called back, booked, closed) */
  resolvedAt: number | null;
  resolvedByCsrId: string | null;
  /** First real contact (spoke, text, inbound answered) */
  contactAt: number | null;
  closeReason: CloseReason | null;
  claim: { csrId: string; at: number; expiresAt: number } | null;
  jobId: string | null;
  priority: Priority;
  priorityReasons: string[];
  events: TimelineEvent[];
}

export interface CallbackSettings {
  minCallSeconds: number;
  maxAttempts: number;
  retryWaitMinutes: number;
  textsCountAsContact: boolean;
  claimExpiryMinutes: number;
  alertAfterMinutes: number;
}

export const DEFAULT_CALLBACK_SETTINGS: CallbackSettings = {
  minCallSeconds: 20,
  maxAttempts: 3,
  retryWaitMinutes: 120,
  textsCountAsContact: false,
  claimExpiryMinutes: 15,
  alertAfterMinutes: 15,
};

/* ---------- Dataset ---------- */

export interface Dataset {
  generatedAt: number;
  goLiveAt: number;
  customers: Customer[];
  csrs: Csr[];
  campaigns: Campaign[];
  calls: Call[];
  texts: TextMessage[];
  jobs: Job[];
  inboundLeads: InboundLead[];
  availability: AvailabilityBlock[];
  users: TeamUser[];
  /** Dialpad counts internal (CSR to CSR) calls, ServiceTitan does not */
  dialpadInternalCallsByDay: Record<string, number>;
}
