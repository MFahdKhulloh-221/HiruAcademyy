import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { SupportingRoute } from "@/components/supporting-route";

export const metadata: Metadata = { title: "Certificate Center", robots: { index: false, follow: false } };

export default function CertificatePage() {
  return <Suspense fallback={<main className="public-main"><LoadingSkeleton variant="cards" /></main>}><SupportingRoute kind="certificate" /></Suspense>;
}
