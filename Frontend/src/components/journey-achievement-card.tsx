"use client";

import Link from "next/link";
import { useCallback } from "react";
import { LuAward, LuLockKeyhole } from "react-icons/lu";
import { useLearningRequest } from "@/components/learning-hooks";
import { achievementStatus, reconcileAchievement, requestAchievementNotice } from "@/lib/program-achievement-api";
import styles from "./program-achievement.module.css";

export function JourneyAchievementCard({ programId }: { programId: number }) {
  const load = useCallback(async (signal: AbortSignal) => {
    // Reconciliation retries missed issuance; current status controls display.
    try { await reconcileAchievement(programId); } catch { /* Status remains authoritative. */ }
    const status = await achievementStatus(programId, signal);
    if (!signal.aborted) requestAchievementNotice(programId);
    return status;
  }, [programId]);
  const request = useLearningRequest(load, `achievement/${programId}`);
  const status = request.data;
  if (!status) return <section className={styles.card} aria-label="Sertifikat program"><div>{request.error ? <><p role="alert">Informasi sertifikat belum dapat dimuat.</p><button type="button" className="button button-secondary" onClick={request.retry}>Coba Lagi</button></> : <p role="status">Memuat informasi sertifikat…</p>}</div></section>;
  const owned = status.eligible ? status.achievement : null;
  const reasons: Record<string, string> = {
    incomplete: "Masih ada aktivitas wajib yang belum selesai.",
    mini_incomplete: "Selesaikan dan lulus seluruh Mini Checkpoint yang diwajibkan pada program ini.",
    disabled: "Penerbitan sertifikat otomatis belum tersedia untuk program ini.",
    empty_program: "Chapter program sedang disiapkan.",
    empty_chapter: "Aktivitas chapter sedang disiapkan.",
    invalid_content: "Persyaratan materi program belum siap.",
    learning_type_unresolved: "Hak penerbitan sertifikat belum dapat dikonfirmasi.",
  };
  return <section className={styles.card} aria-label="Sertifikat program">
    <span className={styles.medal}>{owned ? <LuAward aria-hidden="true" /> : <LuLockKeyhole aria-hidden="true" />}</span>
    <div className={styles.body}><h2>{owned?.presentation_snapshot.title || status.certificate_title}</h2>
      <span className={owned ? styles.success : styles.locked}>{owned ? "Berhasil diperoleh" : "Belum diperoleh"}</span>
      {owned ? <><p>Selamat! Sertifikat penyelesaian program sudah kamu peroleh.</p>{status.has_new_material ? <p>Terdapat materi baru yang dapat kamu pelajari. Sertifikat yang sudah kamu peroleh tetap berlaku.</p> : !status.eligible && <p>Masih ada persyaratan belajar terkini yang belum selesai. Sertifikat yang sudah diterbitkan tetap berlaku.</p>}</> : <><p>Selesaikan seluruh chapter dan aktivitas wajib, termasuk lulus Mini Checkpoint yang menjadi persyaratan programmu, untuk mendapatkan sertifikat penyelesaian program.</p><p>{reasons[status.reason] ?? (status.eligible ? "Persyaratan belajar telah selesai. Sertifikat tersedia setelah penerbitan berhasil dikonfirmasi." : "Kelayakan sertifikat mengikuti persyaratan program dan hak akses yang berlaku.")}</p></>}
      <p>Progres belajar terkini: {status.completed_chapters} dari {status.total_chapters} chapter</p>
      <progress value={status.completed_chapters} max={Math.max(1, status.total_chapters)} aria-label="Progres chapter program" />
      {owned && <Link className="button button-primary" href={`/certificate/${owned.id}`}>Lihat Sertifikat Saya</Link>}
    </div>
  </section>;
}
