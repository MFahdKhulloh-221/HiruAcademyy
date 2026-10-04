"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ApiError } from "@/lib/api";
import { learningCatalog, learningChapter, learningChapters, learningProgress, programCode, type CanonicalChapter, type ChapterProgress, type LearningAccess, type LearningProgram } from "@/lib/learning-api";

export function useLearningRequest<T>(load: (signal: AbortSignal) => Promise<T>, key: string) {
  const { user, loading: authLoading } = useAuth();
  const identity = user?.id;
  const [state, setState] = useState<{ key: string; identity: typeof identity; data?: T; error?: string }>({ key: "", identity: undefined });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (authLoading || !identity) return;
    const controller = new AbortController();
    load(controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ key, identity, data });
    }).catch(cause => {
      if (!controller.signal.aborted) setState({ key, identity, error: cause instanceof ApiError ? cause.message : "Permintaan belum berhasil. Silakan coba lagi." });
    });
    return () => controller.abort();
  }, [authLoading, identity, key, load, revision]);
  const current = state.key === key && state.identity === identity && !authLoading && identity ? state : undefined;
  return { data: current?.data, error: current?.error, loading: !current, retry: () => { setState({ key: "", identity: undefined }); setRevision(value => value + 1); } };
}

export type LearningCatalog = { programs: LearningProgram[]; access: LearningAccess };
export function useLearningCatalog() { return useLearningRequest(learningCatalog, "catalog"); }
export type ChapterContext = LearningCatalog & { program: LearningProgram; chapter: CanonicalChapter; progress: ChapterProgress };
export async function loadChapterContext(level: string, chapterSlug: string, signal?: AbortSignal): Promise<ChapterContext> {
  const catalog = await learningCatalog(signal);
  const program = catalog.programs.find(item => item.code === programCode(level));
  if (!program || !/^chapter-[1-9]\d*$/.test(chapterSlug)) throw new ApiError(404);
  const chapters = await learningChapters(program.id, signal);
  const chapter = chapters.find(item => item.chapter_number === Number(chapterSlug.slice(8)));
  if (!chapter) throw new ApiError(404);
  const [detail, progress] = await Promise.all([learningChapter(program.id, chapter.id, signal), learningProgress(program.id, chapter.id, signal)]);
  return { ...catalog, program, chapter: detail, progress };
}
