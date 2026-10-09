import { Suspense } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { SupportingRoute } from "@/components/supporting-route";
export default function ProgressPage() { return <Suspense fallback={<main className="public-main"><LoadingSkeleton variant="stats" /></main>}><SupportingRoute kind="progress" /></Suspense>; }
