import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "num h-11 w-full min-w-0 rounded-[var(--radius-control)] border border-input bg-panel px-3 text-body text-ink outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-cool focus-visible:ring-2 focus-visible:ring-cool/25 disabled:opacity-50 sm:h-10 sm:text-small",
        className,
      )}
      {...props}
    />
  );
}

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-20 w-full rounded-[var(--radius-control)] border border-input bg-panel px-3 py-2 text-body text-ink outline-none placeholder:text-muted-foreground focus-visible:border-cool focus-visible:ring-2 focus-visible:ring-cool/25 sm:text-small",
        className,
      )}
      {...props}
    />
  );
}

export { Input, Textarea };
