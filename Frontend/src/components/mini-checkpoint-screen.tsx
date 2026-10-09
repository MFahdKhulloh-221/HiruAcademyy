"use client";

import { useCallback, useState } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { LuFileCheck, LuArrowLeft } from "react-icons/lu";
import { ChapterAssessment } from "@/components/chapter-assessment";
import { useAuth } from "@/components/auth-provider";
import { useLearningRequest, type LearningCatalog } from "@/components/learning-hooks";
import { MiniLockedDialog } from "@/components/mini-locked-dialog";
import { learningCatalog, learningChapters, learningProgress, programSlug } from "@/lib/learning-api";
import type { Membership } from "@/lib/dashboard-mock";

export function MiniCheckpointScreen({ membership = "sensei", resolvedCatalog }: { membership?: Membership; resolvedCatalog?: LearningCatalog } = {}) {
  const { user } = useAuth();
  const [selection, setSelection] = useState<{ level: string; chapterSlug: string; identity: number | string }>();
  const selected = selection?.identity === user?.id ? selection : undefined;
  const [selectedLevel, setSelectedLevel] = useState("all");

  const load = useCallback(async (signal: AbortSignal) => {
    const catalog = resolvedCatalog ?? await learningCatalog(signal);
    const groups = await Promise.all(
      catalog.programs
        .filter(program => ["n5", "n4", "n3", "n2"].includes(program.code))
        .map(async program => {
          const chapters = await learningChapters(program.id, signal);
          return Promise.all(
            chapters
              .filter(chapter => chapter.mini_checkpoint?.exists)
              .map(async chapter => ({
                program,
                chapter,
                progress: ["full", "preview"].includes(chapter.access)
                  ? await learningProgress(program.id, chapter.id, signal)
                  : undefined,
              }))
          );
        })
    );
    return groups.flat().filter(context => context.chapter.mini_checkpoint?.exists);
  }, [resolvedCatalog]);

  const catalog = useLearningRequest(load, "mini-checkpoints");

  if (selected) {
    return (
      <div data-membership={membership} className="mini-runner-container">
        <button
          className="sensei-back button button-secondary"
          type="button"
          onClick={() => setSelection(undefined)}
          style={{ marginBottom: "20px", display: "inline-flex", alignItems: "center", gap: "8px" }}
        >
          <LuArrowLeft aria-hidden="true" />
          <span>Kembali ke Daftar</span>
        </button>
        <ChapterAssessment {...selected} resolvedCatalog={resolvedCatalog} kind="mini" />
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
      {!catalog.data && !catalog.error && <LoadingSkeleton variant="list" label="Memuat Mini Checkpoint…" />}

      <section className="mini-vertical-cards-section" aria-label="Daftar Mini Checkpoint" style={{ display: "grid", gap: "16px" }}>
        {items.map(context => {
          const unlocked = context.progress?.mini_unlocked ?? false;
          return (
            <article className="mini-checkpoint-card" key={`${context.program.id}/${context.chapter.id}`}>
              <div className="mini-checkpoint-card-left">
                <span className="mini-card-icon" aria-hidden="true">
                  <LuFileCheck />
                </span>
                <div>
                  <h3>{context.program.name} • Mini Checkpoint Chapter {context.chapter.chapter_number}</h3>
                  <p>
                    {context.chapter.title} • {unlocked ? "Seluruh aktivitas chapter telah selesai" : !["full", "preview"].includes(context.chapter.access) ? "Mini Checkpoint belum dapat dibuka karena chapter ini belum termasuk dalam akses belajarmu." : "Selesaikan seluruh aktivitas chapter untuk membuka"}
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
                    onClick={() => {
                      if (!user) return;
                      const level = programSlug(context.program.code);
                      const chapterSlug = `chapter-${context.chapter.chapter_number}`;
                      const url = new URL(window.location.href);
                      if (url.searchParams.get("mini_level") !== level || url.searchParams.get("mini_chapter") !== chapterSlug) url.searchParams.delete("attempt");
                      url.searchParams.set("mini_level", level);
                      url.searchParams.set("mini_chapter", chapterSlug);
                      window.history.replaceState(null, "", url);
                      setSelection({ level, chapterSlug, identity: user.id });
                    }}
                  >
                    Mulai Mini Checkpoint
                  </button>
                ) : (
                  <MiniLockedDialog access={context.chapter.access} progress={context.progress} chapterHref={`/learn/${programSlug(context.program.code)}/chapter-${context.chapter.chapter_number}`} />
                )}
              </div>
            </article>
          );
        })}
        {catalog.data && !catalog.error && items.length === 0 && (
          <section className="library-empty">
            <h2>Tidak ada Mini Checkpoint</h2>
            <p>Belum ada Mini Checkpoint yang tersedia untuk filter ini.</p>
          </section>
        )}
      </section>
    </div>
  );
}
