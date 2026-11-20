import type { Metadata } from "next";
import { SourcesView } from "@/components/views/sources";

export const metadata: Metadata = { title: "Lead sources" };

export default function Page() {
  return <SourcesView />;
}
