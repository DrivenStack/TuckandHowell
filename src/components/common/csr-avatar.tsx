import { cn } from "@/lib/utils";
import type { Csr } from "@/lib/types";

const SIZES = {
  xs: "size-5 text-[0.5625rem]",
  sm: "size-7 text-[0.6875rem]",
  md: "size-9 text-caption",
  lg: "size-14 text-section",
};

/** Avatar from initials, on the CSR's fixed tone. */
export function CsrAvatar({
  csr,
  size = "md",
  className,
  ring,
}: {
  csr: Pick<Csr, "initials" | "avatarTone" | "name">;
  size?: keyof typeof SIZES;
  className?: string;
  ring?: boolean;
}) {
  return (
    <span
      role="img"
      aria-label={csr.name}
      title={csr.name}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white",
        ring && "ring-2 ring-panel",
        SIZES[size],
        className,
      )}
      style={{ backgroundColor: csr.avatarTone }}
    >
      {csr.initials}
    </span>
  );
}
