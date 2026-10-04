"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { StudentNavigation } from "@/components/student-navigation";
import { ChapterAssessment } from "@/components/chapter-assessment";
import { useLearningRequest } from "@/components/learning-hooks";
import { learningCatalog, learningChapters, learningMembership, programSlug } from "@/lib/learning-api";
import type { Membership } from "@/lib/dashboard-mock";

const practiceCategories = ["Semua", "Kosakata", "Kanji", "Tata Bahasa", "Audio", "Reading"] as const;
type PracticeCat = (typeof practiceCategories)[number];

export function PracticeScreen({ membership }: { membership: Membership }) {
  const [selected, setSelected] = useState<{ level: string; chapterSlug: string; kind: "audio" | "reading" }>();
  const [category, setCategory] = useState<PracticeCat>("Semua");
  const [levelFilter, setLevelFilter] = useState<string>("all");

  const load = useCallback(async (signal: AbortSignal) => {
    const catalog = await learningCatalog(signal);
    const programs = catalog.programs.filter(program => program.family === "jlpt");
    const chapters = await Promise.all(programs.map(async program => ({ program, chapters: await learningChapters(program.id, signal) })));
    return { membership: learningMembership(catalog.access), chapters };
  }, []);

  const catalog = useLearningRequest(load, "practice-chapters");

  const filteredChapters = (catalog.data?.chapters ?? [])
    .filter(({ program }) => levelFilter === "all" || program.code.toLowerCase() === levelFilter.toLowerCase())
    .flatMap(({ program, chapters }) =>
      chapters
        .filter(chapter => chapter.access !== "none")
        .flatMap(chapter => {
          const kinds: { kind: PracticeCat; assessmentKind?: "audio" | "reading" }[] = [];
          if (category === "Semua" || category === "Audio") kinds.push({ kind: "Audio", assessmentKind: "audio" });
          if (category === "Semua" || category === "Reading") kinds.push({ kind: "Reading", assessmentKind: "reading" });
          if (category === "Semua" || category === "Kosakata") kinds.push({ kind: "Kosakata" });
          if (category === "Semua" || category === "Kanji") kinds.push({ kind: "Kanji" });
          if (category === "Semua" || category === "Tata Bahasa") kinds.push({ kind: "Tata Bahasa" });
          return kinds.map(({ kind, assessmentKind }) => ({
            program,
            chapter,
            kind,
            assessmentKind,
            key: `${program.id}/${chapter.id}/${kind}`,
          }));
        })
    );

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
        {catalog.loading && <p role="status">Memuat…</p>}

        {selected ? (
          <>
            <button type="button" className="practice-back" onClick={() => setSelected(undefined)}>
              Kembali ke Daftar Latihan
            </button>
            <ChapterAssessment {...selected} />
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

            <section className="practice-journey-list">
              {filteredChapters.map(({ program, chapter, kind, assessmentKind, key }) => (
                <article className="practice-journey-card" key={key}>
                  <div className="practice-journey-number">{String(chapter.chapter_number).padStart(2, "0")}</div>
                  <div className="practice-journey-copy">
                    <h2>{program.name} | {chapter.title} | {kind}</h2>
                    <p>Latihan interaktif harian untuk kategori {kind}.</p>
                  </div>
                  <div className="practice-journey-action">
                    {assessmentKind ? (
                      <button
                        type="button"
                        onClick={() =>
                          setSelected({
                            level: programSlug(program.code),
                            chapterSlug: `chapter-${chapter.chapter_number}`,
                            kind: assessmentKind,
                          })
                        }
                      >
                        Mulai Latihan
                      </button>
                    ) : (
                      <Link
                        href={`/learn/${programSlug(program.code)}/chapter-${chapter.chapter_number}${
                          kind === "Kosakata" ? "/flashcards" : ""
                        }`}
                        className="button"
                      >
                        Mulai Belajar
                      </Link>
                    )}
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
