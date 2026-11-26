"use client";

import Link from "next/link";
import { LuArrowLeft, LuArrowRight, LuCircle, LuCircleCheck, LuPlay } from "react-icons/lu";
import type { IconType } from "react-icons";
import { learningVideo, type CanonicalChapter, type ChapterProgress } from "@/lib/learning-api";
import styles from "./learning-video.module.css";

type Activity = { path: string; title: string; type: string; Icon: IconType; href: string };

export function LearningVideo({ chapter, levelLabel, base, progress, activities, busy, onComplete }: { chapter: CanonicalChapter; levelLabel: string; base: string; progress: ChapterProgress; activities: Activity[]; busy: boolean; onComplete: (id: number) => Promise<ChapterProgress> }) {
  const videos = [...(chapter.video_lessons ?? [])].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  const completed = progress.activities.video?.completed_ids ?? [];
  const finishedActivities = activities.filter(activity => progress.activities[activity.type]?.complete).length;
  const nextActivity = activities.find(activity => activity.path !== "video");
  return <div className={styles.page}>
    <header className={styles.header}><span>{levelLabel} · Chapter {chapter.chapter_number}</span><h1>{chapter.title}</h1><p>Pelajari materi melalui video berikut, lalu lanjutkan ke aktivitas berikutnya.</p></header>
    <div className={styles.layout}><div className={styles.lessons}>
      {!videos.length && <section className={styles.empty}><LuPlay aria-hidden="true" /><h2>Video belum tersedia.</h2><p>Kamu dapat kembali untuk melihat aktivitas chapter lainnya.</p></section>}
      {videos.map((video, index) => {
        const done = completed.includes(video.id);
        const nextVideo = videos[index + 1];
        const next = nextVideo ? { href: `#video-${nextVideo.id}`, label: "Lanjut ke Video Berikutnya" } : nextActivity ? { href: nextActivity.href, label: `Lanjut ke ${nextActivity.title}` } : { href: base, label: "Lihat Aktivitas Chapter" };
        const media = learningVideo(video.video_url_resolved_url === undefined ? video.video_url : video.video_url_resolved_url);
        return <article className={styles.lesson} id={`video-${video.id}`} key={video.id}>
          <div className={styles.player}>{media?.kind === "native" ? <video src={media.url} controls preload="metadata" aria-label={video.title} /> : media?.kind === "youtube" ? <iframe src={media.url} title={video.title} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen /> : <p role="status">Video belum tersedia.</p>}</div>
          <div className={styles.info}><span className={styles.eyebrow}>Video Pembelajaran{videos.length > 1 ? ` · ${index + 1} dari ${videos.length}` : ""}</span><h2>{video.title}</h2>{video.description && <p className={styles.description}>{video.description}</p>}
            <div className={styles.actions}><div className={done ? styles.completed : styles.pending} role="status">{done ? <LuCircleCheck aria-hidden="true" /> : <LuCircle aria-hidden="true" />}<div><strong>{done ? "Video telah selesai dipelajari" : "Belum selesai"}</strong>{!done && <p>Tandai selesai setelah kamu mempelajari video ini.</p>}</div></div>
              {done ? <Link className={styles.primary} href={next.href}>{next.label}<LuArrowRight aria-hidden="true" /></Link> : <button className={styles.primary} type="button" disabled={busy || !media} aria-busy={busy} onClick={() => void onComplete(video.id).catch(() => undefined)}><LuCircleCheck aria-hidden="true" />{busy ? "Menyimpan…" : "Tandai Selesai"}</button>}
            </div>
          </div>
        </article>;
      })}
      <Link className={styles.back} href={base}><LuArrowLeft aria-hidden="true" />Kembali ke Aktivitas Chapter</Link>
    </div><aside className={styles.chapter} aria-label="Navigasi isi chapter"><header><h2>Isi Chapter {chapter.chapter_number}</h2><p>{finishedActivities} dari {activities.length} aktivitas selesai</p><progress value={finishedActivities} max={activities.length || 1} aria-label="Progres aktivitas chapter" /></header>
      <nav aria-label="Aktivitas chapter"><ul>{activities.map(({ path, title, type, Icon, href }) => { const done = progress.activities[type]?.complete; return <li key={path}><Link href={href} className={path === "video" ? styles.current : undefined} aria-current={path === "video" ? "page" : undefined}><span className={styles.activityIcon}><Icon aria-hidden="true" /></span><span><strong>{title}</strong><small>{path === "video" ? done ? "Sedang dibuka · Selesai" : "Sedang dibuka" : done ? "Selesai" : "Belum selesai"}</small></span>{done && <LuCircleCheck className={styles.check} aria-label="Selesai" />}</Link></li>; })}</ul></nav>
    </aside></div>
  </div>;
}
