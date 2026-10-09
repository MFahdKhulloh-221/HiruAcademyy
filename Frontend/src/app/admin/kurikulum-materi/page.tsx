import { Suspense } from "react";
import { AdminShell } from "@/components/admin-shell";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { CurriculumBuilder } from "@/components/curriculum-builder";

export default function Page() {
  return (
    <Suspense fallback={<AdminShell current="/admin/kurikulum-materi"><main className="admin-page"><LoadingSkeleton variant="table" rows={5} label="Memuat Kurikulum &amp; Materi…" /></main></AdminShell>}>
      <CurriculumBuilder />
    </Suspense>
  );
}
