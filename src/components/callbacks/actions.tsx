"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Ban, CalendarCheck, Copy, Hand, MessageSquareOff, MoreHorizontal, Phone, PhoneCall, PhoneOff, ShieldX, Unlock, Voicemail } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDurationShort } from "@/lib/time";
import type { Callback, Customer, ManualOutcome } from "@/lib/types";
import { useAppStore } from "@/store/app";
import { useDataStore } from "@/store/data";
import { useCsrs } from "@/components/app/hooks";
import { CsrAvatar } from "@/components/common/csr-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/overlays";

export const OUTCOMES: { value: ManualOutcome; label: string; done: string; icon: typeof Phone; final?: boolean }[] = [
  { value: "spoke", label: "Spoke to customer", done: "Marked as spoke to customer", icon: PhoneCall },
  { value: "no_answer", label: "No answer", done: "Marked as no answer", icon: PhoneOff },
  { value: "voicemail", label: "Left voicemail", done: "Marked as left voicemail", icon: Voicemail },
  { value: "booked", label: "Mark as booked", done: "Marked as booked", icon: CalendarCheck },
  { value: "not_interested", label: "Not interested", done: "Closed: not interested", icon: MessageSquareOff, final: true },
  { value: "wrong_number", label: "Wrong number", done: "Closed: wrong number", icon: Ban, final: true },
  { value: "spam", label: "Spam", done: "Closed: spam", icon: ShieldX, final: true },
  { value: "duplicate", label: "Duplicate", done: "Closed: duplicate", icon: Copy, final: true },
];

export function useCallbackActions() {
  const csrId = useAppStore((s) => s.csrId);
  const claim = useDataStore((s) => s.claim);
  const release = useDataStore((s) => s.release);
  const record = useDataStore((s) => s.recordOutcome);
  return {
    csrId,
    claim: (cb: Callback) => {
      claim(cb.id, csrId);
      toast("Callback claimed");
    },
    release: (cb: Callback) => {
      release(cb.id, csrId);
      toast("Callback released");
    },
    mark: (cb: Callback, outcome: ManualOutcome) => {
      record(cb.id, outcome, csrId);
      const o = OUTCOMES.find((x) => x.value === outcome);
      if (outcome === "booked") toast.success(o?.done ?? "Done");
      else toast(o?.done ?? "Done");
    },
  };
}

/** Claim, released, or claimed by someone else with time left. */
export function ClaimControl({ cb, compact }: { cb: Callback; compact?: boolean }) {
  const { csrId, claim, release } = useCallbackActions();
  const csrs = useCsrs();
  const now = useDataStore((s) => s.now);
  if (cb.list !== "needs_callback") return null;
  if (cb.claim) {
    const owner = csrs.get(cb.claim.csrId);
    const left = fmtDurationShort(Math.max(0, cb.claim.expiresAt - now));
    if (cb.claim.csrId === csrId) {
      return (
        <Button variant="outline" size={compact ? "sm" : "default"} onClick={() => release(cb)} aria-label="Release callback">
          <Unlock aria-hidden />
          Release
          <span className="num text-muted-foreground">{left}</span>
        </Button>
      );
    }
    return (
      <span className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-subtle px-2.5 text-caption text-muted-foreground">
        {owner ? <CsrAvatar csr={owner} size="xs" /> : null}
        <span>
          Claimed by {owner?.firstName ?? "a CSR"}, <span className="num">{left}</span> left
        </span>
      </span>
    );
  }
  return (
    <Button variant="outline" size={compact ? "sm" : "default"} onClick={() => claim(cb)}>
      <Hand aria-hidden />
      Claim callback
    </Button>
  );
}

/** Mock call: confirm the number, then record how it went. */
export function CallButton({
  cb,
  customer,
  compact,
  variant = "default",
  className,
}: {
  cb: Callback;
  customer: Customer;
  compact?: boolean;
  variant?: "default" | "outline";
  className?: string;
}) {
  const { mark } = useCallbackActions();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"confirm" | "outcome">("confirm");
  const [phone, setPhone] = useState(customer.phones[0]);
  const csrs = useCsrs();
  const actor = csrs.get(useAppStore.getState().csrId);
  const blocked = cb.claim && cb.claim.csrId !== useAppStore.getState().csrId;

  return (
    <>
      <Button
        variant={variant}
        size={compact ? "sm" : "default"}
        className={className}
        onClick={() => {
          setStep("confirm");
          setPhone(customer.phones[0]);
          setOpen(true);
        }}
      >
        <Phone aria-hidden />
        Call
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          {step === "confirm" ? (
            <>
              <div>
                <DialogTitle>Call {customer.name}?</DialogTitle>
                <DialogDescription className="mt-1">
                  {actor ? `Calls from your Dialpad line as ${actor.name}. ` : ""}This is a demo, no real call is made.
                  {blocked ? " Someone else has claimed this callback." : ""}
                </DialogDescription>
              </div>
              <fieldset className="grid gap-2">
                <legend className="mb-2 text-small text-muted-foreground">Number to call</legend>
                {customer.phones.map((p) => (
                  <label
                    key={p}
                    className={cn(
                      "flex h-12 cursor-pointer items-center gap-3 rounded-[12px] border px-3 text-body",
                      phone === p ? "border-cool bg-cool-tint" : "border-line hover:bg-subtle",
                    )}
                  >
                    <input type="radio" name="phone" value={p} checked={phone === p} onChange={() => setPhone(p)} className="accent-[var(--cool)]" />
                    <span className="num font-medium">{p}</span>
                    <span className="ml-auto text-caption text-muted-foreground">{p === customer.phones[0] ? "Main" : "Second number"}</span>
                  </label>
                ))}
              </fieldset>
              <Button size="lg" onClick={() => setStep("outcome")}>
                <Phone aria-hidden />
                Start call
              </Button>
            </>
          ) : (
            <>
              <div>
                <DialogTitle>How did the call go?</DialogTitle>
                <DialogDescription className="mt-1">
                  Calling <span className="num">{phone}</span>. Your choice moves {customer.firstName} to the right list.
                </DialogDescription>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {OUTCOMES.slice(0, 6).map((o) => (
                  <Button
                    key={o.value}
                    variant={o.value === "booked" ? "cool" : "outline"}
                    className="h-12 justify-start sm:h-11"
                    onClick={() => {
                      mark(cb, o.value);
                      setOpen(false);
                    }}
                  >
                    <o.icon aria-hidden />
                    {o.label}
                  </Button>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function OutcomeMenu({ cb, compact }: { cb: Callback; compact?: boolean }) {
  const { mark } = useCallbackActions();
  const open = cb.list === "needs_callback" || cb.list === "attempted";
  const outcomes = open ? OUTCOMES : OUTCOMES.filter((o) => o.value === "booked");
  if (cb.list === "booked" || cb.list === "closed") return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size={compact ? "icon-sm" : "icon"} aria-label="Mark outcome">
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Mark outcome</DropdownMenuLabel>
        {outcomes.map((o, i) => (
          <div key={o.value}>
            {o.final && !outcomes[i - 1]?.final ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem onSelect={() => mark(cb, o.value)}>
              <o.icon aria-hidden className="text-muted-foreground" />
              {o.label}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function MarkBookedButton({ cb }: { cb: Callback }) {
  const { mark } = useCallbackActions();
  return (
    <Button variant="outline" onClick={() => mark(cb, "booked")}>
      <CalendarCheck aria-hidden />
      Mark as booked
    </Button>
  );
}
