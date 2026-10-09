import { Suspense } from "react";
import { AdminShell } from "@/components/admin-shell";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { AssessmentTypeSelector } from "@/components/assessment-builder";

export default function Page() {
  return (
    <Suspense fallback={<AdminShell current="/admin/bank-soal"><main className="admin-page"><LoadingSkeleton variant="form" label="Memuat editor…" /></main></AdminShell>}>
      <AssessmentTypeSelector />
    </Suspense>
  );
}
