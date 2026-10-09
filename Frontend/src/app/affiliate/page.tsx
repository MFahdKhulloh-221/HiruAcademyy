import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { SupportingRoute } from "@/components/supporting-route";

export const metadata: Metadata = {
  title: "Program Afiliasi & Referral",
  description: "Bagikan kode referral HIRU Academy dan dapatkan reward belajar.",
  robots: { index: false, follow: false },
};

export default function AffiliatePage() {
  return (
    <Suspense fallback={<main className="public-main"><LoadingSkeleton variant="stats" /></main>}>
      <SupportingRoute kind="affiliate" />
    </Suspense>
  );
}
