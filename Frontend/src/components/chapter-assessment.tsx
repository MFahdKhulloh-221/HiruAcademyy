"use client";

import { useCallback } from "react";
import { BackendAssessmentRunner } from "@/components/backend-assessment-runner";
import { loadChapterContext, useLearningRequest, type ChapterContext } from "@/components/learning-hooks";
import { chapterAttemptPath } from "@/lib/assessment-attempt";
import { MiniLockedDialog } from "@/components/mini-locked-dialog";
import { learningCatalog, learningChapters, programCode } from "@/lib/learning-api";
import { ApiError } from "@/lib/api";

export function ChapterAssessment({ level, chapterSlug, kind, context }: { level: string; chapterSlug: string; kind: "audio" | "reading" | "mini"; context?: ChapterContext }) {
  const load = useCallback(async (signal: AbortSignal) => {
    if (context) return context;
    if (kind === "mini") {
      const catalog = await learningCatalog(signal);
      const program = catalog.programs.find(item => item.code === programCode(level));
      if (!program || !/^chapter-[1-9]\d*$/.test(chapterSlug)) throw new ApiError(404);
      const chapters = await learningChapters(program.id, signal);
      const chapter = chapters.find(item => item.chapter_number === Number(chapterSlug.slice(8)));
      if (!chapter) throw new ApiError(404);
      if (!["full", "preview"].includes(chapter.access)) return { ...catalog, program, chapter, progress: undefined };
    }
    return loadChapterContext(level, chapterSlug, signal);
  }, [context, kind, level, chapterSlug]);
  const request = useLearningRequest(load, `${level}/${chapterSlug}/${kind}`);
  if (request.error) return <section className="learning-question-page"><p role="alert">{request.error}</p><button type="button" onClick={request.retry}>Coba Lagi</button></section>;
  if (!request.data) return <p role="status">Memuat…</p>;
  const { program, chapter, progress } = request.data;
  if (kind === "mini" && !progress?.mini_unlocked) return <section className="learning-question-page"><h1>Mini Checkpoint</h1><MiniLockedDialog access={chapter.access} progress={progress} chapterHref={`/learn/${level}/${chapterSlug}`} /></section>;
  return <BackendAssessmentRunner key={`${program.id}/${chapter.id}/${kind}`} path={chapterAttemptPath(program.id, chapter.id)} title={kind === "mini" ? "Mini Checkpoint" : kind === "audio" ? "Audio" : "Reading"} startBody={{ kind }} />;
}
