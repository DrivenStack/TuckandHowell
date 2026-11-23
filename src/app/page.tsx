import type { Metadata } from "next";
import { StatsView } from "@/components/views/stats";

export const metadata: Metadata = { title: "Stats" };

export default function Page() {
  return <StatsView />;
}
