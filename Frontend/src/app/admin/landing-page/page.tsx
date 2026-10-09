import { Suspense } from "react";
import { AdminShell } from "@/components/admin-shell";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { LandingPageStudio } from "@/components/website-content-studio";

export default function Page() {
  return (
    <Suspense fallback={<AdminShell current="/admin/landing-page"><main className="admin-page"><LoadingSkeleton variant="form" label="Memuat CMS Landing Page…" /></main></AdminShell>}>
      <LandingPageStudio />
    </Suspense>
  );
}
