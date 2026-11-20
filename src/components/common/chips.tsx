import { AlertOctagon, ArrowUpCircle, Bot, Circle, Crown, PhoneMissed, PhoneOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CallbackTrigger, Priority } from "@/lib/types";

export type Tone = "neutral" | "cool" | "warm" | "alarm" | "success";

const TONES: Record<Tone, string> = {
  neutral: "bg-subtle text-ink",
  cool: "bg-cool-tint text-cool",
  warm: "bg-warm-tint text-warm-text",
  alarm: "bg-alarm-tint text-alarm",
  success: "bg-success-tint text-success",
};

export function Chip({
  tone = "neutral",
  className,
  children,
  icon: Icon,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-caption font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
      {children}
    </span>
  );
}

const PRIORITY: Record<Priority, { tone: Tone; icon: typeof Circle }> = {
  Urgent: { tone: "alarm", icon: AlertOctagon },
  High: { tone: "warm", icon: ArrowUpCircle },
  Normal: { tone: "neutral", icon: Circle },
};

/** Priority is always a word plus an icon, never a score or color alone. */
export function PriorityLabel({ priority, className }: { priority: Priority; className?: string }) {
  const p = PRIORITY[priority];
  return (
    <Chip tone={p.tone} icon={p.icon} className={className}>
      {priority}
    </Chip>
  );
}

export function VipBadge({ className }: { className?: string }) {
  return (
    <Chip tone="cool" icon={Crown} className={className}>
      VIP
    </Chip>
  );
}

const TRIGGER: Record<CallbackTrigger, { label: string; icon: typeof Bot }> = {
  missed: { label: "CSR missed", icon: PhoneMissed },
  abandoned: { label: "Hung up waiting", icon: PhoneOff },
  ai_agent: { label: "AI Voice Agent", icon: Bot },
};

export const TRIGGER_LABELS: Record<CallbackTrigger, string> = {
  missed: "CSR missed",
  abandoned: "Abandoned",
  ai_agent: "AI Voice Agent",
};

export function TriggerLabel({ trigger, className }: { trigger: CallbackTrigger; className?: string }) {
  const t = TRIGGER[trigger];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-small text-muted-foreground", className)}>
      <t.icon className="size-3.5" aria-hidden />
      {t.label}
    </span>
  );
}

/** Wait time colored by how long: calm under 5 min, attention to 15, urgent beyond. */
export function waitTone(minutes: number, alertAfter = 15): Tone {
  if (minutes >= alertAfter) return "alarm";
  if (minutes >= 5) return "warm";
  return "cool";
}
