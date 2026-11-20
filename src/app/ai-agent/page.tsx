import type { Metadata } from "next";
import { AiAgentView } from "@/components/views/ai-agent";

export const metadata: Metadata = { title: "AI Voice Agent" };

export default function Page() {
  return <AiAgentView />;
}
