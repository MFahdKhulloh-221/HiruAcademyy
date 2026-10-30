"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AdminPageHeader } from "@/components/admin-primitives";

export const journeyContentRoutes: Record<string, string> = {
  "Video Lesson": "/admin/video-lesson",
  Modul: "/admin/modul",
  "Reading Question": "/admin/reading-question",
  "Audio Question": "/admin/audio-question",
  "Mini Checkpoint": "/admin/kurikulum-materi?tab=Mini%20Checkpoint",
};

export const journeyTabs = {
  Program: { href: "/admin/kurikulum-materi?tab=Program", description: "Kelola daftar program, urutan, dan status tampil di Journey siswa." },
  Chapter: { href: "/admin/kurikulum-materi?tab=Kurikulum", description: "Kelola chapter dan urutan kurikulum berdasarkan program." },
  Flashcard: { href: "/admin/kurikulum-materi?tab=Flashcard", description: "Kelola kartu belajar berdasarkan program dan chapter." },
  "Video Lesson": { href: journeyContentRoutes["Video Lesson"], description: "Kelola video pembelajaran berdasarkan program dan chapter." },
  Modul: { href: journeyContentRoutes.Modul, description: "Kelola modul pembelajaran berdasarkan program dan chapter." },
  "Reading Question": { href: journeyContentRoutes["Reading Question"], description: "Kelola teks bacaan dan soal reading berdasarkan program dan chapter." },
  "Audio Question": { href: journeyContentRoutes["Audio Question"], description: "Kelola audio dan soal listening berdasarkan program dan chapter." },
  "Mini Checkpoint": { href: journeyContentRoutes["Mini Checkpoint"], description: "Kelola soal, sesi, dan part Mini Checkpoint." },
};

export function AdminJourneyHeader({ tab, actions }: { tab: keyof typeof journeyTabs; actions?: ReactNode }) {
  return <><AdminPageHeader title={tab} description={journeyTabs[tab].description} actions={actions} /><AdminJourneyLinks current={journeyTabs[tab].href} /></>;
}

export function AdminJourneyLinks({ current }: { current: string }) {
  return <nav className="admin-tabs" aria-label="Journey / Kurikulum & Materi">
    {Object.entries(journeyTabs).map(([label, { href }]) => <Link key={href} href={href} className={current === href ? "active" : undefined} aria-current={current === href ? "page" : undefined}>{label}</Link>)}
  </nav>;
}

export function AdminJourneyToolbar({ programs, chapters, program, chapter, onProgram, onChapter, children, requireProgram = false }: {
  programs: readonly { id: number; name: string }[]; chapters?: readonly { id: number; program_id: number; title: string }[];
  requireProgram?: boolean; program: string; chapter?: string; onProgram: (value: string) => void; onChapter?: (value: string) => void; children: ReactNode;
}) {
  return <div className="admin-journey-toolbar">
    <div className="admin-journey-filters">
      <label className="admin-field">Program<select aria-label="Program" value={program} onChange={event => onProgram(event.target.value)}>{!requireProgram && <option value="">Pilih Program</option>}{programs.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      {chapters && <label className="admin-field">Chapter<select aria-label="Chapter" value={chapter ?? ""} onChange={event => onChapter?.(event.target.value)}><option value="">Semua Chapter</option>{chapters.filter(item => !program || String(item.program_id) === program).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}
    </div>
    <div className="admin-journey-actions">{children}</div>
  </div>;
}
