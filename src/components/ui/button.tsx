import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] text-small font-medium transition-[background-color,color,border-color,box-shadow] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-ink text-on-ink hover:bg-ink/88",
        cool: "bg-cool text-white hover:bg-cool/90 dark:text-ground",
        outline: "border border-line-strong bg-panel text-ink hover:bg-subtle",
        ghost: "text-ink hover:bg-subtle",
        quiet: "text-muted-foreground hover:bg-subtle hover:text-ink",
        destructive: "bg-alarm text-white hover:bg-alarm/90 dark:text-ground",
        link: "h-auto px-0 text-cool underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4 sm:h-10",
        sm: "h-9 px-3 text-caption",
        lg: "h-12 px-5 text-body",
        icon: "size-11 sm:size-10",
        "icon-sm": "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
