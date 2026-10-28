import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { CurriculumBuilder } from "@/components/curriculum-builder";

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  if ((await searchParams).tab === "Replay Rekaman") redirect("/admin/replay-rekaman");
  return (
    <Suspense fallback={<AdminShell current="/admin/kurikulum-materi"><main className="admin-page"><LoadingSkeleton variant="table" rows={5} label="Memuat Kurikulum &amp; Materi…" /></main></AdminShell>}>
      <CurriculumBuilder />
    </Suspense>
  );
}
