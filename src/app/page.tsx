import type { Metadata } from "next";
import { AbandonedView } from "@/components/views/abandoned";

export const metadata: Metadata = { title: "Abandoned calls" };

export default function Page() {
  return <AbandonedView />;
}
