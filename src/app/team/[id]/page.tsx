import type { Metadata } from "next";
import { CSR_IDS, CSRS } from "@/lib/data/mock/fixtures";
import { CsrProfileView } from "@/components/views/csr-profile";

export function generateStaticParams() {
  return CSR_IDS.map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps<"/team/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: CSRS.find((c) => c.id === id)?.name ?? "CSR" };
}

export default async function Page({ params }: PageProps<"/team/[id]">) {
  const { id } = await params;
  return <CsrProfileView id={id} />;
}
