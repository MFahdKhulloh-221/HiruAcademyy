import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { CertificateDetailScreen } from "@/components/certificate-detail-screen";

export const metadata: Metadata = { title: "Detail Sertifikat", robots: { index: false, follow: false } };

export default function CertificateN5DetailPage() {
  return <Suspense fallback={<main className="public-main"><LoadingSkeleton variant="article" /></main>}><CertificateDetailScreen /></Suspense>;
}
