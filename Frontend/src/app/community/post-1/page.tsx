import { Suspense } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { CommunityPostScreen } from "@/components/community-post-screen";

export default function CommunityPostPage() {
  return <Suspense fallback={<main className="public-main"><LoadingSkeleton variant="article" /></main>}><CommunityPostScreen /></Suspense>;
}
