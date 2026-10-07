"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LuBookOpen,
  LuChevronDown,
  LuCircleCheck,
  LuFlame,
  LuGraduationCap,
  LuLock,
  LuRotateCcw,
  LuSearch,
  LuSparkles,
} from "react-icons/lu";
import { StudentNavigation } from "@/components/student-navigation";
import { parseMembership } from "@/lib/dashboard-mock";
import { useLearningRequest } from "@/components/learning-hooks";
import { studentFlashcards, type FlashcardDeck } from "@/lib/learning-api";

export function FlashcardCollection() {
  const membership = parseMembership(useSearchParams().get("membership") ?? undefined);
  const request = useLearningRequest(studentFlashcards, "student-flashcards");

  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "level" | "chapter" | "review">("all");
  const [selectedLevel, setSelectedLevel] = useState("N5");
  const [selectedChapter, setSelectedChapter] = useState("Chapter 1");
  const [levelOpen, setLevelOpen] = useState(false);
  const [chapterOpen, setChapterOpen] = useState(false);

  const query = `?membership=${membership}`;

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (!target.closest(".fc-dropdown-wrap")) {
        setLevelOpen(false);
        setChapterOpen(false);
      }
    }
    document.addEventListener("click", handleOutside);
    return () => document.removeEventListener("click", handleOutside);
  }, []);

  const decks: FlashcardDeck[] = request.data?.decks ?? [];
  const metrics = request.data?.metrics ?? {
    cards_studied: 0,
    cards_available: 0,
    decks_completed: 0,
    streak_days: 0,
  };

  const summaryMetrics = [
    {
      label: "KARTU DIPELAJARI",
      value: String(metrics.cards_studied),
      note: metrics.cards_studied > 0 ? "Dari deck yang selesai" : "Belum ada kartu selesai",
      icon: LuBookOpen,
    },
    {
      label: "TOTAL KARTU TERSEDIA",
      value: String(metrics.cards_available),
      note: "Kartu dalam aksesmu",
      icon: LuRotateCcw,
    },
    {
      label: "DECK SELESAI",
      value: String(metrics.decks_completed),
      note: "Selesai dipelajari",
      icon: LuCircleCheck,
    },
    {
      label: "KONSISTENSI",
      value: `${metrics.streak_days} hari`,
      note: metrics.streak_days > 0 ? "Tetap konsisten" : "Mulai belajar hari ini",
      icon: LuFlame,
    },
  ];

  const visible = decks.filter((deck) => {
    const matchesSearch = `${deck.chapter_number} ${deck.title} ${deck.category} ${deck.level}`
      .toLowerCase()
      .includes(search.toLowerCase());
    if (!matchesSearch) return false;

    if (filterMode === "all") return true;
    if (filterMode === "review") {
      return deck.action === "Review" || (deck.progress > 0 && deck.progress < 100);
    }
    if (filterMode === "level") {
      return deck.level === selectedLevel;
    }
    if (filterMode === "chapter") {
      return `Chapter ${deck.chapter_number}` === selectedChapter;
    }
    return true;
  });

  return (
    <div className="supporting-shell student-shell">
      <StudentNavigation membership={membership} />
      <main className="supporting-main flashcard-collection">
        {request.error && (
          <p role="alert">
            {request.error}
            <button type="button" onClick={request.retry}>Coba Lagi</button>
          </p>
        )}
        {request.loading && <p role="status">Memuat flashcard…</p>}

        {/* 1. Summary Statistics */}
        <section className="fc-summary-grid" aria-label="Ringkasan Flashcard">
          {summaryMetrics.map((item) => {
            const Icon = item.icon;
            return (
              <article className="fc-summary-card" key={item.label}>
                <div className="fc-summary-top">
                  <span className="fc-summary-icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <span className="fc-summary-label">{item.label}</span>
                </div>
                <div className="fc-summary-body">
                  <strong className="fc-summary-val">{item.value}</strong>
                  <small className="fc-summary-note">{item.note}</small>
                </div>
              </article>
            );
          })}
        </section>

        {/* 2. Search + Filters */}
        <section className="fc-toolbar" aria-label="Pencarian dan Filter Deck">
          <label className="fc-search-wrap">
            <span className="fc-search-icon" aria-hidden="true">
              <LuSearch />
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search deck, chapter, kosakata..."
              aria-label="Cari deck, chapter, atau kosakata"
            />
          </label>

          <div className="fc-filter-pills" role="toolbar" aria-label="Filter kategori deck">
            <button
              className={`fc-filter-pill${filterMode === "all" ? " active" : ""}`}
              type="button"
              onClick={() => {
                setFilterMode("all");
                setLevelOpen(false);
                setChapterOpen(false);
              }}
            >
              Semua Deck
            </button>

            {/* Dropdown Level */}
            <div className="fc-dropdown-wrap">
              <button
                className={`fc-filter-pill fc-dropdown-btn${filterMode === "level" ? " active" : ""}`}
                type="button"
                onClick={() => {
                  setLevelOpen(!levelOpen);
                  setChapterOpen(false);
                }}
                aria-haspopup="listbox"
                aria-expanded={levelOpen}
              >
                <span>{selectedLevel}</span>
                <LuChevronDown className={`fc-chevron${levelOpen ? " open" : ""}`} aria-hidden="true" />
              </button>
              {levelOpen && (
                <div className="fc-dropdown-menu" role="listbox">
                  {["DASAR", "N5", "N4", "N3", "N2", "N1"].map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      role="option"
                      aria-selected={selectedLevel === lvl && filterMode === "level"}
                      className={`fc-dropdown-item${selectedLevel === lvl && filterMode === "level" ? " is-selected" : ""}`}
                      onClick={() => {
                        setSelectedLevel(lvl);
                        setFilterMode("level");
                        setLevelOpen(false);
                      }}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Dropdown Chapter */}
            <div className="fc-dropdown-wrap">
              <button
                className={`fc-filter-pill fc-dropdown-btn${filterMode === "chapter" ? " active" : ""}`}
                type="button"
                onClick={() => {
                  setChapterOpen(!chapterOpen);
                  setLevelOpen(false);
                }}
                aria-haspopup="listbox"
                aria-expanded={chapterOpen}
              >
                <span>{selectedChapter}</span>
                <LuChevronDown className={`fc-chevron${chapterOpen ? " open" : ""}`} aria-hidden="true" />
              </button>
              {chapterOpen && (
                <div className="fc-dropdown-menu" role="listbox">
                  {["Chapter 1", "Chapter 2", "Chapter 3", "Chapter 4"].map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      role="option"
                      aria-selected={selectedChapter === ch && filterMode === "chapter"}
                      className={`fc-dropdown-item${selectedChapter === ch && filterMode === "chapter" ? " is-selected" : ""}`}
                      onClick={() => {
                        setSelectedChapter(ch);
                        setFilterMode("chapter");
                        setChapterOpen(false);
                      }}
                    >
                      {ch}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              className={`fc-filter-pill${filterMode === "review" ? " active" : ""}`}
              type="button"
              onClick={() => {
                setFilterMode("review");
                setLevelOpen(false);
                setChapterOpen(false);
              }}
            >
              Perlu Diulang
            </button>
          </div>
        </section>

        {/* 3. Deck Grid */}
        <section aria-label="Daftar Deck Flashcard">
          <div className="fc-deck-grid">
            {visible.length === 0 ? (
              <div className="fc-empty-state">
                <p>Tidak ada deck yang sesuai dengan filter.</p>
                <button
                  type="button"
                  className="fc-filter-pill active"
                  onClick={() => {
                    setSearch("");
                    setFilterMode("all");
                    setSelectedLevel("N5");
                    setSelectedChapter("Chapter 1");
                  }}
                >
                  Reset Filter
                </button>
              </div>
            ) : (
              visible.map((deck) => {
                return (
                  <article className={`fc-deck-card${deck.locked ? " is-locked" : ""}`} key={`${deck.program_code}-${deck.chapter_number}`}>
                    <span className="fc-deck-glyph" aria-hidden="true">
                      {deck.glyph}
                    </span>

                    <div className="fc-deck-header">
                      <div className="fc-deck-title-area">
                        <h2 className="fc-deck-title">{deck.title}</h2>
                        <div className="fc-deck-meta">
                          <span className="fc-meta-badge fc-cat-badge">{deck.level} • {deck.category}</span>
                        </div>
                      </div>
                      <span className="fc-meta-badge fc-count-badge">{deck.card_count} Kartu</span>
                    </div>

                    <p className="fc-deck-desc">{deck.description}</p>

                    <div className="fc-deck-progress-row">
                      <div
                        className="fc-deck-progress-track"
                        role="progressbar"
                        aria-valuenow={deck.progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div className="fc-deck-progress-fill" style={{ width: `${deck.progress}%` }} />
                      </div>
                      <span className="fc-deck-progress-pct">{deck.progress}%</span>
                    </div>

                    <div className="fc-deck-action-row">
                      {deck.locked ? (
                        <span className="fc-deck-btn is-disabled">
                          <LuLock aria-hidden="true" /> Terkunci
                        </span>
                      ) : (
                        <Link
                          className="fc-deck-btn"
                          href={`${deck.href}${query}`}
                        >
                          {deck.cta_label}
                        </Link>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>

        {/* 4. Sensei Access Banner */}
        <aside className="fc-sensei-banner" aria-label="Informasi Akses Member">
          <div className="fc-sensei-banner-content">
            <div className="fc-sensei-banner-icon" aria-hidden="true">
              {membership === "sensei" ? (
                <LuGraduationCap />
              ) : membership === "lms" ? (
                <LuSparkles />
              ) : (
                <LuLock />
              )}
            </div>
            <div className="fc-sensei-banner-text">
              <h3>
                {membership === "free"
                  ? "Akses Free Member"
                  : membership === "lms"
                  ? "Akses Belajar Mandiri"
                  : "Akses Belajar dengan Sensei"}
              </h3>
              <p>
                {membership === "free"
                  ? "Buka akses ke semua deck chapter dan nikmati bimbingan materi intensif."
                  : "Buka akses tak terbatas ke semua deck dan bimbingan langsung bersama Sensei."}
              </p>
            </div>
          </div>
          <Link
            className="fc-sensei-banner-btn"
            href={membership === "free" ? `/membership${query}` : `/progress${query}`}
          >
            {membership === "free" ? "Pelajari Lebih Lanjut" : "Lihat Progress"}
          </Link>
        </aside>
      </main>
    </div>
  );
}
