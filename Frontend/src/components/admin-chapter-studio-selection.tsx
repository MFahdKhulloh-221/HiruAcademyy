import type { ReactNode } from "react";
import { FiBookOpen, FiHeadphones } from "react-icons/fi";

export function AdminChapterStudioSelection({ kind, selected, disabled, children }: { kind: "Reading" | "Audio"; selected: boolean; disabled: boolean; children: ReactNode }) {
  if (selected) return <fieldset disabled={disabled}>{children}</fieldset>;
  const Icon = kind === "Reading" ? FiBookOpen : FiHeadphones;
  return <section className="admin-chapter-studio-selection" aria-label={`Pilihan chapter ${kind}`}>
    <header><h2>Siapkan materi {kind}</h2><p>Pilih program, lalu chapter untuk mulai mengelola {kind === "Reading" ? "teks bacaan dan soal reading" : "audio dan soal listening"}.</p></header>
    <fieldset disabled={disabled}><legend className="sr-only">Program dan chapter {kind}</legend>{children}</fieldset>
    <div className="admin-chapter-studio-empty">
      <span className="admin-chapter-studio-icon"><Icon aria-hidden="true" /></span>
      <h3>Belum ada chapter dipilih</h3>
      <p>Editor {kind} akan tampil setelah program dan chapter dipilih.</p>
    </div>
  </section>;
}
