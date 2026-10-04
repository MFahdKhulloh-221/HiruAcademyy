import type { Metadata } from "next";
import { Suspense } from "react";
import { LearningVertical } from "@/components/learning-vertical";

export const metadata: Metadata = { title: "Flashcard", description: "Sesi Flashcard HIRU Academy.", robots: { index: false, follow: false } };

export function generateStaticParams() {
  return ["dasar", "n5", "n4", "n3", "n2", "n1"].flatMap((level) => ["chapter-1", "chapter-2", "chapter-3", "chapter-4"].map((chapter) => ({ level, chapter })));
}

export default async function FlashcardPage({ params }: { params: Promise<{ level: string; chapter: string }> }) {
  const { level, chapter } = await params;
  return <Suspense><LearningVertical kind="flashcards" level={level} chapter={chapter} /></Suspense>;
}
