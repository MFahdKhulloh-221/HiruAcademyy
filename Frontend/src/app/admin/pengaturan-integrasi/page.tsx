import { Suspense } from "react";
import { AdminShell } from "@/components/admin-shell";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { AdminSettingsWorkspace } from "@/components/admin-settings-workspace";

export default function Page() {
  return (
    <Suspense fallback={<AdminShell current="/admin/pengaturan-integrasi"><main className="admin-page"><LoadingSkeleton variant="form" label="Memuat Pengaturan &amp; Integrasi…" /></main></AdminShell>}>
      <AdminSettingsWorkspace />
    </Suspense>
  );
}
