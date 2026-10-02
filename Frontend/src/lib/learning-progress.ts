"use client";

import { useEffect, useState } from "react";
import type { LearningActivityKey } from "@/lib/learning-mock";

const eventName = "hiru:learning-progress";

export const requiredChapterActivities: LearningActivityKey[] = ["video", "grammar", "kanji", "flashcards", "audio", "reading"];

function storageKey(level: string, chapter: string) {
  return `hiru:learning-progress:${level}:${chapter}`;
}

export function readChapterProgress(level: string, chapter: string) {
  if (typeof window === "undefined") return [] as LearningActivityKey[];
  try {
    return JSON.parse(localStorage.getItem(storageKey(level, chapter)) ?? "[]") as LearningActivityKey[];
  } catch {
    localStorage.removeItem(storageKey(level, chapter));
    return [] as LearningActivityKey[];
  }
}

export function completeChapterActivity(level: string, chapter: string, activity: LearningActivityKey) {
  const completed = new Set(readChapterProgress(level, chapter));
  completed.add(activity);
  localStorage.setItem(storageKey(level, chapter), JSON.stringify([...completed]));
  window.dispatchEvent(new CustomEvent(eventName));
}

export function useChapterProgress(level: string, chapter: string) {
  const [completed, setCompleted] = useState<LearningActivityKey[]>([]);
  useEffect(() => {
    const update = () => setCompleted(readChapterProgress(level, chapter));
    update();
    window.addEventListener(eventName, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(eventName, update);
      window.removeEventListener("storage", update);
    };
  }, [chapter, level]);
  return completed;
}
