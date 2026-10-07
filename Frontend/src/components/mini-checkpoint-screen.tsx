"use client";

import { useCallback, useState } from "react";
import { LuFileCheck, LuArrowLeft } from "react-icons/lu";
import { ChapterAssessment } from "@/components/chapter-assessment";
import { useLearningRequest, loadChapterContext } from "@/components/learning-hooks";
import { learningCatalog, learningChapters, programSlug } from "@/lib/learning-api";
import type { Membership } from "@/lib/dashboard-mock";

export function MiniCheckpointScreen({ membership = "sensei" }: { membership?: Membership } = {}) {
  const [selected, setSelected] = useState<{ level: string; chapterSlug: string }>();
  const [selectedLevel, setSelectedLevel] = useState("all");

  const load = useCallback(async (signal: AbortSignal) => {
    const catalog = await learningCatalog(signal);
    const groups = await Promise.all(
      catalog.programs
        .filter(program => ["n5", "n4", "n3", "n2"].includes(program.code))
        .map(async program => {
          const chapters = await learningChapters(program.id, signal);
          return Promise.all(
            chapters
              .filter(chapter => chapter.access !== "none")
              .map(chapter =>
                loadChapterContext(
                  programSlug(program.code),
                  `chapter-${chapter.chapter_number}`,
                  signal
                )
              )
          );
        })
    );
    return groups.flat().filter(context => context.chapter.mini_checkpoint?.exists);
  }, []);

  const catalog = useLearningRequest(load, "mini-checkpoints");

  if (selected) {
    return (
      <div data-membership={membership} className="mini-runner-container">
        <button
          className="sensei-back button button-secondary"
          type="button"
          onClick={() => setSelected(undefined)}
          style={{ marginBottom: "20px", display: "inline-flex", alignItems: "center", gap: "8px" }}
        >
          <LuArrowLeft aria-hidden="true" />
          <span>Kembali ke Daftar</span>
        </button>
        <ChapterAssessment {...selected} kind="mini" />
      </div>
    );
  }

  const items = (catalog.data ?? []).filter(context =>
    selectedLevel === "all" || context.program.code === selectedLevel
  );

  return (
    <div className="mini-checkpoint-page">
      <div className="mini-list-head">
        <header className="sensei-page-head">
          <p className="dash-kicker">MINI CHECKPOINT</p>
          <h1>Mini Checkpoint Evaluasi Bertahap</h1>
          <p>Evaluasi pemahaman terarah per chapter untuk menguji penguasaan materi.</p>
        </header>
      </div>

      <div className="mini-dropdown-container" style={{ margin: "20px 0" }}>
        <label htmlFor="mini-level-select" style={{ marginRight: "12px", fontWeight: 700 }}>
          Pilih Level:
        </label>
        <select
          id="mini-level-select"
          className="mini-level-dropdown"
          value={selectedLevel}
          onChange={(event) => setSelectedLevel(event.target.value)}
          style={{ padding: "8px 14px", borderRadius: "10px", border: "1px solid var(--line)" }}
        >
          <option value="all">Semua Level</option>
          <option value="n5">JLPT N5</option>
          <option value="n4">JLPT N4</option>
          <option value="n3">JLPT N3</option>
          <option value="n2">JLPT N2</option>
        </select>
      </div>

      {catalog.error && (
        <p role="alert">
          {catalog.error}
          <button type="button" onClick={catalog.retry}>Coba Lagi</button>
        </p>
      )}
      {catalog.loading && <p role="status">Memuat Mini Checkpoint…</p>}

      <section className="mini-vertical-cards-section" aria-label="Daftar Mini Checkpoint" style={{ display: "grid", gap: "16px" }}>
        {items.map(context => {
          const unlocked = context.progress.mini_unlocked;
          return (
            <article className="mini-checkpoint-card" key={`${context.program.id}/${context.chapter.id}`}>
              <div className="mini-checkpoint-card-left">
                <span className="mini-card-icon" aria-hidden="true">
                  <LuFileCheck />
                </span>
                <div>
                  <h3>{context.program.name} • Mini Checkpoint Chapter {context.chapter.chapter_number}</h3>
                  <p>
                    {context.chapter.title} • {unlocked ? "Seluruh aktivitas chapter telah selesai" : "Selesaikan seluruh aktivitas chapter untuk membuka"}
                  </p>
                </div>
              </div>
              <div className="mini-checkpoint-card-right">
                <span className={`mini-card-status-badge ${unlocked ? "tersedia" : "terkunci"}`}>
                  {unlocked ? "Tersedia" : "Terkunci"}
                </span>
                {unlocked ? (
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() =>
                      setSelected({
                        level: programSlug(context.program.code),
                        chapterSlug: `chapter-${context.chapter.chapter_number}`,
                      })
                    }
                  >
                    Mulai Mini Checkpoint
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button button-secondary disabled"
                    disabled
                  >
                    Terkunci
                  </button>
                )}
              </div>
            </article>
          );
        })}
        {!catalog.loading && items.length === 0 && (
          <section className="library-empty">
            <h2>Tidak ada Mini Checkpoint</h2>
            <p>Belum ada Mini Checkpoint yang tersedia untuk filter ini.</p>
          </section>
        )}
      </section>
    </div>
  );
}
