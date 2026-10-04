"use client";

import { useCallback } from "react";
import type { LearningActivityKey } from "@/lib/learning-mock";
import { loadChapterContext, useLearningRequest } from "@/components/learning-hooks";
import { learningCompletion } from "@/lib/learning-api";

export const requiredChapterActivities: LearningActivityKey[] = [];

export function readChapterProgress(level: string, chapter: string): LearningActivityKey[] {
  void level;
  void chapter;
  return [];
}

export async function completeChapterActivity(level: string, chapter: string, activity: LearningActivityKey) {
  const context = await loadChapterContext(level, chapter);
  if (activity === "flashcards") return learningCompletion(context.program.id, context.chapter.id, "flashcard");
  throw new Error("Canonical resource ID required. Use learningCompletion.");
}

export function useChapterProgress(level: string, chapter: string) {
  const load = useCallback((signal: AbortSignal) => loadChapterContext(level, chapter, signal), [level, chapter]);
  const request = useLearningRequest(load, `progress/${level}/${chapter}`);
  const activities = request.data?.progress.activities;
  const completed: LearningActivityKey[] = [];
  if (activities?.video?.complete) completed.push("video");
  if (activities?.module?.complete) completed.push("grammar", "kanji");
  if (activities?.flashcard?.complete) completed.push("flashcards");
  if (activities?.audio?.complete) completed.push("audio");
  if (activities?.reading?.complete) completed.push("reading");
  return completed;
}
