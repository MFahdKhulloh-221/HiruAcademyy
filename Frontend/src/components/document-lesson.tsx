"use client";

import Link from "next/link";
import { useState } from "react";
import { getDocumentLesson, type DocumentLessonKind, type LearningData } from "@/lib/learning-mock";
import { completeChapterActivity } from "@/lib/learning-progress";

export function DocumentLesson({ data, kind }: { data: LearningData; kind: DocumentLessonKind }) {
  const lesson = getDocumentLesson(data, kind);
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [mode, setMode] = useState<"professional" | "beginner">("professional");
  return <>
    <header className="learning-page-head"><h1>{lesson.title}</h1><p>{lesson.description}</p></header>
    <div className="document-toolbar"><div><strong>{lesson.filename}</strong><small>Modul materi resmi HIRU Academy.</small></div><div><button type="button" aria-label="Perkecil" onClick={() => setZoom((value) => Math.max(80, value - 10))}>−</button><span>{zoom}%</span><button type="button" aria-label="Perbesar" onClick={() => setZoom((value) => Math.min(120, value + 10))}>+</button><button type="button" disabled>Unduh</button></div></div>
    <div className="document-layout"><nav className="document-pages" aria-label="Halaman modul">{lesson.pageMarkers.map(([glyph, label], index) => <button type="button" className={page === index ? "active" : ""} onClick={() => setPage(index)} key={label}><span aria-hidden="true">{glyph}</span><strong>{label}</strong></button>)}</nav><div className="document-paper" style={{ fontSize: `${zoom}%` }}>{page === 0 ? <><div className="japanese-mode-control" role="group" aria-label="Mode tampilan Jepang"><button type="button" aria-pressed={mode === "professional"} onClick={() => setMode("professional")}>Jepang Profesional</button><button type="button" aria-pressed={mode === "beginner"} onClick={() => setMode("beginner")}>Jepang Pemula</button></div><p className="dash-kicker">{lesson.pageKicker}</p><h2>{lesson.pageTitle}</h2><p>{lesson.pageDescription}</p><div className="document-highlights">{lesson.highlights.map(([glyph, label]) => <article key={glyph}><span>{glyph}</span><strong>{label}</strong></article>)}</div><section className="document-detail"><h3>{lesson.detailTitle}</h3><p>{lesson.detail}</p></section><section className="document-example"><h3>{lesson.exampleTitle}</h3><p>{lesson.example}</p>{mode === "beginner" && <small>Jepang Pemula aktif. Konten bantuan mengikuti konfigurasi materi.</small>}</section><section className="document-notes"><h3>Bookmark & Catatan</h3><div>{lesson.notes.map(([glyph, title, description]) => <article key={title}><span aria-hidden="true">{glyph}</span><div><strong>{title}</strong><p>{description}</p></div></article>)}</div></section></> : <section className="document-page-unavailable"><span aria-hidden="true">{lesson.pageMarkers[page][0]}</span><h2>{lesson.pageMarkers[page][1]}</h2><p>Konten halaman mengikuti konfigurasi materi.</p></section>}</div></div>
    <footer className="document-footer"><span>Halaman {page + 1} dari 12</span><div><Link href={lesson.previous.href}>{lesson.previous.label}</Link>{lesson.next.href ? <Link className="primary" href={lesson.next.href} onClick={() => completeChapterActivity(data.levelSlug, data.chapterSlug, kind)}>{lesson.next.label}</Link> : <button type="button" disabled>{lesson.next.label}</button>}</div></footer>
  </>;
}
