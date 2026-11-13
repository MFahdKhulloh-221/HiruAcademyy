import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CertificateDetailScreen } from "@/components/certificate-detail-screen";

export const metadata: Metadata = { title: "Detail Sertifikat", robots: { index: false, follow: false } };

export default async function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) notFound();
  return <CertificateDetailScreen achievementId={Number(id)} />;
}
