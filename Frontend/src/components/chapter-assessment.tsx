"use client";

import { useCallback } from "react";
import { BackendAssessmentRunner } from "@/components/backend-assessment-runner";
import { loadChapterContext, useLearningRequest, type ChapterContext } from "@/components/learning-hooks";
import { chapterAttemptPath } from "@/lib/assessment-attempt";

export function ChapterAssessment({ level, chapterSlug, kind, context }: { level: string; chapterSlug: string; kind: "audio" | "reading" | "mini"; context?: ChapterContext }) {
  const load = useCallback((signal: AbortSignal) => context ? Promise.resolve(context) : loadChapterContext(level, chapterSlug, signal), [context, level, chapterSlug]);
  const request = useLearningRequest(load, `${level}/${chapterSlug}/${kind}`);
  if (request.error) return <section className="learning-question-page"><p role="alert">{request.error}</p><button type="button" onClick={request.retry}>Coba Lagi</button></section>;
  if (!request.data) return <p role="status">Memuat…</p>;
  const { program, chapter, progress } = request.data;
  if (kind === "mini" && !progress.mini_unlocked) return <section className="learning-question-page"><h1>Mini Checkpoint</h1><span>LOCKED</span></section>;
  return <BackendAssessmentRunner key={`${program.id}/${chapter.id}/${kind}`} path={chapterAttemptPath(program.id, chapter.id)} title={kind === "mini" ? "Mini Checkpoint" : kind === "audio" ? "Audio" : "Reading"} startBody={{ kind }} />;
}
