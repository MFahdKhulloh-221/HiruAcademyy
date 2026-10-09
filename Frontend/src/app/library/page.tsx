import { Suspense } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { LearningLibrary } from "@/components/learning-library";
export default function LibraryPage() { return <Suspense fallback={<main className="public-main"><LoadingSkeleton variant="list" /></main>}><LearningLibrary /></Suspense>; }
