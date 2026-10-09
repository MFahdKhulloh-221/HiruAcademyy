import { Suspense } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { SupportingRoute } from "@/components/supporting-route";

export default function RenewalMembershipPage() {
  return (
    <Suspense fallback={<main className="public-main"><LoadingSkeleton variant="cards" /></main>}>
      <SupportingRoute kind="renewal" breadcrumbCurrent="Detail Membership" />
    </Suspense>
  );
}
