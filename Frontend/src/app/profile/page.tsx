import { Suspense } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { SupportingRoute } from "@/components/supporting-route";
export default function ProfilePage() { return <Suspense fallback={<main className="public-main"><LoadingSkeleton variant="profile" /></main>}><SupportingRoute kind="profile" /></Suspense>; }
