"use client";

import { PhoneOff } from "lucide-react";
import { HANG_UP_TARGET_SEC, LENGTH_BUCKETS } from "@/lib/metrics/abandoned";
import { FollowUpDashboard, type DashboardConfig } from "./follow-up-dashboard";

const CONFIG: DashboardConfig = {
  kind: "abandoned",
  title: "Abandoned calls",
  description: "Callers who hung up while waiting on hold, and how fast we called them back.",
  source: "ServiceTitan",
  noun: "abandoned",
  metrics: {
    total: "abandoned_calls",
    calledBack: "abandoned_called_back",
    stillOpen: "abandoned_still_open",
    rate: "abandoned_called_back_rate",
    speed: "abandoned_speed",
    bookRate: "abandoned_book_rate",
    length: "abandoned_hang_up_length",
  },
  totalLabel: "Abandoned calls",
  totalSub: "Hung up while waiting",
  speedFrom: "the hang-up",
  emptyIcon: PhoneOff,
  emptyTitle: "No abandoned calls in this period",
  emptyText: "Nobody hung up while waiting. Pick a longer date range to see past calls.",
  length: {
    title: "Call length before hang-up",
    rule: `Rule of thumb: should all be ${HANG_UP_TARGET_SEC} seconds or less. Longer means callers waited on hold before giving up.`,
    buckets: LENGTH_BUCKETS,
    target: true,
    unitLabel: "abandoned",
    footer: "Green is on target, red waited longest. Each line shows abandoned calls per {per}, on the same scale so rows compare.",
  },
};

export function AbandonedView() {
  return <FollowUpDashboard config={CONFIG} />;
}
