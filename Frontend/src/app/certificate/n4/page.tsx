import { Suspense } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { CertificateUnavailableScreen } from "@/components/certificate-unavailable-screen";

export default function CertificateN4Page() {
  return <Suspense fallback={<main className="public-main"><LoadingSkeleton variant="article" /></main>}><CertificateUnavailableScreen level="N4" /></Suspense>;
}
