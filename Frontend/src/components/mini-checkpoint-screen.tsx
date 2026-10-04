"use client";

import { useCallback, useState } from "react";
import { ChapterAssessment } from "@/components/chapter-assessment";
import { useLearningRequest, loadChapterContext } from "@/components/learning-hooks";
import { learningCatalog, learningChapters, programSlug } from "@/lib/learning-api";
import type { Membership } from "@/lib/dashboard-mock";

export function MiniCheckpointScreen({ membership = "sensei" }: { membership?: Membership } = {}) {
  const [selected, setSelected] = useState<{ level: string; chapterSlug: string }>();
  const load = useCallback(async (signal: AbortSignal) => {
    const catalog = await learningCatalog(signal);
    const groups = await Promise.all(catalog.programs.filter(program => ["n5", "n4", "n3", "n2"].includes(program.code)).map(async program => {
      const chapters = await learningChapters(program.id, signal);
      return Promise.all(chapters.filter(chapter => chapter.access !== "none").map(chapter => loadChapterContext(programSlug(program.code), `chapter-${chapter.chapter_number}`, signal)));
    }));
    return groups.flat().filter(context => context.chapter.mini_checkpoint?.exists);
  }, []);
  const catalog = useLearningRequest(load, "mini-checkpoints");
  if (selected) return <div data-membership={membership}><button className="sensei-back" type="button" onClick={() => setSelected(undefined)}>Kembali ke Daftar</button><ChapterAssessment {...selected} kind="mini" /></div>;
  return <div className="mini-checkpoint-page"><header><h1>Mini Checkpoint</h1></header>{catalog.error && <p role="alert">{catalog.error}<button type="button" onClick={catalog.retry}>Coba Lagi</button></p>}{catalog.loading && <p role="status">Memuat…</p>}<section className="mini-checkpoint-list">{catalog.data?.map(context => <article className="mini-checkpoint-card" key={`${context.program.id}/${context.chapter.id}`}><h2>{context.program.name} • {context.chapter.title}</h2><span>{context.progress.mini_unlocked ? "TERSEDIA" : "LOCKED"}</span><button type="button" disabled={!context.progress.mini_unlocked} onClick={() => setSelected({ level: programSlug(context.program.code), chapterSlug: `chapter-${context.chapter.chapter_number}` })}>Mulai Mini Checkpoint</button></article>)}</section></div>;
}
