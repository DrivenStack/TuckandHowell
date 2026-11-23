import type { Metadata } from "next";
import { BroccoliView } from "@/components/views/broccoli";

export const metadata: Metadata = { title: "Broccoli calls" };

export default function Page() {
  return <BroccoliView />;
}
