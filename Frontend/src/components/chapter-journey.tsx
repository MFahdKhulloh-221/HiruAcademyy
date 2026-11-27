"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { LuArrowLeft, LuArrowRight, LuBookOpen, LuCircleCheck, LuLock } from "react-icons/lu";
import { useLearningRequest } from "@/components/learning-hooks";
import { achievementStatus, reconcileAchievement, requestAchievementNotice } from "@/lib/program-achievement-api";
import type { JourneyChapter, JourneyLevel } from "@/lib/journey-mock";
import type { Membership } from "@/lib/dashboard-mock";
import styles from "./chapter-journey.module.css";

const reasonMessages: Record<string, string> = {
  incomplete: "Masih ada aktivitas wajib yang belum selesai.",
  mini_incomplete: "Selesaikan dan lulus seluruh Mini Checkpoint yang diwajibkan pada program ini.",
  disabled: "Penerbitan sertifikat otomatis belum diaktifkan untuk program ini.",
  empty_program: "Chapter program sedang disiapkan.",
  empty_chapter: "Aktivitas wajib chapter sedang disiapkan.",
  invalid_content: "Persyaratan materi program belum siap. Silakan hubungi tim HiruAcademy.",
  learning_type_unresolved: "Hak penerbitan sertifikat belum dapat dikonfirmasi.",
  policy_unresolved: "Kebijakan penyelesaian program belum tersedia.",
  media_reference_unresolved: "Tampilan sertifikat belum siap diterbitkan.",
};

export function ChapterJourney({ membership, level, chapters, programId }: { membership: Membership; level: JourneyLevel; chapters: JourneyChapter[]; programId?: number }) {
  const router = useRouter();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const load = useCallback(async (signal: AbortSignal) => {
    if (!programId) return null;
    // Preserve missed-issuance recovery and existing achievement notifications.
    try { await reconcileAchievement(programId); } catch { /* Ownership still comes from status. */ }
    const status = await achievementStatus(programId, signal);
    if (!signal.aborted) requestAchievementNotice(programId);
    return status;
  }, [programId]);
  const request = useLearningRequest(load, `journey-certificate/${programId}`);
  const status = request.data;
  const owned = status?.achievement;
  const total = status?.total_chapters ?? chapters.length;
  const completed = status?.completed_chapters ?? chapters.filter(chapter => chapter.state === "completed").length;
  const percent = total > 0 ? Math.min(100, Math.round(completed / total * 100)) : 0;
  const complete = total > 0 && completed === total;
  const next = chapters.find(chapter => chapter.href && chapter.state !== "completed");
  const ready = status?.eligible === true;
  const certificateMessage = owned ? "Selamat! Sertifikat penyelesaian programmu sudah tersedia." : ready ? "Semua syarat program sudah terpenuhi." : status ? reasonMessages[status.reason] ?? "Selesaikan seluruh chapter dan aktivitas wajib untuk mendapatkan sertifikat." : request.error ? "Status sertifikat belum dapat dimuat. Silakan coba lagi." : "Memuat status sertifikat…";

  async function checkCertificate() {
    if (owned) { router.push("/certificate"); return; }
    if (!programId || pending.current) return;
    pending.current = true;
    setBusy(true);
    setNotice("");
    try {
      const result = await reconcileAchievement(programId);
      requestAchievementNotice(programId);
      request.retry();
      if ((result.reason === "issued" || result.reason === "existing") && result.data) router.push(`/certificate/${result.data.id}`);
      else setNotice(reasonMessages[result.reason] ?? "Penerbitan sertifikat belum dapat dikonfirmasi. Silakan periksa kembali nanti.");
    } catch {
      setNotice("Pemeriksaan sertifikat belum berhasil. Silakan coba lagi.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }


  const certificateButton = <button type="button" className={styles.primary} disabled={busy || !programId} onClick={() => void checkCertificate()}>{busy ? "Memeriksa…" : owned ? "Lihat Sertifikat" : "Periksa Sertifikat"}<LuArrowRight aria-hidden="true" /></button>;

  return <>
    <section className={styles.banner} aria-label={`Perjalanan belajar ${level.title}`}>
      <div className={styles.bannerCopy}>
        <div className={styles.bannerHeading}>
          <div>
            <p className={styles.kicker}>PROGRES PROGRAM</p>
            <h2>{complete ? "Semua chapter selesai!" : "Lanjutkan perjalanan belajarmu"}</h2>
            <p className={styles.intro}>{complete ? owned ? "Selamat! Sertifikatmu sudah tersedia." : "Kamu telah menyelesaikan seluruh chapter." : owned ? "Pelajari materi tambahan sesuai kecepatanmu." : "Selesaikan seluruh chapter untuk mendapatkan sertifikat penyelesaian program."}</p>
          </div>
          <span className={styles.bookIcon} aria-hidden="true"><LuBookOpen /></span>
        </div>
        <div className={styles.bannerProgress}><span>{completed} dari {total} chapter selesai</span><strong>{percent}%{complete ? " selesai" : ""}</strong></div>
        <progress className={styles.progress} value={completed} max={Math.max(1, total)} aria-label="Progres penyelesaian chapter" />

      </div>
    </section>
    {chapters.length === 0 && <p role="status">Belum ada chapter tersedia untuk program ini.</p>}
    <div className="chapter-journey-layout">
      <section className="chapter-list sensei-chapter-list" aria-label={`Chapter ${level.title}`}>
        {chapters.map(chapter => <article className={`chapter-card chapter-${chapter.state}`} key={chapter.key}>
          <span className="chapter-number">{chapter.orderLabel}</span>
          <div className="chapter-copy">
            <h2>{chapter.title}</h2>
            <p>{chapter.description}</p>
            {(chapter.components.length > 0 || chapter.state !== "entitlementLocked") && <div className="chapter-progress-detail">
              <progress className="chapter-progress-bar" value={chapter.progress} max={100} aria-label={`Progress ${chapter.title}`} />
              <strong>{chapter.progress}%</strong>
            </div>}
            {chapter.checkpointLabel && <small className="chapter-checkpoint-status">Mini Checkpoint: {chapter.checkpointLabel}</small>}
          </div>
          <div className="chapter-action">
            {chapter.href ? <Link className="chapter-action-button" href={chapter.href}>{chapter.statusLabel}<b aria-hidden="true"><LuArrowRight /></b></Link> : chapter.state === "entitlementLocked" ? <Link className="chapter-action-button" href={`/renewal?membership=${membership}&target=${encodeURIComponent(level.slug)}`}>
              Upgrade ke {level.code === "SSW" ? "SSW Pengolahan Makanan" : level.code === "INTERVIEW" ? "Interview" : /^N[1-5]$/.test(level.code) ? `JLPT ${level.code}` : level.title}<b aria-hidden="true"><LuArrowRight /></b>
            </Link> : <span className={`chapter-status chapter-status-${chapter.state}`}>{chapter.state === "progressionLocked" && <LuLock aria-hidden="true" />} {chapter.statusLabel}</span>}
          </div>
        </article>)}
      </section>
      <aside className={styles.milestone} aria-labelledby="journey-milestone-title">
        <div className={styles.milestoneHeading}>
          <span className={styles.milestoneIcon}>{complete ? <LuCircleCheck aria-hidden="true" /> : <LuBookOpen aria-hidden="true" />}</span>
          <h2 id="journey-milestone-title">{complete ? "Perjalanan selesai" : "Milestone berikutnya"}</h2>
        </div>
        <div className={styles.milestoneBody}>
          {next ? <><span className={styles.chapterLabel}>CHAPTER {next.orderLabel}</span><h3>{next.title}</h3><p>Lanjutkan materi berikut untuk meneruskan progres belajarmu.</p><Link className={styles.primary} href={next.href!}>Lanjutkan Belajar <LuArrowRight aria-hidden="true" /></Link></> : <><h3>{complete ? "Semua chapter selesai!" : level.title}</h3><p>{complete ? "Kamu dapat membuka kembali chapter untuk mengulang materi." : "Belum ada chapter berikutnya yang dapat dibuka. Periksa akses programmu melalui daftar program."}</p></>}
        </div>
        <Link className={`button button-secondary ${styles.backToPrograms}`} href={`/journey?membership=${membership}`}><LuArrowLeft aria-hidden="true" /> Kembali ke Program</Link>
        {complete && status && <section className={styles.certificateNotification} aria-label="Notifikasi sertifikat">
          <p>{certificateMessage}</p>
          {(owned || ready) && certificateButton}
          <div role="status" aria-live="polite" aria-atomic="true">{notice && <p>{notice}</p>}</div>
        </section>}
        {complete && request.error && <button className="button button-secondary" type="button" onClick={request.retry}>Coba Lagi Status Sertifikat</button>}
      </aside>
    </div>
  </>;
}
