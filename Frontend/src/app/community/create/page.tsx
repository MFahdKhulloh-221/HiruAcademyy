import { Suspense } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { SupportingRoute } from "@/components/supporting-route";
export default function CreatePostPage() { return <Suspense fallback={<main className="public-main"><LoadingSkeleton variant="form" /></main>}><SupportingRoute kind="createPost" /></Suspense>; }
