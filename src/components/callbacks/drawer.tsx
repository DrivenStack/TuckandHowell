"use client";

import {
  Bot,
  CalendarCheck,
  CircleSlash,
  Clock,
  Hand,
  MessageSquare,
  PhoneCall,
  PhoneIncoming,
  PhoneMissed,
  PhoneOff,
  RotateCcw,
  Timer,
  type LucideIcon,
} from "lucide-react";
import { LIST_LABELS, timeToCallback } from "@/lib/callbacks/engine";
import { fmtUsd } from "@/lib/metrics/calculations";
import { fmt, fmtDateTime, fmtDuration, fmtStamp, fmtStampInline } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Callback, TimelineEventKind } from "@/lib/types";
import { useDataStore } from "@/store/data";
import { useCsrs, useCustomers } from "@/components/app/hooks";
import { Chip, PriorityLabel, TriggerLabel, VipBadge } from "@/components/common/chips";
import { CsrAvatar } from "@/components/common/csr-avatar";
import { SourceNote } from "@/components/common/page";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/overlays";
import { CallButton, ClaimControl, MarkBookedButton, OutcomeMenu } from "./actions";

const EVENT_ICON: Record<TimelineEventKind, { icon: LucideIcon; tone: string }> = {
  missed_call: { icon: PhoneMissed, tone: "text-alarm bg-alarm-tint" },
  ai_summary: { icon: Bot, tone: "text-cool bg-cool-tint" },
  claimed: { icon: Hand, tone: "text-ink bg-subtle" },
  claim_expired: { icon: Clock, tone: "text-warm-text bg-warm-tint" },
  released: { icon: Hand, tone: "text-muted-foreground bg-subtle" },
  attempt: { icon: PhoneOff, tone: "text-warm-text bg-warm-tint" },
  spoke: { icon: PhoneCall, tone: "text-cool bg-cool-tint" },
  text: { icon: MessageSquare, tone: "text-ink bg-subtle" },
  called_in: { icon: PhoneIncoming, tone: "text-cool bg-cool-tint" },
  back_to_needs: { icon: RotateCcw, tone: "text-warm-text bg-warm-tint" },
  booked: { icon: CalendarCheck, tone: "text-success bg-success-tint" },
  closed: { icon: CircleSlash, tone: "text-muted-foreground bg-subtle" },
};

export const LIST_TONE = {
  needs_callback: "alarm",
  attempted: "warm",
  called_back: "cool",
  booked: "success",
  closed: "neutral",
} as const;

export function CallbackDrawer({ cb, onOpenChange }: { cb: Callback | null; onOpenChange: (open: boolean) => void }) {
  const customers = useCustomers();
  const csrs = useCsrs();
  const data = useDataStore((s) => s.data);
  const now = useDataStore((s) => s.now);
  const customer = cb ? customers.get(cb.customerId) : undefined;
  const job = cb?.jobId ? data?.jobs.find((j) => j.id === cb.jobId) : undefined;
  const campaign = cb ? data?.campaigns.find((c) => c.id === cb.campaignId) : undefined;
  const handler = cb?.resolvedByCsrId ? csrs.get(cb.resolvedByCsrId) : undefined;
  const ttc = cb ? timeToCallback(cb) : null;
  const open = cb !== null && customer !== undefined;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" aria-describedby={undefined}>
        {cb && customer ? (
          <div className="flex h-full flex-col">
            <div className="border-b border-line px-5 pt-5 pb-4 pr-16">
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={LIST_TONE[cb.list]}>{LIST_LABELS[cb.list]}</Chip>
                {cb.list === "needs_callback" || cb.list === "attempted" ? <PriorityLabel priority={cb.priority} /> : null}
                {customer.isVip ? <VipBadge /> : null}
              </div>
              <SheetTitle className="mt-3 text-[1.375rem] leading-7 tracking-[-0.01em]">{customer.name}</SheetTitle>
              <SheetDescription className="mt-1">
                {cb.jobType} in {customer.city}, {customer.state}. First call {fmtStampInline(cb.firstMissedAt, now)}.
              </SheetDescription>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {cb.list === "needs_callback" || cb.list === "attempted" ? (
                  <>
                    <CallButton cb={cb} customer={customer} />
                    <ClaimControl cb={cb} />
                    <OutcomeMenu cb={cb} />
                  </>
                ) : cb.list === "called_back" ? (
                  <MarkBookedButton cb={cb} />
                ) : null}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-small">
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Phone numbers</dt>
                  <dd className="mt-1 space-y-1">
                    {customer.phones.map((p, i) => (
                      <p key={p} className="num flex items-center gap-2 text-body font-medium">
                        {p}
                        <span className="text-caption font-normal text-muted-foreground">{i === 0 ? "Main" : "Second number"}</span>
                      </p>
                    ))}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Membership</dt>
                  <dd className="mt-1">{customer.isVip && customer.membershipSince ? `VIP since ${fmt(customer.membershipSince, "MMM yyyy")}` : "Not a member"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Address</dt>
                  <dd className="mt-1">
                    {customer.address}, {customer.city}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Came in as</dt>
                  <dd className="mt-1">
                    <TriggerLabel trigger={cb.trigger} className="text-ink" />
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Calls from customer</dt>
                  <dd className="num mt-1">{cb.missedCount}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Attempts</dt>
                  <dd className="num mt-1">{cb.attempts}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Marketing source</dt>
                  <dd className="mt-1">{campaign?.name ?? "Unknown"}</dd>
                </div>
                {cb.list === "needs_callback" || cb.list === "attempted" ? (
                  <div className="col-span-2">
                    <dt className="text-muted-foreground">Waiting</dt>
                    <dd className="num mt-1 text-body font-medium">{fmtDuration(now - cb.firstMissedAt)}</dd>
                    {cb.priorityReasons.length ? (
                      <dd className="mt-1 text-caption text-muted-foreground">Priority because: {cb.priorityReasons.join(", ").toLowerCase()}.</dd>
                    ) : null}
                  </div>
                ) : (
                  <div className="col-span-2 flex items-center gap-3 rounded-[12px] bg-subtle p-3">
                    {handler ? <CsrAvatar csr={handler} /> : <Timer className="size-5 text-muted-foreground" aria-hidden />}
                    <div>
                      <dt className="sr-only">Handled</dt>
                      <dd>
                        {handler ? `Handled by ${handler.name}` : cb.closeReason ?? "Closed"}
                        {cb.resolvedAt ? `, ${fmtStampInline(cb.resolvedAt, now)}` : ""}
                      </dd>
                      <dd className="text-caption text-muted-foreground">
                        {ttc !== null ? `Called back ${fmtDuration(ttc)} after the first missed call` : "No call attempt was made"}
                      </dd>
                    </div>
                  </div>
                )}
              </dl>

              {cb.claim ? (
                <p className="mt-4 flex items-center gap-2 text-small text-muted-foreground">
                  <Hand className="size-4" aria-hidden />
                  Claimed by {csrs.get(cb.claim.csrId)?.name}, expires at {fmt(cb.claim.expiresAt, "h:mm aaa")}
                </p>
              ) : null}

              {job ? (
                <div className="mt-6 rounded-[14px] border border-line p-4">
                  <p className="flex items-center gap-2 text-small font-medium">
                    <CalendarCheck className="size-4 text-success" aria-hidden />
                    Booked job
                  </p>
                  <div className="mt-2 flex items-baseline justify-between gap-4">
                    <p className="text-body">{job.jobType}</p>
                    <p className="num text-section font-semibold">{fmtUsd(job.amount)}</p>
                  </div>
                  <p className="mt-1 text-caption text-muted-foreground">
                    {job.status === "Booked" ? `Scheduled ${fmtDateTime(job.scheduledFor)}` : `${job.status}`}
                    {job.isReplacement ? ". Replacement opportunity" : ""}
                  </p>
                </div>
              ) : null}

              <h3 className="mt-7 mb-3 text-small font-semibold">Timeline</h3>
              <ol className="relative">
                {cb.events.map((e, i) => {
                  const meta = EVENT_ICON[e.kind];
                  const actor = e.csrId ? csrs.get(e.csrId) : undefined;
                  return (
                    <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
                      {i < cb.events.length - 1 ? <span className="absolute top-8 bottom-1 left-[13px] w-px bg-line" aria-hidden /> : null}
                      <span className={cn("relative flex size-7 shrink-0 items-center justify-center rounded-full", meta.tone)}>
                        <meta.icon className="size-3.5" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <p className="text-small font-medium">{e.title}</p>
                          <time className="num text-caption text-muted-foreground">{fmtStamp(e.at, now)}</time>
                        </div>
                        {e.detail ? (
                          <p className={cn("mt-0.5 text-small text-muted-foreground", e.kind === "ai_summary" && "rounded-[10px] bg-subtle px-3 py-2 text-ink")}>
                            {e.detail}
                          </p>
                        ) : null}
                        {actor && e.kind !== "ai_summary" ? <span className="sr-only">By {actor.name}</span> : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
              <SourceNote source={cb.trigger === "ai_agent" ? "ServiceTitan and the AI Voice Agent (Broccoli)" : "ServiceTitan and Dialpad"} className="mt-6" />
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
