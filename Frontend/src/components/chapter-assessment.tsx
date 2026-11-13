"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef } from "react";
import { LuClipboardCheck, LuClock, LuShieldCheck, LuX } from "react-icons/lu";
import styles from "./chapter-assessment.module.css";
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
  if (kind === "mini") return <MiniChapterAssessment key={`${program.id}/${chapter.id}`} programId={program.id} chapter={chapter} chapterHref={`/learn/${level}/${chapterSlug}`} />;
  return <>
    <BackendAssessmentRunner key={`${program.id}/${chapter.id}/${kind}`} path={chapterAttemptPath(program.id, chapter.id)} title={kind === "audio" ? "Audio" : "Reading"} className={kind === "reading" ? "learning-question-page reading-assessment" : undefined} startBody={{ kind }} autoStart={autoStart} readingContext={kind === "reading" ? { label: `${program.name} · ${chapter.title}`, href: `/learn/${level}/${chapterSlug}` } : undefined} />
  </>;
}

function MiniChapterAssessment({ programId, chapter, chapterHref }: { programId: number; chapter: ChapterContext["chapter"]; chapterHref: string }) {
  const { user } = useAuth();
  const group = chapter.mini_checkpoints?.[0];
  const scope = group ? `${user?.id}/${programId}/${chapter.id}/mini/${group.session}/${group.part}` : "";
  return <div className={styles.page}>
    <section className={styles.header}>
      <span className={styles.icon}><LuClipboardCheck aria-hidden="true" /></span>
      <div><p className={styles.eyebrow}>EVALUASI CHAPTER {chapter.chapter_number}</p><h1>Mini Checkpoint</h1><p>Uji pemahamanmu setelah menyelesaikan aktivitas chapter.</p></div>
    </section>
    {group && <section className={styles.selection} aria-label="Informasi Mini Checkpoint">
      <strong>Mini Checkpoint Chapter {chapter.chapter_number}</strong>
      <p>{group.question_count} soal <span>•</span> {group.configuration_valid ? `${group.duration_minutes} menit untuk seluruh soal` : "Sedang disiapkan"}</p>
    </section>}
    {group?.configuration_valid ? <BackendAssessmentRunner key={scope} scope={scope} path={chapterAttemptPath(programId, chapter.id)} title="Mini Checkpoint" startBody={{ kind: "mini", session: group.session, part: group.part }} /> : <MiniNotReady key={group ? `${group.session}/${group.part}` : "empty"} chapterHref={chapterHref} />}
  </div>;
}

function MiniNotReady({ chapterHref }: { chapterHref: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const current = dialog.current;
    current?.showModal();
    return () => current?.close();
  }, []);
  return <>
    <section className={styles.empty}>
      <span className={styles.icon}><LuClock aria-hidden="true" /></span>
      <h2>Sedikit lagi, Mini Checkpoint siap!</h2>
      <p>Tim HIRU sedang menyiapkan Mini Checkpoint ini agar kamu bisa mengerjakannya dengan nyaman. Coba lagi nanti, ya.</p>
      <p className={styles.safe}><LuShieldCheck aria-hidden="true" />Progres belajarmu tetap tersimpan.</p>
      <div className={styles.actions}><Link className="button button-primary" href={chapterHref}>Kembali ke Chapter</Link><button ref={trigger} className="button button-secondary" type="button" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>Lihat informasi</button></div>
    </section>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} aria-describedby={descriptionId} onClose={() => trigger.current?.focus()}>
      <form method="dialog" className={styles.close}><button type="submit" aria-label="Tutup informasi" autoFocus><LuX aria-hidden="true" /></button></form>
      <span className={styles.icon}><LuClock aria-hidden="true" /></span>
      <p className={styles.eyebrow}>MINI CHECKPOINT</p>
      <h2 id={titleId}>Mini Checkpoint sedang disiapkan</h2>
      <p id={descriptionId}>Aktivitas chapter sudah kamu selesaikan. Selangkah lagi! Tim HIRU masih menyiapkan sesi ini, jadi belum bisa dimulai sekarang. Silakan kembali lagi nanti, ya.</p>
      <p className={styles.safe}><LuShieldCheck aria-hidden="true" />Tenang, progres belajarmu tetap tersimpan. Tidak perlu mengulang aktivitas.</p>
      <Link className="button button-primary" href={chapterHref}>Kembali ke Chapter</Link>
      <form method="dialog"><button className="button button-secondary" type="submit">Mengerti</button></form>
    </dialog>
  </>;
}
