"use client";

import Link from "next/link";
import { useCallback } from "react";
import {
  LuAward,
  LuBookOpen,
  LuCircleCheck,
  LuClipboardCheck,
  LuFlame,
  LuLayers3,
} from "react-icons/lu";
import { useLearningRequest } from "@/components/learning-hooks";
import { studentOverallProgress, type OverallProgressData } from "@/lib/learning-api";
import type { Membership } from "@/lib/dashboard-mock";

export function StudentProgressScreen({ membership }: { membership: Membership }) {
  const query = `?membership=${membership}`;
  const load = useCallback((signal: AbortSignal) => studentOverallProgress(signal), []);
  const request = useLearningRequest(load, "student-progress");

  const data: OverallProgressData = request.data ?? {
    overall_percentage: 0,
    streak_days: 0,
    kanji_mastered: 0,
    practice_completed: 0,
    accuracy: 0,
    active_program: { name: "JLPT N5", level: "N5", percentage: 0 },
    programs: [],
    chapters: [],
  };

  return (
    <>
      <div className="progress-title-row">
        <header className="supporting-header">
          <h1>Rayakan progres tanpa kehilangan fokus</h1>
          <p>Progress, streak, mastery, dan pencapaian belajarmu.</p>
        </header>
      </div>

      {request.error && (
        <p role="alert">
          {request.error}
          <button type="button" onClick={request.retry}>Coba Lagi</button>
        </p>
      )}
      {request.loading && <p role="status">Memuat progres…</p>}

      {/* 1. Progress Summary */}
      <section className="progress-summary">
        <div className="progress-summary-info">
          <p className="dash-kicker">{data.active_program.name.toUpperCase()}</p>
          <h2>Perjalanan belajar terus bertumbuh</h2>
          <p>Persentase dan milestone dihitung langsung dari aktivitas belajar yang telah diselesaikan.</p>
        </div>

        <div className="progress-summary-tracker">
          <span className="progress-streak-badge">
            <LuFlame aria-hidden="true" /> {data.streak_days} Hari Streak
          </span>
          <div className="progress-bar-wrap">
            <div
              className="progress-bar-track"
              role="progressbar"
              aria-valuenow={data.overall_percentage}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progress Pembelajaran"
            >
              <div
                className="progress-bar-fill"
                style={{ width: `${data.overall_percentage}%` }}
              />
            </div>
            <strong className="progress-bar-pct">{data.overall_percentage}%</strong>
          </div>
        </div>

        <div className="progress-stats">
          <div className="progress-stat-card">
            <span className="progress-stat-icon" aria-hidden="true"><LuBookOpen /></span>
            <strong>{data.kanji_mastered}</strong>
            <span className="progress-stat-label">Kanji mastered</span>
          </div>
          <div className="progress-stat-card">
            <span className="progress-stat-icon" aria-hidden="true"><LuCircleCheck /></span>
            <strong>{data.practice_completed}</strong>
            <span className="progress-stat-label">Latihan selesai</span>
          </div>
          <div className="progress-stat-card">
            <span className="progress-stat-icon" aria-hidden="true"><LuAward /></span>
            <strong>{data.accuracy}%</strong>
            <span className="progress-stat-label">Akurasi Soal</span>
          </div>
        </div>
      </section>

      {/* 2. Level Breakdown / Milestones */}
      <section className="progress-milestones">
        <h2>Progress per Level</h2>
        <div style={{ display: "grid", gap: "12px", marginTop: "16px" }}>
          {data.programs.map((prog, index) => {
            const status = prog.percentage === 100 ? "Selesai" : prog.percentage > 0 ? "Aktif" : "Belum Selesai";
            return (
              <article key={prog.code} className="milestone-item">
                <span className="milestone-number">{String(index + 1).padStart(2, "0")}</span>
                <div className="milestone-info">
                  <strong>{prog.name}</strong>
                  <small>{prog.completed} dari {prog.required} aktivitas selesai ({prog.percentage}%)</small>
                </div>
                <b className={`milestone-badge milestone-${status.toLowerCase().replace(" ", "-")}`}>
                  {status}
                </b>
              </article>
            );
          })}
        </div>
      </section>

      {/* 3. Chapter Breakdown */}
      {data.chapters.length > 0 && (
        <section className="progress-milestones" style={{ marginTop: "24px" }}>
          <h2>Rincian Chapter</h2>
          <div style={{ display: "grid", gap: "10px", marginTop: "16px" }}>
            {data.chapters.map(ch => (
              <article key={`${ch.program_code}-${ch.chapter_number}`} className="milestone-item">
                <span className="milestone-number">{String(ch.chapter_number).padStart(2, "0")}</span>
                <div className="milestone-info">
                  <strong>{ch.title} ({ch.program_code.toUpperCase()})</strong>
                  <small>{ch.completed}/{ch.required} materi selesai</small>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <strong style={{ color: "var(--orange-dark)", fontSize: "14px" }}>{ch.percentage}%</strong>
                  <b className={`milestone-badge ${ch.is_complete ? "milestone-selesai" : "milestone-aktif"}`}>
                    {ch.is_complete ? "Selesai" : "Proses"}
                  </b>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* 4. Achievements / Leaderboard Tab */}
      <section className="progress-achievements">
        <div className="progress-tabs">
          <button className="active" type="button">Pencapaian</button>
          <Link href={`/leaderboard${query}`}>Leaderboard</Link>
        </div>
        <div>
          {[
            {
              icon: LuFlame,
              title: "Streak Belajar",
              desc: "Belajar konsisten secara berturut-turut.",
              status: data.streak_days >= 7 ? "Terbuka" : `${data.streak_days}/7 Hari`,
            },
            {
              icon: LuLayers3,
              title: "Latihan Pertama",
              desc: "Menyelesaikan sesi latihan pertama.",
              status: data.practice_completed > 0 ? "Terbuka" : "Belum terbuka",
            },
            {
              icon: LuClipboardCheck,
              title: "Kanji Master",
              desc: "Menyelesaikan modul huruf & kanji.",
              status: data.kanji_mastered > 0 ? "Terbuka" : "Belum terbuka",
            },
            {
              icon: LuAward,
              title: "Evaluasi Chapter",
              desc: "Menyelesaikan Mini Checkpoint terarah.",
              status: data.practice_completed > 0 ? "Terbuka" : "Belum terbuka",
            },
          ].map(({ icon: Icon, title, desc, status }) => (
            <article key={title}>
              <span aria-hidden="true"><Icon /></span>
              <h2>{title}</h2>
              <p>{desc}</p>
              <b>{status}</b>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
