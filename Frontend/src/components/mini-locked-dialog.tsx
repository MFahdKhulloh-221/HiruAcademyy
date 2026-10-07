"use client";

import Link from "next/link";
import { useId, useRef } from "react";
import type { ChapterProgress } from "@/lib/learning-api";

export function MiniLockedDialog({ access, progress, chapterHref, className = "button button-secondary" }: { access: string; progress?: ChapterProgress; chapterHref: string; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const reasonId = useId();
  const entitlement = !["full", "preview"].includes(access);
  const labels: Record<string, string> = { video: "Video Lesson", module: "Modul Tata Bahasa", flashcard: "Flashcard", audio: "Audio Question", reading: "Reading Question" };
  const remaining = Object.entries(progress?.activities ?? {}).filter(([type, activity]) => labels[type] && activity.total > 0 && !activity.complete);
  return <>
    <button ref={trigger} type="button" className={className} aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>Terkunci</button>
    <dialog ref={dialog} className="mini-locked-dialog" aria-labelledby={titleId} aria-describedby={reasonId} onClose={() => trigger.current?.focus()}>
      <form method="dialog"><button type="submit" className="button button-secondary" aria-label="Tutup" autoFocus>×</button></form>
      <h2 id={titleId}>Mini Checkpoint masih terkunci</h2>
      <p id={reasonId}>{entitlement ? "Mini Checkpoint belum dapat dibuka karena chapter ini belum termasuk dalam akses belajarmu." : "Mini Checkpoint akan terbuka setelah seluruh aktivitas wajib chapter selesai."}</p>
      {!entitlement && remaining.length > 0 && <><h3>Yang masih perlu diselesaikan:</h3><ul>{remaining.map(([type]) => <li key={type}>{labels[type]}</li>)}</ul></>}
      <Link className="button button-primary" href={chapterHref} onClick={() => dialog.current?.close()}>Kembali ke Aktivitas Chapter</Link>
    </dialog>
  </>;
}
