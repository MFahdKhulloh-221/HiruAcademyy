import { Suspense } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { SupportingRoute } from "@/components/supporting-route";
export default function PracticePage() { return <Suspense fallback={<main className="public-main"><LoadingSkeleton variant="assessment" /></main>}><SupportingRoute kind="practice" /></Suspense>; }
