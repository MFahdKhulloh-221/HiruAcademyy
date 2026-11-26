"use client";

import Link from "next/link";
import { ApiError } from "@/lib/api";
import { useRouter, useSearchParams } from "next/navigation";
import { StudentLoading } from "@/components/loading-skeleton";
import { useCallback, useRef, useState } from "react";
import { LearningShell } from "@/components/learning-shell";
import { FlashcardSession } from "@/components/flashcard-session";
import { MiniLockedDialog } from "@/components/mini-locked-dialog";
import { loadChapterContext, useLearningRequest } from "@/components/learning-hooks";
import { LuBookMarked, LuBookOpen, LuCircleCheck, LuClipboardCheck, LuLayers3, LuLockKeyhole, LuPlay, LuVolume2 } from "react-icons/lu";
import styles from "./learning-module.module.css";
import { LearningVideo } from "./learning-video";
import { learningCompletion, learningMembership, safeLearningUrl, type ChapterProgress } from "@/lib/learning-api";

export function LearningVertical({ kind, level, chapter }: { kind: "learning" | "video" | "grammar" | "kanji" | "flashcards"; level: string; chapter: string }) {
  const load = useCallback(async (signal: AbortSignal) => {
    try { return await loadChapterContext(level, chapter, signal); }
    catch (cause) {
      if (level === "dasar" && chapter === "chapter-1" && cause instanceof ApiError && cause.status === 404) throw new ApiError(404, {}, "Chapter 1 gratis DASAR belum tersedia atau belum dipublikasikan.");
      throw cause;
    }
  }, [level, chapter]);
  const request = useLearningRequest(load, `${level}/${chapter}`);
  if (!request.data) return request.error ? <main className="learning-content"><p role="alert">{request.error}</p><button type="button" onClick={request.retry}>Coba Lagi</button></main> : <StudentLoading shell="learning" variant="learning" label="Memuat materi..." />;
  return <CanonicalLearning key={`${request.data.program.id}/${request.data.chapter.id}`} context={request.data} kind={kind} level={level} chapterSlug={chapter} />;
}

function CanonicalLearning({ context, kind, level, chapterSlug }: { context: Awaited<ReturnType<typeof loadChapterContext>>; kind: "learning" | "video" | "grammar" | "kanji" | "flashcards"; level: string; chapterSlug: string }) {
  const { program, chapter, access } = context;
  const moduleId = useSearchParams().get("module");
  const router = useRouter();
  const modules = (chapter.modules ?? []).filter(item =>
    (kind === "kanji" ? item.module_type === "kanji" : moduleId === null || item.module_type !== "kanji") &&
    (moduleId === null || String(item.id) === moduleId));
  const [progress, setProgress] = useState(context.progress);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const membership = learningMembership(access);
  const base = `/learn/${level}/${chapterSlug}`;
  async function complete(type: "video" | "module" | "flashcard", id?: number): Promise<ChapterProgress> {
    if (pending.current) throw new Error("Completion pending");
    pending.current = true;
    setBusy(true); setError("");
    try {
      const next = await learningCompletion(program.id, chapter.id, type, id);
      setProgress(next);
      return next;
    } catch (cause) {
      setError(kind === "video" || kind === "flashcards" ? "Progres belajar belum berhasil disimpan. Silakan coba lagi." : cause instanceof Error ? cause.message : "Permintaan belum berhasil. Silakan coba lagi.");
      throw cause;
    } finally { pending.current = false; setBusy(false); }
  }
  const activities = [
    ["video", "Video Lesson", "video", chapter.video_lessons?.length, "Tonton penjelasan utama chapter.", LuPlay],
    ["grammar", "Modul", "module", chapter.modules?.length, "Baca materi utama chapter.", LuBookOpen],
    ["flashcards", "Flashcard", "flashcard", chapter.flashcards?.length, "Ulangi kosakata dan pola penting.", LuLayers3],
    ["audio", "Audio Question", "audio", progress.activities.audio?.total, "Latih pemahaman listening.", LuVolume2],
    ["reading", "Reading Question", "reading", progress.activities.reading?.total, "Baca teks dan jawab pertanyaan.", LuBookMarked],
  ] as const;
  const visibleActivities = program.code === "dasar" ? activities.filter(([path]) => path !== "audio" && path !== "reading") : activities;
  const activityHref = (path: string) => `${base}/${path}${path === "audio" || path === "reading" ? "?start=1" : ""}`;
  function activityComplete(type: string) {
    return progress.activities[type]?.complete ?? false;
  }
  function activityStarted(type: string) {
    return (progress.activities[type]?.completed ?? 0) > 0;
  }
  const current = kind === "learning" ? "overview" : kind === "grammar" || kind === "kanji" ? "document" : kind;
  return <LearningShell membership={membership} level={level} chapter={chapterSlug} current={current} breadcrumbLabel={kind === "video" ? "Video Pembelajaran" : kind === "learning" ? chapter.title : activities.find(item => item[0] === kind)?.[1] ?? "Flashcard"}>
    {error && kind !== "flashcards" && <p role="alert">{error}</p>}
    {kind === "learning" ? <>
      <section className="learning-section-head"><h2>Aktivitas chapter</h2></section>
      {level === "dasar" && chapter.chapter_number === 1 && !activities.some(item => item[3]) && <p role="status">Materi Chapter 1 gratis DASAR belum tersedia.</p>}
      <section className="learning-activity-grid" aria-label="Aktivitas chapter">{visibleActivities.map(([path, title, type, available, description, Icon]) => {
        const status = !available ? "Terkunci" : activityComplete(type) ? "Selesai" : activityStarted(type) ? "Sedang dikerjakan" : "Belum dimulai";
        return <article className={`learning-activity-card activity-${!available ? "locked" : activityComplete(type) ? "completed" : "available"}`} key={path}>
          <div className="learning-activity-top"><span className="learning-activity-icon"><Icon aria-hidden="true" /></span><span className="learning-activity-status" role="status">{available && activityComplete(type) && <LuCircleCheck size={16} aria-hidden="true" />}{status}</span></div>
          <h3>{title}</h3><p>{description}</p>
          {available ? <Link className="activity-action-button" href={activityHref(path)}>{path === "audio" || path === "reading" ? "Mulai" : "Buka"}</Link> : <span className="learning-activity-unavailable">Terkunci</span>}
        </article>;
      })}
        {program.family === "jlpt" && chapter.mini_checkpoint?.exists && <article className={`learning-activity-card activity-${progress.mini_completed ? "completed" : progress.mini_unlocked ? "current" : "locked"}`}>
          <div className="learning-activity-top"><span className="learning-activity-icon">{progress.mini_completed ? <LuCircleCheck aria-hidden="true" /> : progress.mini_unlocked ? <LuClipboardCheck aria-hidden="true" /> : <LuLockKeyhole aria-hidden="true" />}</span><span className="learning-activity-status" role="status">{progress.mini_completed ? "Selesai" : progress.mini_unlocked ? "Belum dimulai" : "Terkunci"}</span></div>
          <h3>Mini Checkpoint Chapter {chapter.chapter_number}</h3><p>{progress.mini_unlocked ? "Uji pemahaman materi chapter." : "Selesaikan seluruh aktivitas chapter untuk membuka Mini Checkpoint."}</p>
          {progress.mini_completed ? <Link className="activity-action-button" href={`${base}/checkpoint`}>Lihat Mini Checkpoint</Link> : progress.mini_unlocked ? <Link className="activity-action-button" href={`${base}/checkpoint`}>Mulai Mini Checkpoint</Link> : <MiniLockedDialog access={chapter.access} progress={progress} chapterHref={base} className="activity-action-button" />}
        </article>}
      </section>
      {["ssw", "interview"].includes(program.family) && <p role="status">Latihan soal dan Checkpoint belum tersedia untuk program ini.</p>}
    </> : kind === "flashcards" ? <FlashcardSession cards={(chapter.flashcards ?? []).map(item => ({ id: String(item.id), term: item.japanese, reading: item.reading, meaning: item.meaning, example: { before: item.example ?? "", focus: "", focusReading: "", after: "", translation: "" } }))} membership={membership} level={level} chapter={chapterSlug} chapterNumber={chapter.chapter_number} activityCompleted={activityComplete("flashcard")} onComplete={() => complete("flashcard").then(() => undefined)} /> : kind === "video" ? <LearningVideo chapter={chapter} levelLabel={program.family === "jlpt" ? program.code.toUpperCase() : program.name} base={base} progress={progress} busy={busy} onComplete={id => complete("video", id)} activities={visibleActivities.filter(item => item[3]).map(([path, title, type, , , Icon]) => ({ path, title: path === "video" ? "Video Pembelajaran" : path === "audio" ? "Latihan Audio" : path === "reading" ? "Latihan Reading" : title, type, Icon, href: activityHref(path) }))} /> : <>{modules.map(item => <section key={item.id}><header className="learning-page-head"><h1>{item.title}</h1><p>{item.description}</p></header><div className="document-paper">{safeLearningUrl(item.file_url_resolved_url === undefined ? item.file_url : item.file_url_resolved_url) && <object className="learning-module-pdf" data={safeLearningUrl(item.file_url_resolved_url === undefined ? item.file_url : item.file_url_resolved_url)} type="application/pdf" aria-label={item.title}><p>Browser belum dapat menampilkan PDF. <a href={safeLearningUrl(item.file_url_resolved_url === undefined ? item.file_url : item.file_url_resolved_url)} target="_blank" rel="noopener noreferrer">Buka PDF di tab baru</a>.</p></object>}{!safeLearningUrl(item.file_url_resolved_url === undefined ? item.file_url : item.file_url_resolved_url) && <p role="status">File materi belum tersedia.</p>}</div><footer className={`document-footer ${styles.actions}`}><Link href={base}>Kembali ke Aktivitas Chapter</Link><button type="button" data-completed={Boolean(progress.activities.module?.completed_ids?.includes(item.id))} disabled={busy} onClick={() => { if (progress.activities.module?.completed_ids?.includes(item.id)) router.push(base); else void complete("module", item.id).then(() => router.push(base)).catch(() => undefined); }}>{progress.activities.module?.completed_ids?.includes(item.id) ? "Selesai" : "Tandai Selesai"}</button></footer></section>)}{modules.length === 0 && <section className="library-empty"><h2>Belum ada materi</h2><p>Modul {kind === "kanji" ? "Kanji" : ["ssw", "interview"].includes(program.family) ? "program" : "Tata Bahasa"} untuk chapter ini belum tersedia.</p><Link href={base}>Kembali ke Aktivitas Chapter</Link></section>}</>}
  </LearningShell>;
}
