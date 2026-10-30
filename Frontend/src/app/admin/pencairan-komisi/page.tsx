import { Suspense } from "react";
import { AdminShell } from "@/components/admin-shell";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { AffiliateOperations } from "@/components/business-operations";

export default function Page() {
  return (
    <Suspense fallback={<AdminShell current="/admin/pencairan-komisi"><main className="admin-page"><LoadingSkeleton variant="table" rows={5} label="Memuat Referral & Kredit Diskon…" /></main></AdminShell>}>
      <AffiliateOperations initialTab="Pencairan" />
    </Suspense>
  );
}
