"use client";

import Link from "next/link";
import { useState } from "react";
import { LuSparkles, LuShuffle, LuLockKeyhole, LuTrophy, LuPlay, LuBookOpen, LuLayers3, LuVolume2, LuBookMarked } from "react-icons/lu";
import { programSlug, type learningDashboard } from "@/lib/learning-api";
import styles from "./dashboard-practice.module.css";

type Entry = Awaited<ReturnType<typeof learningDashboard>>["chapters"][number];
export function accessibleJourney(data: Awaited<ReturnType<typeof learningDashboard>>) {
  return data.chapters.filter(item => ["full", "preview"].includes(item.chapter.access) && ["full", "preview"].includes(data.catalog.access.learning[item.program.code]));
}
const kinds = [
  ["video", "video", "Video Lesson", "Tonton Video", "Tonton penjelasan utama chapter.", LuPlay],
  ["module", "grammar", "Modul", "Baca Modul", "Baca materi utama chapter.", LuBookOpen],
  ["flashcard", "flashcards", "Flashcard", "Latihan Flashcard", "Ulangi kosakata dan pola penting.", LuLayers3],
  ["audio", "audio", "Audio Question", "Latihan Audio", "Latih pemahaman listening.", LuVolume2],
  ["reading", "reading", "Reading Question", "Latihan Reading", "Baca teks dan jawab pertanyaan.", LuBookMarked],
] as const;
export function journeyRecommendations(entry: Entry) {
  const base = `/learn/${encodeURIComponent(programSlug(entry.program.code))}/chapter-${entry.chapter.chapter_number}`;
  return kinds.flatMap(([kind, path, title, cta, description, Icon]) => {
    const activity = entry.progress.activities[kind];
    if (!activity || activity.complete || activity.total < 1) return [];
    return [{ kind, title, cta, description, Icon, started: activity.completed > 0, href: `${base}/${path}${kind === "audio" || kind === "reading" ? "?start=1" : ""}` }];
  }).sort((a, b) => Number(b.started) - Number(a.started));
}
export function DashboardJourneyRecommendation({ entry, nextEntry }: { entry?: Entry; nextEntry?: Entry }) {
  const [selected, setSelected] = useState<string | null>(null);
  const options = entry ? journeyRecommendations(entry) : [];
  const recommendation = options.find(item => item.kind === selected) ?? options[0];
  const mini = entry?.program.family === "jlpt" && ["n5", "n4", "n3", "n2"].includes(entry.program.code) && entry.chapter.mini_checkpoint?.exists;
  const progress = entry?.progress;
  const required = mini ? kinds.map(([kind]) => progress?.activities[kind]) : [];
  const known = required.length > 0 && required.every(Boolean);
  const done = required.filter(activity => activity?.complete).length;
  const open = mini && progress?.mini_eligible === true && progress.mini_unlocked && !progress.mini_completed;
  const base = entry ? `/learn/${encodeURIComponent(programSlug(entry.program.code))}/chapter-${entry.chapter.chapter_number}` : "";
  return <div className={styles.journeyPanels}>
    <section className={styles.panel} aria-label="Rekomendasi latihan"><div className={styles.heading}><LuSparkles aria-hidden="true" /><h2>Rekomendasi Latihan</h2>{recommendation && <span className={styles.badge}>{recommendation.started ? "Sedang dikerjakan" : "Belum selesai"}</span>}</div>
      {recommendation && entry ? <><div className={styles.item}><recommendation.Icon aria-hidden="true" /><div><strong>{recommendation.title}</strong><p>{entry.program.name} · Chapter {entry.chapter.chapter_number}</p><p>{recommendation.description}</p></div></div><div className={styles.actions}><Link className={styles.start} href={recommendation.href}>{recommendation.cta} →</Link>{options.length > 1 && <button type="button" className={styles.shuffle} onClick={() => { const alternatives = options.filter(item => item.kind !== recommendation.kind); setSelected(alternatives[Math.floor(Math.random() * alternatives.length)].kind); }}><LuShuffle aria-hidden="true" /> Rekomendasi Lain</button>}</div></> : <p>{!entry ? "Belum ada Journey yang dapat diakses." : open ? "Aktivitas wajib selesai. Mini Checkpoint sudah dapat dikerjakan di bawah." : progress?.mini_completed ? "Aktivitas chapter dan Mini Checkpoint sudah selesai." : Object.values(progress?.activities ?? {}).some(activity => !activity.complete) ? "Aktivitas berikutnya belum tersedia atau masih terkunci." : "Semua aktivitas yang tersedia sudah selesai."}</p>}
    </section>
    <section className={`${styles.panel} ${styles.mini}`} aria-label="Menuju Mini Checkpoint"><div className={styles.heading}>{open || progress?.mini_completed ? <LuTrophy aria-hidden="true" /> : <LuLockKeyhole aria-hidden="true" />}<h2>{progress?.mini_completed ? "Mini Checkpoint Selesai" : open ? "Mini Checkpoint Sudah Terbuka!" : "Menuju Mini Checkpoint"}</h2></div>
      {!mini ? <p>Mini Checkpoint belum tersedia untuk chapter program ini.</p> : progress?.mini_completed ? <><p>Mini Checkpoint chapter ini sudah selesai.</p>{nextEntry && <Link className={styles.start} href={`/learn/${encodeURIComponent(programSlug(nextEntry.program.code))}/chapter-${nextEntry.chapter.chapter_number}`}>Lanjutkan Journey →</Link>}</> : open ? <><p>Semua aktivitas yang diperlukan sudah selesai. Saatnya menguji kemampuanmu!</p><Link className={styles.start} href={`${base}/checkpoint`}>Kerjakan Mini Checkpoint →</Link></> : <>{known && <><p>{done} dari {required.length} aktivitas selesai</p><progress aria-label="Aktivitas prasyarat Mini Checkpoint" value={done} max={required.length} /></>}<p>{progress?.mini_eligible !== true ? "Mini Checkpoint belum terbuka untuk akses programmu." : known && done < required.length ? `Tinggal ${required.length - done} aktivitas lagi! Selesaikan aktivitas wajib untuk membuka Mini Checkpoint Chapter ${entry!.chapter.chapter_number}.` : "Mini Checkpoint masih terkunci. Periksa kesiapan aktivitas melalui Journey."}</p></>}
    </section>
  </div>;
}
