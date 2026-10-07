"use client";

import Link from "next/link";
import { useState } from "react";
import {
  LuBookMarked,
  LuBookOpen,
  LuLayers3,
  LuPenTool,
  LuSearch,
  LuVolume2,
} from "react-icons/lu";
import { StudentNavigation } from "@/components/student-navigation";
import { useLearningRequest } from "@/components/learning-hooks";
import { learningCatalog, learningLibrary, learningMembership, type LibraryModule } from "@/lib/learning-api";

async function loadLibrary(signal: AbortSignal) {
  const [catalog, modules] = await Promise.all([
    learningCatalog(signal),
    learningLibrary(signal),
  ]);
  return { ...catalog, modules };
}

export function LearningLibrary() {
  const request = useLearningRequest(loadLibrary, "library");
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState("Semua");
  const [type, setType] = useState("Semua");
  const [locked, setLocked] = useState(false);

  if (!request.data) {
    return (
      <main className="supporting-main">
        <p role={request.error ? "alert" : "status"}>{request.error ?? "Memuat materi…"}</p>
        {request.error && <button type="button" onClick={request.retry}>Coba Lagi</button>}
      </main>
    );
  }

  const membership = learningMembership(request.data.access);
  const query = `?membership=${membership}`;

  const visible = request.data.modules.filter((item: LibraryModule) => {
    const matchesLevel = level === "Semua" || item.level.toUpperCase() === level.toUpperCase();
    const matchesType = type === "Semua" || item.category === type;
    const queryStr = search.trim().toLowerCase();
    const matchesQuery = !queryStr || [item.title, item.description, item.category, item.level].some(
      val => (val ?? "").toLowerCase().includes(queryStr)
    );
    return matchesLevel && matchesType && matchesQuery;
  });

  return (
    <div className="supporting-shell student-shell">
      <StudentNavigation membership={membership} />
      <main className="supporting-main library-page">
        <header className="supporting-header">
          <p className="dash-kicker">PERPUSTAKAAN MATERI</p>
          <h1>Temukan kembali materi dari seluruh journey</h1>
          <p>Akses material mengikuti level dan entitlement membership.</p>
        </header>

        <div className="library-filter-bar">
          <label className="library-search">
            <span aria-hidden="true"><LuSearch /></span>
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Cari materi, tata bahasa, kanji, atau audio"
            />
          </label>
          <div className="library-dropdowns">
            <div className="library-select-item">
              <label htmlFor="library-level-select">Level</label>
              <select
                id="library-level-select"
                value={level}
                onChange={event => setLevel(event.target.value)}
              >
                {["Semua", "DASAR", "N5", "N4", "N3", "N2", "N1", "SSW"].map(lvl => (
                  <option key={lvl} value={lvl}>{lvl === "DASAR" ? "Dasar" : lvl}</option>
                ))}
              </select>
            </div>
            <div className="library-select-item">
              <label htmlFor="library-type-select">Kategori</label>
              <select
                id="library-type-select"
                value={type}
                onChange={event => setType(event.target.value)}
              >
                {["Semua", "Tata Bahasa", "Kanji", "Kosakata", "Audio", "Reading"].map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {visible.length > 0 ? (
          <>
            <section className="library-section-head">
              <h2>{level === "Semua" ? "Semua Materi" : level}</h2>
            </section>
            <section className="library-material-grid">
              {visible.map((item: LibraryModule) => {
                const Icon = item.category === "Kanji"
                  ? LuPenTool
                  : item.category === "Kosakata"
                  ? LuLayers3
                  : item.category === "Audio"
                  ? LuVolume2
                  : item.category === "Reading"
                  ? LuBookMarked
                  : LuBookOpen;

                return (
                  <article key={item.id}>
                    <div className="library-material-visual">
                      <small className="library-material-label">
                        <Icon aria-hidden="true" />
                        {item.category}
                      </small>
                      <span aria-hidden="true"><Icon /></span>
                    </div>
                    <div className="library-material-content">
                      <h2>{item.title}</h2>
                      <p>{item.description}</p>
                      <footer>
                        <small>{item.level}</small>
                        {item.locked ? (
                          <button
                            type="button"
                            onClick={() => setLocked(true)}
                            aria-label={`${item.category}: ${item.title}`}
                          >
                            Terkunci
                          </button>
                        ) : (
                          <Link
                            aria-label={`${item.category}: ${item.title}`}
                            href={`${item.href}${query}`}
                          >
                            Buka materi
                          </Link>
                        )}
                      </footer>
                    </div>
                  </article>
                );
              })}
            </section>
          </>
        ) : (
          <section className="library-empty" style={{ background: "#fff", border: 0, boxShadow: "none" }}>
            <h2>Materi yang kamu cari tidak ada</h2>
            <p>Ubah level, kategori, atau kata kunci untuk menemukan materi yang tersedia.</p>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setLevel("Semua");
                setType("Semua");
              }}
            >
              Reset Filter
            </button>
          </section>
        )}

        {locked && (
          <div className="library-locked" role="dialog" aria-modal="true" aria-labelledby="library-locked-title">
            <section>
              <p className="dash-kicker">CONTENT LOCKED</p>
              <h2 id="library-locked-title">Materi belum termasuk dalam aksesmu</h2>
              <p>Akses mengikuti level dan paket membership aktif. Progress yang sudah tersimpan tidak hilang.</p>
              <div>
                <Link href={`/membership${query}`}>Lihat Membership</Link>
                <button type="button" onClick={() => setLocked(false)}>Kembali ke Library</button>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
