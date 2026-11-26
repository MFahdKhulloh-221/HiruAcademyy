"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { FiArrowRight, FiRefreshCw } from "react-icons/fi";
import styles from "./mini-checkpoint-student.module.css";

export type MiniCheckpointResultProps = {
  title: string;
  level: string;
  chapter: number;
  chapterTitle: string;
  percentage: number | undefined;
  passed: boolean | undefined;
  passingScore: number | null;
  correct: number;
  wrong: number;
  unanswered: number;
  href: string;
  busy: boolean;
  retryDisabled: boolean;
  onReview: () => void;
  onRetry: () => void;
};

export function MiniCheckpointResult({ title, level, chapter, chapterTitle, percentage, passed, passingScore, correct, wrong, unanswered, href, busy, retryDisabled, onReview, onRetry }: MiniCheckpointResultProps) {
  const totalQuestions = correct + wrong + unanswered;
  const score = percentage !== undefined && Number.isFinite(percentage) ? Math.min(100, Math.max(0, percentage)) : undefined;

  return (
    <section className={styles.result} aria-label={`Hasil ${title}`}>
      <header className={styles.resultHeader}>
        <p className={styles.eyebrow}>MINI CHECKPOINT SELESAI</p>
        <h1>Hasil {title}</h1>
        <p>{level.toUpperCase()} · Chapter {chapter} · {chapterTitle}</p>
      </header>
      <div className={styles.resultCard}>
        <div className={styles.scoreSummary}>
          <div className={styles.scoreOverview}>
            <div className={styles.scoreRing} style={{ "--score": `${score ?? 0}%` } as CSSProperties}>
              <div><span className={styles.scoreLabel}>Nilai kamu</span><strong>{score ?? "—"}</strong><span>/ 100</span></div>
            </div>
            <p>{correct} dari {totalQuestions} soal benar</p>
          </div>
          <div className={styles.scoreDetails}>
            <p className={styles.passLabel} data-passed={passed}>{passed === true ? "Lulus" : passed === false ? "Belum lulus" : "Status belum tersedia"}</p>
            <p className={styles.threshold}>Batas lulus: <strong>{passingScore ?? "—"} / 100</strong></p>
            <h2>{passed === true ? "Kerja bagus, teruskan belajarmu!" : passed === false ? "Tetap semangat, kamu bisa!" : "Terima kasih sudah menyelesaikan latihan!"}</h2>
            <p>Lihat pembahasan untuk memahami jawabanmu dan memperkuat materi yang sudah dipelajari.</p>
          </div>
        </div>
        <div className={styles.answerStatsHeader}><h2>Ringkasan jawaban</h2><span>Total {totalQuestions} soal</span></div>
        <dl className={styles.answerStats} aria-label="Ringkasan jawaban">
          <div className={styles.correct}><dt>Benar</dt><dd>{correct}</dd></div>
          <div className={styles.wrong}><dt>Salah</dt><dd>{wrong}</dd></div>
          <div className={styles.unanswered}><dt>Tidak dijawab</dt><dd>{unanswered}</dd></div>
        </dl>
        <footer className={styles.resultActions}>
          <button className={styles.secondaryAction} type="button" disabled={busy || retryDisabled} onClick={onRetry}><FiRefreshCw aria-hidden="true" />Coba Lagi</button>
          <button className={styles.primaryAction} type="button" disabled={busy} onClick={onReview}>Lihat Pembahasan<FiArrowRight aria-hidden="true" /></button>
        </footer>
      </div>
      <div className={styles.chapterAction}><Link className={styles.secondaryAction} href={href}>Kembali ke Chapter</Link></div>
    </section>
  );
}
