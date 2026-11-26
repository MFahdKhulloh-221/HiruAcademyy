"use client";

import { useCallback } from "react";
import "./reading-layout.css";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { useAuth } from "@/components/auth-provider";
import { BackendAssessmentRunner } from "@/components/backend-assessment-runner";
import { loadChapterContext, useLearningRequest, type ChapterContext, type LearningCatalog } from "@/components/learning-hooks";
import { chapterAttemptPath } from "@/lib/assessment-attempt";
import { MiniLockedDialog } from "@/components/mini-locked-dialog";
import { learningCatalog, learningChapter, learningChapters, learningProgress, programCode } from "@/lib/learning-api";
import { ApiError } from "@/lib/api";

export function ChapterAssessment({ level, chapterSlug, kind, context, resolvedCatalog, autoStart = false }: { level: string; chapterSlug: string; kind: "audio" | "reading" | "mini"; context?: ChapterContext; resolvedCatalog?: LearningCatalog; autoStart?: boolean }) {
  const load = useCallback(async (signal: AbortSignal) => {
    if (context) return context;
    if (kind === "mini") {
      const catalog = resolvedCatalog ?? await learningCatalog(signal);
      const program = catalog.programs.find(item => item.code === programCode(level));
      if (!program || !/^chapter-[1-9]\d*$/.test(chapterSlug)) throw new ApiError(404);
      const chapters = await learningChapters(program.id, signal);
      const chapter = chapters.find(item => item.chapter_number === Number(chapterSlug.slice(8)));
      if (!chapter) throw new ApiError(404);
      if (!["full", "preview"].includes(chapter.access)) return { ...catalog, program, chapter, progress: undefined };
      const [detail, progress] = await Promise.all([learningChapter(program.id, chapter.id, signal), learningProgress(program.id, chapter.id, signal)]);
      return { ...catalog, program, chapter: detail, progress };
    }
    return loadChapterContext(level, chapterSlug, signal);
  }, [context, resolvedCatalog, kind, level, chapterSlug]);
  const request = useLearningRequest(load, `${level}/${chapterSlug}/${kind}`);
  if (request.error) return <section className="learning-question-page"><p role="alert">{request.error}</p><button type="button" onClick={request.retry}>Coba Lagi</button></section>;
  if (!request.data) return <LoadingSkeleton variant="assessment" label="Memuat…" />;
  const { program, chapter, progress } = request.data;
  if (kind === "mini" && (!["n5", "n4", "n3", "n2"].includes(program.code) || progress?.mini_eligible === false || !progress?.mini_unlocked)) return <section className="learning-question-page"><h1>Mini Checkpoint</h1><MiniLockedDialog access={chapter.access} progress={progress} chapterHref={`/learn/${level}/${chapterSlug}`} /></section>;
  if (kind === "mini") return <MiniChapterAssessment key={`${program.id}/${chapter.id}`} programId={program.id} chapter={chapter} level={program.name} chapterHref={`/learn/${level}/${chapterSlug}`} />;
  return <>
    <BackendAssessmentRunner key={`${program.id}/${chapter.id}/${kind}`} path={chapterAttemptPath(program.id, chapter.id)} title={kind === "audio" ? "Audio" : "Reading"} className={kind === "reading" ? "learning-question-page reading-assessment" : undefined} startBody={{ kind }} autoStart={autoStart} readingContext={kind === "reading" ? { label: `${program.name} · ${chapter.title}`, href: `/learn/${level}/${chapterSlug}` } : undefined} />
  </>;
}

function MiniChapterAssessment({ programId, chapter, chapterHref, level }: { programId: number; chapter: ChapterContext["chapter"]; chapterHref: string; level: string }) {
  const { user } = useAuth();
  const group = chapter.mini_checkpoints?.find(item => item.session === 1 && item.part === 1);
  const scope = `${user?.id}/${programId}/${chapter.id}/mini/1/1`;
  return <BackendAssessmentRunner key={scope} scope={scope} path={chapterAttemptPath(programId, chapter.id)} title="Mini Checkpoint" startBody={{ kind: "mini", session: 1, part: 1 }} miniContext={{ level, chapter: chapter.chapter_number, chapterTitle: chapter.title, ready: group?.configuration_valid === true, questionCount: group?.question_count ?? 0, durationMinutes: group?.duration_minutes ?? null, passingScore: group?.passing_score ?? null, href: chapterHref }} />;
}
