import type { Metadata } from "next";
import { LeadsView } from "@/components/views/leads";

export const metadata: Metadata = { title: "Leads" };

export default function Page() {
  return <LeadsView />;
}
