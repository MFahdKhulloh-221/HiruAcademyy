"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { LearningShell } from "@/components/learning-shell";
import { FlashcardSession } from "@/components/flashcard-session";
import { MiniLockedDialog } from "@/components/mini-locked-dialog";
import { loadChapterContext, useLearningRequest } from "@/components/learning-hooks";
import { LuBookMarked, LuBookOpen, LuLayers3, LuLockKeyhole, LuPenTool, LuPlay, LuVolume2 } from "react-icons/lu";
import { learningCompletion, learningMembership, learningVideo, safeLearningUrl, type ChapterProgress } from "@/lib/learning-api";

export function LearningVertical({ kind, level, chapter }: { kind: "learning" | "video" | "grammar" | "kanji" | "flashcards"; level: string; chapter: string }) {
  const load = useCallback((signal: AbortSignal) => loadChapterContext(level, chapter, signal), [level, chapter]);
  const request = useLearningRequest(load, `${level}/${chapter}`);
  if (!request.data) return <main className="learning-content"><p role={request.error ? "alert" : "status"}>{request.error ?? "Memuat materi..."}</p>{request.error && <button type="button" onClick={request.retry}>Coba Lagi</button>}</main>;
  return <CanonicalLearning key={`${request.data.program.id}/${request.data.chapter.id}`} context={request.data} kind={kind} level={level} chapterSlug={chapter} />;
}

function CanonicalVideo({ title, url }: { title: string; url?: string | null }) {
  const media = learningVideo(url);
  return <div className="video-surface" style={{ padding: 0, aspectRatio: "16 / 9", minHeight: 0, overflow: "hidden" }}>{media?.kind === "native" ? <video style={{ width: "100%", height: "100%" }} src={media.url} controls preload="metadata" aria-label={title} /> : media?.kind === "youtube" ? <iframe style={{ width: "100%", height: "100%", border: 0 }} src={media.url} title={title} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen /> : <p role="status">Belum tersedia</p>}</div>;
}

function CanonicalLearning({ context, kind, level, chapterSlug }: { context: Awaited<ReturnType<typeof loadChapterContext>>; kind: "learning" | "video" | "grammar" | "kanji" | "flashcards"; level: string; chapterSlug: string }) {
  const { program, chapter, access } = context;
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
      setError(cause instanceof Error ? cause.message : "Permintaan belum berhasil. Silakan coba lagi.");
      throw cause;
    } finally { pending.current = false; setBusy(false); }
  }
  const activities = [
    ["video", "Video Lesson", "video", chapter.video_lessons?.length, "Tonton penjelasan utama chapter.", LuPlay],
    ["grammar", ["interview", "ssw-food"].includes(program.code) ? "Modul" : "Modul Tata Bahasa", "module", chapter.modules?.filter(item => item.module_type !== "kanji").length, "Baca dan tandai poin penting.", LuBookOpen],
    ["kanji", "Modul Huruf Jepang & Kanji", "module", chapter.modules?.filter(item => item.module_type === "kanji").length, "Pelajari huruf dan kanji terkait.", LuPenTool],
    ["flashcards", "Flashcard", "flashcard", chapter.flashcards?.length, "Ulangi kosakata dan pola penting.", LuLayers3],
    ["audio", "Audio Question", "audio", progress.activities.audio?.total, "Latih pemahaman listening.", LuVolume2],
    ["reading", "Reading Question", "reading", progress.activities.reading?.total, "Baca teks dan jawab pertanyaan.", LuBookMarked],
  ] as const;
  const current = kind === "learning" ? "overview" : kind === "grammar" || kind === "kanji" ? "document" : kind;
  return <LearningShell membership={membership} level={level} chapter={chapterSlug} current={current} breadcrumbLabel={kind === "learning" ? chapter.title : activities.find(item => item[0] === kind)?.[1] ?? "Flashcard"}>
    {error && <p role="alert">{error}</p>}
    {kind === "learning" ? <>
      <section className="learning-section-head"><h2>Aktivitas chapter</h2></section>
      <section className="learning-activity-grid" aria-label="Aktivitas chapter">{activities.filter(item => program.code === "interview" ? ["video", "grammar"].includes(item[0]) : ["dasar", "ssw-food"].includes(program.code) ? !["audio", "reading"].includes(item[0]) : true).map(([path, title, type, available, description, Icon]) => <article className={`learning-activity-card activity-${progress.activities[type]?.complete ? "completed" : available ? "available" : "locked"}`} key={path}><div className="learning-activity-top"><span className="learning-activity-icon"><Icon aria-hidden="true" /></span><h3>{title}</h3></div><p>{description}</p>{available ? <Link className="activity-action-button" href={`${base}/${path}`}>{progress.activities[type]?.complete ? "Buka Kembali" : "Buka"}</Link> : <span className="learning-activity-unavailable">Belum tersedia</span>}</article>)}
        {program.code !== "interview" && chapter.mini_checkpoint?.exists && <article className={`learning-activity-card activity-${progress.mini_unlocked ? "current" : "locked"}`}><div className="learning-activity-top"><span className="learning-activity-icon"><LuLockKeyhole aria-hidden="true" /></span><h3>Mini Checkpoint Chapter {chapter.chapter_number}</h3></div><p>{progress.mini_unlocked ? "Seluruh aktivitas chapter telah selesai." : "Selesaikan seluruh aktivitas chapter untuk membuka Mini Checkpoint."}</p>{progress.mini_unlocked ? <Link className="activity-action-button" href={`${base}/checkpoint`}>Mulai Mini Checkpoint</Link> : <MiniLockedDialog access={chapter.access} progress={progress} chapterHref={base} className="activity-action-button" />}</article>}
      </section>
    </> : kind === "flashcards" ? <FlashcardSession cards={(chapter.flashcards ?? []).map(item => ({ id: String(item.id), term: item.japanese, reading: item.reading, meaning: item.meaning, example: { before: item.example ?? "", focus: "", focusReading: "", after: "", translation: "" } }))} membership={membership} level={level} chapter={chapterSlug} onComplete={() => complete("flashcard").then(() => undefined)} /> : kind === "video" ? <>
      <header className="learning-page-head"><h1>{chapter.title}</h1><p>Tonton video, tandai selesai, lalu lanjutkan ke modul berikutnya.</p></header>
      <div className="video-learning-layout"><div className="video-learning-main">{chapter.video_lessons?.map(item => <section className="video-card" key={item.id}><h2>{item.title}</h2><CanonicalVideo title={item.title} url={item.video_url_resolved_url === undefined ? item.video_url : item.video_url_resolved_url} /><p>{item.description}</p><button type="button" disabled={busy || progress.activities.video?.completed_ids?.includes(item.id)} onClick={() => void complete("video", item.id).catch(() => undefined)}>{progress.activities.video?.completed_ids?.includes(item.id) ? "Selesai" : "Tandai Selesai"}</button>{progress.activities.video?.completed_ids?.includes(item.id) && <span className="video-completion" role="status">Selesai</span>}<Link className="sensei-back" href={base}>Kembali ke Aktivitas Chapter</Link></section>)}</div><aside className="video-chapter-rail"><h2>Isi Chapter {chapter.chapter_number}</h2><ol>{activities.filter(item => item[3]).map(([path, title], index) => <li key={path}><span>{String(index + 1).padStart(2, "0")}</span><Link href={`${base}/${path}`}>{title}</Link></li>)}</ol></aside></div>
    </> : <>{chapter.modules?.filter(item => kind === "kanji" ? item.module_type === "kanji" : item.module_type !== "kanji").map(item => <section key={item.id}><header className="learning-page-head"><h1>{item.title}</h1><p>{item.description}</p></header><div className="document-toolbar"><strong>{item.title}</strong>{safeLearningUrl(item.file_url_resolved_url === undefined ? item.file_url : item.file_url_resolved_url) && <a href={safeLearningUrl(item.file_url_resolved_url === undefined ? item.file_url : item.file_url_resolved_url)} target="_blank" rel="noopener noreferrer">Unduh</a>}</div><div className="document-paper">{safeLearningUrl(item.file_url_resolved_url === undefined ? item.file_url : item.file_url_resolved_url) && <iframe className="admin-learning-media-pdf" src={safeLearningUrl(item.file_url_resolved_url === undefined ? item.file_url : item.file_url_resolved_url)} title={item.title} sandbox="" />}</div><footer className="document-footer"><Link href={base}>Kembali ke Aktivitas Chapter</Link><button type="button" disabled={busy} onClick={() => void complete("module", item.id).catch(() => undefined)}>Tandai Selesai</button></footer></section>)}</>}
  </LearningShell>;
}
