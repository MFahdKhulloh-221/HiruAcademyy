"use client";

import { useState, useCallback, useEffect } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { StudentNavigation } from "@/components/student-navigation";
import { ChapterAssessment } from "@/components/chapter-assessment";
import { useLearningRequest, type LearningCatalog } from "@/components/learning-hooks";
import { learningDashboard, learningMembership, programSlug } from "@/lib/learning-api";
import { practiceActivities } from "@/lib/practice-catalog";
import type { Membership } from "@/lib/dashboard-mock";
import { chapterAttemptPath, readAttempt } from "@/lib/assessment-attempt";
import { ApiError } from "@/lib/api";

const practiceCategories = ["Semua", "Audio", "Reading"] as const;
type PracticeCat = (typeof practiceCategories)[number];

export function PracticeScreen({ membership, resolvedCatalog }: { membership: Membership; resolvedCatalog?: LearningCatalog }) {
  void resolvedCatalog;
  const [selected, setSelected] = useState<{ level: string; chapterSlug: string; kind: "audio" | "reading" }>();
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const level = params.get("practice_level");
      const chapterSlug = params.get("practice_chapter");
      const kind = params.get("practice_kind");
      if (level && chapterSlug && /^chapter-[1-9]\d*$/.test(chapterSlug) && (kind === "audio" || kind === "reading")) {
        setSelected({ level, chapterSlug, kind });
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const [category, setCategory] = useState<PracticeCat>("Semua");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const category = params.get("category");
      const level = params.get("level");
      if (category === "reading" || category === "audio") setCategory(category === "reading" ? "Reading" : "Audio");
      if (level && /^(n[1-5]|dasar)$/.test(level)) setLevelFilter(level);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const load = useCallback(async (signal: AbortSignal) => {
    const dashboard = await learningDashboard(signal);
    const catalog = dashboard.catalog;
    const chapters = catalog.programs.filter(program => program.family === "jlpt").map(program => ({ program, chapters: dashboard.chapters.filter(item => item.program.id === program.id).map(item => item.chapter) }));
    const params = new URLSearchParams(window.location.search);
    const id = params.get("attempt");
    let restored: { level: string; chapterSlug: string; kind: "audio" | "reading" } | undefined;
    if (id && !params.has("practice_chapter")) {
      if (!/^[1-9]\d*$/.test(id)) throw new ApiError(404);
      for (const { program, chapters: items } of chapters) {
        for (const chapter of items.filter(item => ["full", "preview"].includes(item.access))) {
          try {
            const attempt = await readAttempt(`${chapterAttemptPath(program.id, chapter.id)}/${id}`, signal);
            if (String(attempt.id) !== id || attempt.chapter_id !== chapter.id || (attempt.kind !== "audio" && attempt.kind !== "reading")) throw new ApiError(404);
            restored = { level: programSlug(program.code), chapterSlug: `chapter-${chapter.chapter_number}`, kind: attempt.kind };
            break;
          } catch (error) {
            signal.throwIfAborted();
            if (!(error instanceof ApiError) || error.status !== 404) throw error;
          }
        }
        if (restored) break;
      }
      if (!restored) throw new ApiError(404);
    }
    return { membership: learningMembership(catalog.access), activities: practiceActivities(dashboard), restored };
  }, []);

  const catalog = useLearningRequest(load, "practice-chapters");
  useEffect(() => {
    if (!catalog.data?.restored) return;
    const restored = catalog.data.restored;
    const timer = window.setTimeout(() => setSelected(restored), 0);
    return () => window.clearTimeout(timer);
  }, [catalog.data]);

  const filteredChapters = (catalog.data?.activities ?? [])
    .filter(item => levelFilter === "all" || item.program.code === levelFilter)
    .filter(item => category === "Semua" || item.kind === category.toLowerCase());

  return (
    <div className="supporting-shell student-shell">
      <StudentNavigation membership={catalog.data?.membership ?? membership} />
      <main className="supporting-main practice-page practice-flow">
        <header className="practice-header">
          <div>
            <h1>Latihan Harian</h1>
            <p>“Tingkatkan kemampuan bahasa Jepang Anda hari ini.”</p>
          </div>
        </header>

        {catalog.error && (
          <p role="alert">
            {catalog.error}
            <button type="button" onClick={catalog.retry}>Coba Lagi</button>
          </p>
        )}
        {!catalog.data && !catalog.error && <LoadingSkeleton variant="cards" label="Memuat…" />}

        {selected ? (
          <>
            {selected.kind !== "audio" && <button type="button" className="practice-back" onClick={() => {
              setSelected(undefined);
              catalog.retry();
              const url = new URL(window.location.href);
              for (const key of ["practice_level", "practice_chapter", "practice_kind", "attempt", "start"]) url.searchParams.delete(key);
              window.history.replaceState(null, "", url);
            }}>
              Kembali ke Daftar Latihan
            </button>}
            <ChapterAssessment {...selected} autoStart />
          </>
        ) : (
          <>
            <div className="practice-toolbar w-full max-w-full min-w-0 flex flex-wrap gap-4 items-center justify-between my-4">
              <div className="practice-category-tabs w-full max-w-full min-w-0 flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Kategori Latihan">
                {practiceCategories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    role="tab"
                    aria-selected={category === cat}
                    className={`practice-category-tab shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                      category === cat ? "active bg-[#2E3344] text-white" : "bg-white border text-gray-700 hover:bg-gray-100"
                    }`}
                    onClick={() => setCategory(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <div className="practice-level-filter shrink-0">
                <label htmlFor="practice-level-select" className="sr-only">Filter Level</label>
                <select
                  id="practice-level-select"
                  aria-label="Filter Level JLPT"
                  value={levelFilter}
                  onChange={(e) => setLevelFilter(e.target.value)}
                  className="border rounded-lg px-3 py-1.5 text-sm bg-white"
                >
                  <option value="all">Semua Level</option>
                  <option value="n5">JLPT N5</option>
                  <option value="n4">JLPT N4</option>
                  <option value="n3">JLPT N3</option>
                  <option value="n2">JLPT N2</option>
                  <option value="n1">JLPT N1</option>
                </select>
              </div>
            </div>

            {catalog.data && filteredChapters.length === 0 && <p role="status">Belum ada latihan soal yang tersedia untuk akses dan filter ini.</p>}
            <section className="practice-journey-list">
              {filteredChapters.map(({ program, chapter, kind, activity, id }) => (
                <article className="practice-journey-card" key={id}>
                  <div className="practice-journey-number">{String(chapter.chapter_number).padStart(2, "0")}</div>
                  <div className="practice-journey-copy">
                    <h2>{program.name} | {chapter.title} | {kind === "audio" ? "Audio" : "Reading"}</h2>
                    <p>{activity.completed}/{activity.total} soal selesai ? {activity.complete ? "Selesai" : activity.completed > 0 ? "Dalam pengerjaan" : "Belum dikerjakan"}</p>
                  </div>
                  <div className="practice-journey-action">
                    <button
                        type="button"
                        className="button button-primary"
                        onClick={() => {
                          const selection = { level: programSlug(program.code), chapterSlug: `chapter-${chapter.chapter_number}`, kind };
                          const url = new URL(window.location.href);
                          url.searchParams.set("practice_level", selection.level);
                          url.searchParams.set("practice_chapter", selection.chapterSlug);
                          url.searchParams.set("practice_kind", selection.kind);
                          url.searchParams.delete("attempt");
                          window.history.replaceState(null, "", url);
                          setSelected(selection);
                        }}
                      >
                        {activity.complete ? "Latihan Lagi" : "Kerjakan Latihan"}
                      </button>

                  </div>
                </article>
              ))}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
