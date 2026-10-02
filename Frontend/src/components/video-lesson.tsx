"use client";

import Link from "next/link";
import { useState } from "react";
import { LuActivity, LuClock3, LuRepeat2 } from "react-icons/lu";
import type { LearningData } from "@/lib/learning-mock";
import { completeChapterActivity } from "@/lib/learning-progress";

export function VideoLesson({ data }: { data: LearningData }) {
  const [completed, setCompleted] = useState(false);
  const [tab, setTab] = useState<"summary" | "transcript" | "notes">("summary");
  const query = `?membership=${data.membership}`;
  return <>
    <header className="learning-page-head"><h1>{data.videoTitle}</h1><p>Tonton video, tandai selesai, lalu lanjutkan ke modul berikutnya.</p></header>
    <div className="video-learning-layout"><div className="video-learning-main"><section className="video-card"><div className="video-surface"><span aria-hidden="true">▶</span><strong>Mulai video</strong><small>YouTube | lazy-loaded</small></div><p>Durasi dan sumber video mengikuti konfigurasi konten.</p>{completed ? <Link className="button button-primary" href={`/learn/${data.levelSlug}/${data.chapterSlug}/grammar${query}`}>Lanjut Modul Tata Bahasa</Link> : <button type="button" onClick={() => { completeChapterActivity(data.levelSlug, data.chapterSlug, "video"); setCompleted(true); }}>Tandai Selesai</button>}</section><div className="video-tabs" role="tablist" aria-label="Materi video"><button type="button" role="tab" aria-selected={tab === "summary"} onClick={() => setTab("summary")}>Ringkasan</button><button type="button" role="tab" aria-selected={tab === "transcript"} onClick={() => setTab("transcript")}>Transkrip</button><button type="button" role="tab" aria-selected={tab === "notes"} onClick={() => setTab("notes")}>Catatan</button></div>{tab === "summary" ? <section className="video-summary"><h2>Ringkasan materi</h2><p>Video membahas pola kalimat yang digunakan untuk menjelaskan rutinitas, kebiasaan, dan aktivitas sehari-hari. Gunakan transkrip dan catatan untuk meninjau kembali contoh penting.</p><div>{[[LuClock3, "Waktu"], [LuRepeat2, "Kebiasaan"], [LuActivity, "Aktivitas"]].map(([Icon, label]) => <article key={label as string}><span aria-hidden="true"><Icon /></span><strong>{label as string}</strong></article>)}</div></section> : <section className="video-empty-tab"><h2>{tab === "transcript" ? "Transkrip" : "Catatan"}</h2><p>Konten mengikuti konfigurasi materi.</p></section>}</div><aside className="video-chapter-rail"><h2>Isi Chapter {data.chapterNumber}</h2><ol>{data.activities.map((activity) => <li className={activity.key === "video" ? "active" : ""} key={activity.key}><span>{activity.order}</span><strong>{activity.railTitle}</strong></li>)}</ol><Link href={`/learn/${data.levelSlug}/${data.chapterSlug}${query}`}>Kembali ke Chapter</Link></aside></div>
  </>;
}

