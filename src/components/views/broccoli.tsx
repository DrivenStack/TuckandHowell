"use client";

import { Bot } from "lucide-react";
import { AI_LENGTH_BUCKETS } from "@/lib/metrics/abandoned";
import { AI_VOICE_AGENT_VENDOR } from "@/lib/data/sources/aiVoiceAgent";
import { FollowUpDashboard, type DashboardConfig } from "./follow-up-dashboard";

const CONFIG: DashboardConfig = {
  kind: "ai_agent",
  title: "Broccoli calls",
  description: "Callers the AI Voice Agent answered who did not book, and how fast a person called them back.",
  source: `${AI_VOICE_AGENT_VENDOR} AI Voice Agent, via ServiceTitan`,
  noun: "Broccoli",
  metrics: {
    total: "broccoli_calls",
    calledBack: "broccoli_called_back",
    stillOpen: "broccoli_still_open",
    rate: "broccoli_called_back_rate",
    speed: "broccoli_speed",
    bookRate: "broccoli_book_rate",
    length: "broccoli_call_length",
  },
  totalLabel: "Broccoli calls",
  totalSub: "Did not book with the AI",
  speedFrom: "the Broccoli call",
  emptyIcon: Bot,
  emptyTitle: "No Broccoli calls in this period",
  emptyText: "Broccoli did not take any calls that needed a call back. Pick a longer date range to see past calls.",
  length: {
    title: "Call length with Broccoli",
    rule: "How long callers talked with the AI before the call ended. Very short calls often mean the caller hung up on the AI.",
    buckets: AI_LENGTH_BUCKETS,
    target: false,
    unitLabel: "Broccoli calls",
    footer: "Each line shows Broccoli calls per {per}, on the same scale so rows compare.",
  },
};

export function BroccoliView() {
  return <FollowUpDashboard config={CONFIG} />;
}
