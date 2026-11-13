"use client";

import { CertificateDetailScreen } from "@/components/certificate-detail-screen";

export function CertificateUnavailableScreen({ level }: { level: string }) {
  return <CertificateDetailScreen level={level.toLowerCase()} />;
}
