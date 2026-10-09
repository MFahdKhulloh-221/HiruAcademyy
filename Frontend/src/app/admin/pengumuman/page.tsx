import { Suspense } from "react";
import { AdminShell } from "@/components/admin-shell";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { AnnouncementStudio } from "@/components/website-content-studio";

export default function Page() {
  return (
    <Suspense fallback={<AdminShell current="/admin/pengumuman"><main className="admin-page"><LoadingSkeleton variant="form" label="Memuat CMS Pengumuman…" /></main></AdminShell>}>
      <AnnouncementStudio />
    </Suspense>
  );
}
