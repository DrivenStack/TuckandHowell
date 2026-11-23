import type { Metadata } from "next";
import { CallbacksView } from "@/components/views/callbacks";

export const metadata: Metadata = { title: "Callbacks" };

export default function Page() {
  return <CallbacksView />;
}
