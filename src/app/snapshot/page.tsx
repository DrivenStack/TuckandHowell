import type { Metadata } from "next";
import { SnapshotView } from "@/components/views/snapshot";

export const metadata: Metadata = { title: "Owner snapshot" };

export default function Page() {
  return <SnapshotView />;
}
