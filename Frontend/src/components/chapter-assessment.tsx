"use client";

import { useCallback, useState } from "react";
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
  if (kind === "mini") return <MiniChapterAssessment key={`${program.id}/${chapter.id}`} programId={program.id} chapter={chapter} />;
  return <BackendAssessmentRunner key={`${program.id}/${chapter.id}/${kind}`} path={chapterAttemptPath(program.id, chapter.id)} title={kind === "audio" ? "Audio" : "Reading"} startBody={{ kind }} autoStart={autoStart} />;
}

function MiniChapterAssessment({ programId, chapter }: { programId: number; chapter: ChapterContext["chapter"] }) {
  const { user } = useAuth();
  const groups = chapter.mini_checkpoints ?? [];
  const [selection, setSelection] = useState(() => {
    const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
    return `${params.get("mini_session")}/${params.get("mini_part")}`;
  });
  const group = groups.find(item => `${item.session}/${item.part}` === selection) ?? groups[0];
  const scope = group ? `${user?.id}/${programId}/${chapter.id}/mini/${group.session}/${group.part}` : "";
  return <>
    <section className="learning-question-head">
      <label>Sesi / Part<select value={group ? `${group.session}/${group.part}` : ""} onChange={event => setSelection(event.target.value)}>
        {groups.map(item => <option key={`${item.session}/${item.part}`} value={`${item.session}/${item.part}`}>Sesi {item.session} • Part {item.part}</option>)}
      </select></label>
      {group && <p>{group.question_count} soal • {group.duration_minutes ?? "—"} Menit</p>}
    </section>
    {group?.configuration_valid ? <BackendAssessmentRunner key={scope} scope={scope} path={chapterAttemptPath(programId, chapter.id)} title="Mini Checkpoint" startBody={{ kind: "mini", session: group.session, part: group.part }} /> : <p role="status">OPEN: konfigurasi Mini Checkpoint.</p>}
  </>;
}
