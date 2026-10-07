"use client";

import Link from "next/link";
import { useState } from "react";
import { LuArrowRight, LuKey, LuLock, LuStar } from "react-icons/lu";
import type { JourneyChapter, JourneyLevel } from "@/lib/journey-mock";
import type { Membership } from "@/lib/dashboard-mock";

export function ChapterJourney({ membership, level, chapters }: { membership: Membership; level: JourneyLevel; chapters: JourneyChapter[] }) {
  const [completionView, setCompletionView] = useState<"journey" | "complete" | "feedback" | "submitted">("journey");
  const [rating, setRating] = useState(4);
  const [feedback, setFeedback] = useState("");
  const [consent, setConsent] = useState(false);

  if (completionView === "complete") {
    return (
      <section className="level-complete-state">
        <p className="dash-kicker">LEVEL SELESAI • FEEDBACK</p>
        <h1>Selamat, seluruh Chapter pada level ini selesai</h1>
        <span className="level-complete-status">Belum Aktif</span>
        <strong className="level-complete-icon"><LuKey /></strong>
        <p>Feedback akhir level tersedia. Jadwal, replay, dan Tanya Sensei tetap tersimpan pada cohort aktif.</p>
        <div className="level-complete-meta">
          <b>LEVEL SELESAI • FEEDBACK</b>
          <span>Nilai tersimpan</span>
          <span>Status resmi tersimpan</span>
        </div>
        <div className="level-complete-actions">
          <button type="button" onClick={() => setCompletionView("feedback")}>Kembali ke Hasil</button>
          <Link href={"/progress?membership=" + membership}>Kembali ke Daftar</Link>
        </div>
      </section>
    );
  }

  if (completionView === "feedback") {
    return (
      <section className="level-feedback">
        <header>
          <div>
            <p className="dash-kicker">FEEDBACK AKHIR LEVEL • {membership === "sensei" ? "BELAJAR DENGAN SENSEI" : "HIRU ACADEMY"}</p>
            <h1>Bagikan pengalaman setelah seluruh Chapter selesai</h1>
            <p>Form ini hanya muncul setelah Chapter terakhir pada level aktif selesai.</p>
          </div>
          <span>LEVEL SELESAI</span>
        </header>
        <section className="level-feedback-summary">
          <strong>{level.title} • {membership === "sensei" ? "BELAJAR DENGAN SENSEI" : "BELAJAR MANDIRI"}</strong>
          <span>{chapters.length} dari {chapters.length} Chapter selesai</span>
          <small>Progress dan status selesai tersimpan di akun.</small>
        </section>
        <form onSubmit={(event) => { event.preventDefault(); setCompletionView("submitted"); }}>
          <fieldset className="feedback-rating">
            <legend>Penilaian keseluruhan</legend>
            <p>Pilih rating untuk materi, latihan, dan pengalaman belajar.</p>
            <div>
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  type="button"
                  aria-label={value + " bintang"}
                  aria-pressed={rating === value}
                  onClick={() => setRating(value)}
                  key={value}
                >
                  <LuStar aria-hidden="true" />
                </button>
              ))}
            </div>
          </fieldset>
          <section className="feedback-categories">
            {[
              ["Materi", "Video, modul, dan contoh."],
              ["Latihan", "Latihan, checkpoint, dan Try Out."],
              ["Pengalaman", "Alur, progress, dan kemudahan."],
            ].map(([title, description]) => (
              <article key={title}>
                <strong>{title}</strong>
                <p>{description}</p>
                <span aria-label="4 dari 5 bintang" style={{ display: "inline-flex", gap: "2px", alignItems: "center" }}>
                  <LuStar fill="currentColor" />
                  <LuStar fill="currentColor" />
                  <LuStar fill="currentColor" />
                  <LuStar fill="currentColor" />
                  <LuStar />
                </span>
              </article>
            ))}
          </section>
          <label className="feedback-text">
            Ceritakan pengalamanmu
            <small>Apa yang paling membantu dan apa yang perlu diperbaiki?</small>
            <textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Tulis masukan untuk tim akademik dan pengembangan produk..." rows={6} required />
          </label>
          <label className="feedback-consent">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>
              Saya bersedia masukan ini dipertimbangkan sebagai testimoni publik Hiru Academy.
              <small>Opsional. Feedback tidak otomatis dipublikasikan dan tetap menunggu moderasi Admin.</small>
            </span>
          </label>
          <div className="level-feedback-actions">
            <button type="submit" className="button button-primary">Kirim Feedback</button>
            <button type="button" className="button button-secondary" onClick={() => setCompletionView("journey")}>Batal</button>
          </div>
        </form>
      </section>
    );
  }

  if (completionView === "submitted") {
    return (
      <section className="level-complete-state">
        <p className="dash-kicker">FEEDBACK • TERSIMPAN</p>
        <h1>Feedback akhir level berhasil dikirim</h1>
        <span className="level-complete-status">Belum Aktif</span>
        <strong className="level-complete-icon"><LuKey /></strong>
        <p>Masukan tersimpan. Izin testimoni, bila dipilih, tetap menunggu moderasi Admin.</p>
        <div className="level-complete-meta">
          <b>FEEDBACK • TERSIMPAN</b>
          <span>Nilai tersimpan</span>
          <span>Status resmi tersimpan</span>
        </div>
        <div className="level-complete-actions">
          <Link href={"/progress?membership=" + membership}>Kembali ke Hasil</Link>
          <Link href={"/dashboard?membership=" + membership}>Kembali ke Daftar</Link>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="chapter-progress-card">
        <div>
          <h2>{chapters.length} Chapter</h2>
          <p>Progress{membership === "sensei" ? ", kelas Sensei, dan replay" : " materi dan quiz"} level lain tetap disimpan secara terpisah.</p>
        </div>

      </section>
      <div className="chapter-journey-layout">
        <section className="chapter-list sensei-chapter-list" aria-label={"Chapter " + level.title}>
          {chapters.map((chapter) => (
            <article className={"chapter-card chapter-" + chapter.state} key={chapter.key}>
              <span className="chapter-number">{chapter.orderLabel}</span>
              <div className="chapter-copy">
                <h2>{chapter.title}</h2>
                <p>{chapter.description}</p>
                {chapter.components.length > 0 && <div className="chapter-progress-detail"><strong>{chapter.progress}%</strong><progress value={chapter.progress} max={100} aria-label={`Progress ${chapter.title}`} /></div>}
                <small className="chapter-checkpoint-status">Checkpoint: {chapter.checkpointUnlocked ? "terbuka" : "terbuka setelah semua bagian selesai"}</small>
              </div>
              <div className="chapter-action">
                {chapter.href ? (
                  <Link className="chapter-action-button" href={chapter.href}>
                    {chapter.statusLabel}
                    <b aria-hidden="true"><LuArrowRight /></b>
                  </Link>
                ) : chapter.state === "finalPreview" ? (
                  <button className="chapter-action-button" type="button" onClick={() => setCompletionView("complete")}>
                    {chapter.statusLabel}
                    <b aria-hidden="true"><LuArrowRight /></b>
                  </button>
                ) : chapter.state === "entitlementLocked" ? (
                  <Link className="chapter-action-button" href={`/renewal?membership=${membership}&target=${level.code.toLowerCase()}`}>
                    Upgrade ke {level.code === "SSW" ? "SSW Pengolahan Makanan" : level.code === "INTERVIEW" ? "Interview" : `JLPT ${level.code}`}
                    <b aria-hidden="true"><LuArrowRight /></b>
                  </Link>
                ) : (
                  <span className={"chapter-status chapter-status-" + chapter.state}>
                    {chapter.state === "progressionLocked" && <LuLock aria-hidden="true" style={{ display: "inline-block", marginRight: "4px", verticalAlign: "middle" }} />}
                    {chapter.statusLabel}
                  </span>
                )}
              </div>
            </article>
          ))}
        </section>
        <aside className="chapter-milestone">
          <h2>Milestone berikutnya</h2>
          <p>{chapters.find(chapter => chapter.href && chapter.progress < 100)?.title ?? level.title}</p>

          <Link href={"/journey?membership=" + membership}>Kembali ke Level</Link>
        </aside>
      </div>
    </>
  );
}
