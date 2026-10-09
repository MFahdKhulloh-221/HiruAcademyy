import { Suspense } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { SupportingRoute } from "@/components/supporting-route";
export default function CommunityPage() { return <Suspense fallback={<main className="public-main"><LoadingSkeleton variant="list" /></main>}><SupportingRoute kind="community" /></Suspense>; }
