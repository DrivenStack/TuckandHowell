"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-right"
      offset={{ bottom: 24, right: 24 }}
      mobileOffset={{ bottom: 92, left: 16, right: 16 }}
      visibleToasts={3}
      duration={4500}
      toastOptions={{
        unstyled: false,
        classNames: {
          toast:
            "!rounded-[14px] !border !border-line !bg-panel !text-ink !shadow-float !font-sans !text-small !gap-2.5 !py-3 !px-4",
          success: "[&_[data-icon]]:!text-success",
          description: "!text-muted-foreground",
        },
      }}
      {...props}
    />
  );
}
