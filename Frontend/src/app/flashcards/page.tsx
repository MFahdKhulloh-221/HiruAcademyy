import { Suspense } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { FlashcardCollection } from "@/components/flashcard-collection";

export default function FlashcardsPage() { return <Suspense fallback={<main className="public-main"><LoadingSkeleton variant="cards" /></main>}><FlashcardCollection /></Suspense>; }
