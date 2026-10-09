import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { LearningJourney } from "@/components/learning-journey";

export const metadata: Metadata = { title: "Pilih Level", description: "Pilih perjalanan belajar HIRU Academy.", robots: { index: false, follow: false } };

export default function LevelSelectionPage() {
  return <Suspense fallback={<main className="public-main"><LoadingSkeleton variant="cards" /></main>}><LearningJourney /></Suspense>;
}
