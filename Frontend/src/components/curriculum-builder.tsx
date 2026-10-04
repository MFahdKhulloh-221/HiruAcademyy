"use client";

import Link from "next/link";
import { AdminCanonicalCurriculum } from "@/components/admin-canonical-curriculum";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { AdminShell } from "@/components/admin-shell";
import {
  AdminBreadcrumb,
  AdminConfirmDialog,
  AdminDataTable,
  AdminDialog,
  AdminPageHeader,
  AdminStatusBadge,
  AdminTabs,
} from "@/components/admin-primitives";
import {
  createChapter,
  createFlashcardCard,
  createFlashcardDeck,
  createLibraryMaterial,
  createReplay,
  deleteChapter,
  deleteFlashcardDeck,
  deleteLibraryMaterial,
  deleteReplay,
  extractYouTubeVideoId,
  libraryMaterialTypes,
  programCodes,
  saveChapter,
  saveFlashcardDeck,
  saveLibraryMaterial,
  saveReplay,
  useCurriculumStore,
  type Chapter,
  type ChapterStatus,
  type FlashcardCard,
  type FlashcardDeck,
  type FlashcardDeckStatus,
  type LibraryMaterial,
  type LibraryMaterialStatus,
  type LibraryMaterialType,
  type ProgramCode,
  type ReplayRecord,
  type ReplayStatus,
} from "@/lib/admin-curriculum-store";
import { readAssessments } from "@/lib/admin-assessment-store";

const mainTabs = [
  "Kurikulum",
  "Flashcard",
  "Perpustakaan Materi",
  "Replay Rekaman",
] as const;
type MainTab = (typeof mainTabs)[number];

export function CurriculumBuilder() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab") as MainTab | null;
  const currentTab: MainTab =
    rawTab && mainTabs.includes(rawTab) ? rawTab : "Kurikulum";

  function setTab(tab: string) {
    router.replace(`/admin/kurikulum-materi?tab=${encodeURIComponent(tab)}`);
  }

  return (
    <AdminShell current="/admin/kurikulum-materi">
      <main className="admin-page curriculum-admin-page">
        <AdminBreadcrumb
          items={[
            { label: "Admin", href: "/admin" },
            { label: "Kurikulum & Materi" },
            ...(currentTab !== "Kurikulum" ? [{ label: currentTab }] : []),
          ]}
        />
        <AdminPageHeader
          eyebrow="ADMIN • CONTENT STUDIO"
          title="Kurikulum & Materi"
          description="Pusat pengelolaan silabus chapter, dek flashcard interaktif, materi referensi, dan rekaman kelas bimbingan."
        />

        <AdminTabs
          tabs={mainTabs}
          active={currentTab}
          onChange={setTab}
          label="Menu Kurikulum & Materi"
        >
          {currentTab === "Kurikulum" && <AdminCanonicalCurriculum nested />}
          {currentTab === "Flashcard" && <AdminCanonicalCurriculum flashcards nested />}
          {currentTab === "Perpustakaan Materi" && <div className="library-tab-content"><Link href="/admin/modul">Modul</Link><p>Perpustakaan Materi mengikuti modul published pada chapter.</p></div>}
          {currentTab === "Replay Rekaman" && <ReplayTab />}
        </AdminTabs>
      </main>
    </AdminShell>
  );
}

export function CurriculumTab() {
  const { store, refresh } = useCurriculumStore();
  const [selectedProgram, setSelectedProgram] = useState<ProgramCode>("N5");
  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Chapter | null>(null);

  const chapters = store.chapters
    .filter((c) => c.programCode === selectedProgram)
    .sort((a, b) => a.order - b.order);

  function handleReorder(index: number, delta: number) {
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= chapters.length) return;
    const current = chapters[index];
    const target = chapters[targetIndex];
    const prevOrder = current.order;
    current.order = target.order;
    target.order = prevOrder;
    saveChapter(current);
    saveChapter(target);
    refresh();
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteChapter(deleteTarget.id);
    refresh();
    setDeleteTarget(null);
  }

  if (editingChapter) {
    return (
      <ChapterEditor
        chapter={editingChapter}
        onBack={() => {
          setEditingChapter(null);
          refresh();
        }}
      />
    );
  }

  return (
    <div className="curriculum-tab-content">
      <div className="curriculum-header-bar">
        <label className="program-select-label">
          <span>Pilih Program:</span>
          <select
            value={selectedProgram}
            onChange={(e) => setSelectedProgram(e.target.value as ProgramCode)}
          >
            {programCodes.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="button button-primary"
          onClick={() => {
            const nextOrder = chapters.length + 1;
            const newChapter = createChapter(selectedProgram);
            newChapter.order = nextOrder;
            newChapter.title = `Chapter ${nextOrder}`;
            newChapter.slug = `chapter-${nextOrder}`;
            setEditingChapter(newChapter);
          }}
        >
          + Tambah Chapter
        </button>
      </div>

      {selectedProgram === "INTERVIEW" && chapters.length === 0 && (
        <div className="admin-notice-banner" role="alert">
          <p>
            <strong>Struktur program belum dikonfigurasi</strong>
          </p>
          <small>
            Program Interview belum memiliki susunan chapter. Tambahkan chapter
            pertama untuk mulai menyusun alur bimbingan.
          </small>
        </div>
      )}

      <AdminDataTable
        caption={`Daftar Chapter ${selectedProgram}`}
        rows={chapters}
        rowKey={(row) => row.id}
        empty={`Belum ada chapter untuk program ${selectedProgram}.`}
        columns={[
          {
            key: "order",
            header: "Urutan",
            cell: (row) => <span className="order-pill">#{row.order}</span>,
          },
          {
            key: "title",
            header: "Judul Chapter",
            cell: (row) => (
              <div>
                <strong>{row.title || "Tanpa Judul"}</strong>
                <small>/{row.slug}</small>
              </div>
            ),
          },
          {
            key: "sectionsCount",
            header: "Konten Aktif",
            cell: (row) => {
              const count = [
                row.videoUrl,
                row.pdfUrl,
                row.flashcardDeckId,
                row.audioUrl,
                row.readingTitle || row.readingPassage,
                row.checkpointAssessmentId,
              ].filter(Boolean).length;
              return <span>{count} bagian aktif</span>;
            },
          },
          {
            key: "status",
            header: "Status",
            cell: (row) => <AdminStatusBadge status={row.status} />,
          },
        ]}
        actions={{
          header: "Aksi",
          cell: (row) => {
            const index = chapters.findIndex((c) => c.id === row.id);
            return (
              <div className="table-action-buttons">
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={index === 0}
                  onClick={() => handleReorder(index, -1)}
                  aria-label="Naikkan urutan"
                >
                  ↑ Naik
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={index === chapters.length - 1}
                  onClick={() => handleReorder(index, 1)}
                  aria-label="Turunkan urutan"
                >
                  ↓ Turun
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setEditingChapter(row)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setDeleteTarget(row)}
                >
                  Hapus
                </button>
              </div>
            );
          },
        }}
      />

      <AdminConfirmDialog
        open={Boolean(deleteTarget)}
        title="Hapus Chapter?"
        close={() => setDeleteTarget(null)}
        actions={
          <>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setDeleteTarget(null)}
            >
              Batal
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={handleDelete}
            >
              Hapus
            </button>
          </>
        }
      >
        <p>
          Apakah Anda yakin ingin menghapus chapter{" "}
          <strong>{deleteTarget?.title}</strong>? Seluruh referensi terkait
          chapter ini akan dihapus.
        </p>
      </AdminConfirmDialog>
    </div>
  );
}

function ChapterEditor({
  chapter: initialChapter,
  onBack,
}: {
  chapter: Chapter;
  onBack: () => void;
}) {
  const { store } = useCurriculumStore();
  const [chapter, setChapter] = useState<Chapter>(initialChapter);
  const [activeOutline, setActiveOutline] = useState<string>("informasi");
  const [mobileTab, setMobileTab] = useState<"Outline" | "Editor">("Editor");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const isNLevel = ["N5", "N4", "N3", "N2"].includes(chapter.programCode);
  const isDasarSsw = ["DASAR", "SSW"].includes(chapter.programCode);

  const publishedCheckpoints = readAssessments().filter(
    (a) => a.type === "checkpoint"
  );
  const availableDecks = store.flashcardDecks.filter(
    (d) => d.programCode === chapter.programCode
  );

  function patch(values: Partial<Chapter>) {
    setChapter((prev) => ({ ...prev, ...values }));
  }

  function validate() {
    const list: string[] = [];
    if (!chapter.title.trim()) list.push("Judul chapter wajib diisi.");
    if (!chapter.slug.trim()) list.push("Slug chapter wajib diisi.");
    setErrors(list);
    return list.length === 0;
  }

  function handleSave(status: ChapterStatus) {
    if (status === "Published" && !validate()) return;
    const item: Chapter = { ...chapter, status };
    saveChapter(item);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  }

  return (
    <div className="chapter-editor-container">
      <div className="editor-top-nav">
        <button type="button" className="back-link" onClick={onBack}>
          ← Kembali ke Daftar Chapter
        </button>
        <div className="publication-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setPreviewOpen(true)}
          >
            Preview
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => handleSave("Draft")}
          >
            Simpan Draft
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => handleSave("Published")}
          >
            Terbitkan
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div className="admin-save-toast" role="status">
          Chapter berhasil disimpan.
        </div>
      )}

      {errors.length > 0 && (
        <div className="assessment-validation" role="alert">
          <strong>Chapter belum dapat diterbitkan:</strong>
          <ul>
            {errors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="weight-info-box" role="region" aria-label="Bobot Progres Siswa">
        <h4>Bobot Progress Siswa (Read-Only)</h4>
        {isDasarSsw && (
          <p>
            Dasar &amp; SSW: <strong>Video 25%</strong>,{" "}
            <strong>Modul PDF 25%</strong>, <strong>Flashcard 25%</strong>,{" "}
            <strong>Checkpoint 25%</strong>.
          </p>
        )}
        {isNLevel && (
          <p>
            JLPT N5–N2: <strong>Video 20%</strong>,{" "}
            <strong>Modul PDF 5%</strong>, <strong>Flashcard 20%</strong>,{" "}
            <strong>Audio 20%</strong>, <strong>Reading 20%</strong>,{" "}
            <strong>Checkpoint 15%</strong>.
          </p>
        )}
        {chapter.programCode === "INTERVIEW" && (
          <p>Struktur fleksibel untuk persiapan simulasi wawancara kerja.</p>
        )}
      </div>

      <div className="assessment-mobile-tabs">
        <button
          type="button"
          className={mobileTab === "Outline" ? "active" : ""}
          onClick={() => setMobileTab("Outline")}
        >
          Outline
        </button>
        <button
          type="button"
          className={mobileTab === "Editor" ? "active" : ""}
          onClick={() => setMobileTab("Editor")}
        >
          Editor
        </button>
      </div>

      <div className="chapter-workspace">
        <aside
          className={`chapter-outline-menu ${
            mobileTab === "Outline" ? "mobile-active" : ""
          }`}
        >
          <nav aria-label="Outline Chapter">
            <button
              type="button"
              className={activeOutline === "informasi" ? "active" : ""}
              onClick={() => {
                setActiveOutline("informasi");
                setMobileTab("Editor");
              }}
            >
              1. Informasi
            </button>
            <button
              type="button"
              className={activeOutline === "video" ? "active" : ""}
              onClick={() => {
                setActiveOutline("video");
                setMobileTab("Editor");
              }}
            >
              2. Video Pembelajaran
            </button>
            <button
              type="button"
              className={activeOutline === "pdf" ? "active" : ""}
              onClick={() => {
                setActiveOutline("pdf");
                setMobileTab("Editor");
              }}
            >
              3. Modul PDF
            </button>
            <button
              type="button"
              className={activeOutline === "flashcard" ? "active" : ""}
              onClick={() => {
                setActiveOutline("flashcard");
                setMobileTab("Editor");
              }}
            >
              4. Flashcard Deck
            </button>
            {isNLevel && (
              <>
                <button
                  type="button"
                  className={activeOutline === "audio" ? "active" : ""}
                  onClick={() => {
                    setActiveOutline("audio");
                    setMobileTab("Editor");
                  }}
                >
                  5. Audio (Choukai)
                </button>
                <button
                  type="button"
                  className={activeOutline === "reading" ? "active" : ""}
                  onClick={() => {
                    setActiveOutline("reading");
                    setMobileTab("Editor");
                  }}
                >
                  6. Reading (Dokkai)
                </button>
              </>
            )}
            <button
              type="button"
              className={activeOutline === "checkpoint" ? "active" : ""}
              onClick={() => {
                setActiveOutline("checkpoint");
                setMobileTab("Editor");
              }}
            >
              {isNLevel ? "7. Checkpoint" : "5. Checkpoint"}
            </button>
          </nav>
        </aside>

        <section
          className={`chapter-editor-panel ${
            mobileTab === "Editor" ? "mobile-active" : ""
          }`}
        >
          {activeOutline === "informasi" && (
            <div className="editor-card">
              <h3>Informasi Chapter</h3>
              <div className="form-grid">
                <label>
                  <span>Judul Chapter</span>
                  <input
                    type="text"
                    value={chapter.title}
                    onChange={(e) => patch({ title: e.target.value })}
                    placeholder="contoh: Hiragana & Pelafalan Dasar"
                  />
                </label>
                <label>
                  <span>Slug URL</span>
                  <input
                    type="text"
                    value={chapter.slug}
                    onChange={(e) => patch({ slug: e.target.value })}
                    placeholder="contoh: chapter-1"
                  />
                </label>
              </div>
              <div className="form-grid">
                <label>
                  <span>Urutan Chapter</span>
                  <input
                    type="number"
                    min={1}
                    value={chapter.order}
                    onChange={(e) =>
                      patch({ order: Number(e.target.value) || 1 })
                    }
                  />
                </label>
                <label>
                  <span>Status Publikasi</span>
                  <select
                    value={chapter.status}
                    onChange={(e) =>
                      patch({ status: e.target.value as ChapterStatus })
                    }
                  >
                    <option value="Draft">Draft</option>
                    <option value="Published">Terbit</option>
                  </select>
                </label>
              </div>
              <label>
                <span>Deskripsi Singkat</span>
                <textarea
                  rows={3}
                  value={chapter.description}
                  onChange={(e) => patch({ description: e.target.value })}
                  placeholder="Ringkasan target pembelajaran di chapter ini..."
                />
              </label>
            </div>
          )}

          {activeOutline === "video" && (
            <div className="editor-card">
              <h3>Materi Video</h3>
              <label>
                <span>URL Video (YouTube / Embed)</span>
                <input
                  type="url"
                  value={chapter.videoUrl}
                  onChange={(e) => patch({ videoUrl: e.target.value })}
                  placeholder="https://www.youtube.com/watch?v=..."
                />
              </label>
              <label>
                <span>Estimasi Durasi Video (Menit)</span>
                <input
                  type="number"
                  min={0}
                  value={chapter.videoDuration}
                  onChange={(e) =>
                    patch({ videoDuration: Number(e.target.value) || 0 })
                  }
                />
              </label>
            </div>
          )}

          {activeOutline === "pdf" && (
            <div className="editor-card">
              <h3>Modul Dokumen PDF</h3>
              <label>
                <span>Judul Dokumen PDF</span>
                <input
                  type="text"
                  value={chapter.pdfTitle}
                  onChange={(e) => patch({ pdfTitle: e.target.value })}
                  placeholder="contoh: Modul Tata Bahasa Lengkap"
                />
              </label>
              <label>
                <span>URL / Path Dokumen PDF</span>
                <input
                  type="text"
                  value={chapter.pdfUrl}
                  onChange={(e) => patch({ pdfUrl: e.target.value })}
                  placeholder="/materials/n5-c1-tata-bahasa.pdf"
                />
              </label>
            </div>
          )}

          {activeOutline === "flashcard" && (
            <div className="editor-card">
              <h3>Flashcard Deck Terkait</h3>
              <label>
                <span>Pilih Flashcard Deck:</span>
                <select
                  value={chapter.flashcardDeckId || ""}
                  onChange={(e) =>
                    patch({ flashcardDeckId: e.target.value || undefined })
                  }
                >
                  <option value="">(Tidak ada flashcard deck terhubung)</option>
                  {availableDecks.map((deck) => (
                    <option key={deck.id} value={deck.id}>
                      {deck.title} ({deck.cards.length} kartu) - [{deck.status}]
                    </option>
                  ))}
                </select>
              </label>
              <p className="field-hint">
                Flashcard membantu siswa menghafal kosakata sebelum mengerjakan
                latihan checkpoint.
              </p>
            </div>
          )}

          {isNLevel && activeOutline === "audio" && (
            <div className="editor-card">
              <h3>Audio Choukai (Khusus N5–N2)</h3>
              <label>
                <span>Judul Audio Soal</span>
                <input
                  type="text"
                  value={chapter.audioTitle}
                  onChange={(e) => patch({ audioTitle: e.target.value })}
                  placeholder="contoh: Choukai Perkenalan Diri"
                />
              </label>
              <label>
                <span>URL / Path File Audio</span>
                <input
                  type="text"
                  value={chapter.audioUrl}
                  onChange={(e) => patch({ audioUrl: e.target.value })}
                  placeholder="/audio/n5-c1-choukai.mp3"
                />
              </label>
            </div>
          )}

          {isNLevel && activeOutline === "reading" && (
            <div className="editor-card">
              <h3>Reading Dokkai (Khusus N5–N2)</h3>
              <label>
                <span>Judul Bacaan</span>
                <input
                  type="text"
                  value={chapter.readingTitle}
                  onChange={(e) => patch({ readingTitle: e.target.value })}
                  placeholder="contoh: Teks Bacaan Jikoshoukai"
                />
              </label>
              <label>
                <span>Teks Bacaan (Passage)</span>
                <textarea
                  rows={5}
                  value={chapter.readingPassage}
                  onChange={(e) => patch({ readingPassage: e.target.value })}
                  placeholder="Masukkan bacaan bahasa Jepang..."
                />
              </label>
            </div>
          )}

          {activeOutline === "checkpoint" && (
            <div className="editor-card">
              <h3>Checkpoint Assessment</h3>
              <label>
                <span>Pilih Checkpoint dari Bank Soal:</span>
                <select
                  value={chapter.checkpointAssessmentId || ""}
                  onChange={(e) =>
                    patch({
                      checkpointAssessmentId: e.target.value || undefined,
                    })
                  }
                >
                  <option value="">(Tidak ada checkpoint terhubung)</option>
                  {publishedCheckpoints.map((assessment) => (
                    <option key={assessment.id} value={assessment.id}>
                      {assessment.title} ({assessment.level || "Semua Level"}) -{" "}
                      {assessment.questions.length} soal [{assessment.status}]
                    </option>
                  ))}
                </select>
              </label>

              <div className="relation-action-bar">
                <Link
                  href="/admin/bank-soal/baru?type=checkpoint"
                  target="_blank"
                  className="button button-secondary"
                >
                  Buat Checkpoint Baru di Bank Soal ↗
                </Link>
              </div>
            </div>
          )}
        </section>
      </div>

      <AdminDialog
        open={previewOpen}
        title="Preview Ringkasan Chapter"
        close={() => setPreviewOpen(false)}
        actions={
          <button
            type="button"
            className="button button-primary"
            onClick={() => setPreviewOpen(false)}
          >
            Tutup Preview
          </button>
        }
      >
        <div className="chapter-preview-dialog">
          <h3>
            #{chapter.order} {chapter.title || "Tanpa Judul"}
          </h3>
          <p className="preview-slug">Program: {chapter.programCode} • /{chapter.slug}</p>
          <p>{chapter.description || "Tidak ada deskripsi."}</p>
          <div className="preview-section-list">
            <h4>Daftar Konten Terkonfigurasi:</h4>
            <ul>
              <li>
                <strong>Video:</strong>{" "}
                {chapter.videoUrl
                  ? `${chapter.videoUrl} (${chapter.videoDuration} menit)`
                  : "Belum diisi"}
              </li>
              <li>
                <strong>Modul PDF:</strong>{" "}
                {chapter.pdfUrl ? `${chapter.pdfTitle || chapter.pdfUrl}` : "Belum diisi"}
              </li>
              <li>
                <strong>Flashcard:</strong>{" "}
                {chapter.flashcardDeckId ? chapter.flashcardDeckId : "Belum dihubungkan"}
              </li>
              {isNLevel && (
                <>
                  <li>
                    <strong>Audio Choukai:</strong>{" "}
                    {chapter.audioUrl ? `${chapter.audioTitle || chapter.audioUrl}` : "Belum diisi"}
                  </li>
                  <li>
                    <strong>Reading Dokkai:</strong>{" "}
                    {chapter.readingTitle ? chapter.readingTitle : "Belum diisi"}
                  </li>
                </>
              )}
              <li>
                <strong>Checkpoint:</strong>{" "}
                {chapter.checkpointAssessmentId
                  ? chapter.checkpointAssessmentId
                  : "Belum dihubungkan"}
              </li>
            </ul>
          </div>
        </div>
      </AdminDialog>
    </div>
  );
}

export function FlashcardTab() {
  const { store, refresh } = useCurriculumStore();
  const [filterProgram, setFilterProgram] = useState<string>("");
  const [editingDeck, setEditingDeck] = useState<FlashcardDeck | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FlashcardDeck | null>(null);
  const [previewDeck, setPreviewDeck] = useState<FlashcardDeck | null>(null);

  const decks = store.flashcardDecks.filter(
    (d) => !filterProgram || d.programCode === filterProgram
  );

  function handleDelete() {
    if (!deleteTarget) return;
    deleteFlashcardDeck(deleteTarget.id);
    refresh();
    setDeleteTarget(null);
  }

  if (editingDeck) {
    return (
      <FlashcardDeckEditor
        deck={editingDeck}
        onBack={() => {
          setEditingDeck(null);
          refresh();
        }}
      />
    );
  }

  return (
    <div className="flashcard-tab-content">
      <div className="curriculum-header-bar">
        <label className="program-select-label">
          <span>Filter Program:</span>
          <select
            value={filterProgram}
            onChange={(e) => setFilterProgram(e.target.value)}
          >
            <option value="">Semua Program</option>
            {programCodes.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="button button-primary"
          onClick={() => {
            const newDeck = createFlashcardDeck(
              (filterProgram as ProgramCode) || "N5"
            );
            newDeck.title = "Dek Flashcard Baru";
            setEditingDeck(newDeck);
          }}
        >
          + Tambah Deck
        </button>
      </div>

      <AdminDataTable
        caption="Daftar Flashcard Deck"
        rows={decks}
        rowKey={(row) => row.id}
        empty="Belum ada dek flashcard."
        columns={[
          {
            key: "program",
            header: "Program",
            cell: (row) => (
              <span className="program-code-badge">{row.programCode}</span>
            ),
          },
          {
            key: "title",
            header: "Judul Dek",
            cell: (row) => (
              <div>
                <strong>{row.title || "Tanpa Judul"}</strong>
                <small>{row.description}</small>
              </div>
            ),
          },
          {
            key: "cardCount",
            header: "Jumlah Kartu",
            cell: (row) => <span>{row.cards.length} kartu</span>,
          },
          {
            key: "status",
            header: "Status",
            cell: (row) => <AdminStatusBadge status={row.status} />,
          },
        ]}
        actions={{
          header: "Aksi",
          cell: (row) => (
            <div className="table-action-buttons">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setPreviewDeck(row)}
              >
                Preview Flip
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setEditingDeck(row)}
              >
                Edit
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setDeleteTarget(row)}
              >
                Hapus
              </button>
            </div>
          ),
        }}
      />

      {previewDeck && (
        <FlashcardFlipModal
          deck={previewDeck}
          onClose={() => setPreviewDeck(null)}
        />
      )}

      <AdminConfirmDialog
        open={Boolean(deleteTarget)}
        title="Hapus Dek Flashcard?"
        close={() => setDeleteTarget(null)}
        actions={
          <>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setDeleteTarget(null)}
            >
              Batal
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={handleDelete}
            >
              Hapus
            </button>
          </>
        }
      >
        <p>
          Apakah Anda yakin ingin menghapus dek{" "}
          <strong>{deleteTarget?.title}</strong>? Seluruh kartu di dalamnya
          akan terhapus.
        </p>
      </AdminConfirmDialog>
    </div>
  );
}

function FlashcardDeckEditor({
  deck: initialDeck,
  onBack,
}: {
  deck: FlashcardDeck;
  onBack: () => void;
}) {
  const { store } = useCurriculumStore();
  const [deck, setDeck] = useState<FlashcardDeck>(initialDeck);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const chapters = store.chapters.filter(
    (c) => c.programCode === deck.programCode
  );

  function patch(values: Partial<FlashcardDeck>) {
    setDeck((prev) => ({ ...prev, ...values }));
  }

  function handleAddCard() {
    const newCard = createFlashcardCard(deck.cards.length + 1);
    patch({ cards: [...deck.cards, newCard] });
  }

  function handleUpdateCard(cardId: string, values: Partial<FlashcardCard>) {
    patch({
      cards: deck.cards.map((c) => (c.id === cardId ? { ...c, ...values } : c)),
    });
  }

  function handleRemoveCard(cardId: string) {
    patch({
      cards: deck.cards.filter((c) => c.id !== cardId),
    });
  }

  function handleReorderCard(index: number, delta: number) {
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= deck.cards.length) return;
    const nextCards = [...deck.cards];
    const temp = nextCards[index];
    nextCards[index] = nextCards[targetIndex];
    nextCards[targetIndex] = temp;
    nextCards.forEach((c, idx) => {
      c.order = idx + 1;
    });
    patch({ cards: nextCards });
  }

  function handleSave(status: FlashcardDeckStatus) {
    const item: FlashcardDeck = { ...deck, status };
    saveFlashcardDeck(item);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  }

  return (
    <div className="flashcard-editor-container">
      <div className="editor-top-nav">
        <button type="button" className="back-link" onClick={onBack}>
          ← Kembali ke Daftar Flashcard
        </button>
        <div className="publication-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setPreviewOpen(true)}
          >
            Preview Flip
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => handleSave("Draft")}
          >
            Simpan Draft
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => handleSave("Published")}
          >
            Terbitkan
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div className="admin-save-toast" role="status">
          Dek flashcard berhasil disimpan.
        </div>
      )}

      <div className="deck-meta-card">
        <h3>Pengaturan Dek</h3>
        <div className="form-grid">
          <label>
            <span>Judul Dek</span>
            <input
              type="text"
              value={deck.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="contoh: Kosakata Harian N4"
            />
          </label>
          <label>
            <span>Program</span>
            <select
              value={deck.programCode}
              onChange={(e) =>
                patch({ programCode: e.target.value as ProgramCode })
              }
            >
              {programCodes.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="form-grid">
          <label>
            <span>Hubungkan ke Chapter (Opsional)</span>
            <select
              value={deck.chapterId || ""}
              onChange={(e) => patch({ chapterId: e.target.value || undefined })}
            >
              <option value="">(Tidak terhubung ke chapter tertentu)</option>
              {chapters.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  #{ch.order} {ch.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select
              value={deck.status}
              onChange={(e) =>
                patch({ status: e.target.value as FlashcardDeckStatus })
              }
            >
              <option value="Draft">Draft</option>
              <option value="Published">Terbit</option>
            </select>
          </label>
        </div>

        <label>
          <span>Deskripsi</span>
          <textarea
            rows={2}
            value={deck.description}
            onChange={(e) => patch({ description: e.target.value })}
            placeholder="Keterangan cakupan kartu..."
          />
        </label>
      </div>

      <div className="cards-builder-section">
        <div className="cards-builder-header">
          <h3>Daftar Kartu ({deck.cards.length})</h3>
          <button
            type="button"
            className="button button-primary"
            onClick={handleAddCard}
          >
            + Tambah Kartu
          </button>
        </div>

        <div className="cards-list">
          {deck.cards.map((card, index) => (
            <div key={card.id} className="card-editor-item">
              <div className="card-item-header">
                <span className="card-index">Kartu #{index + 1}</span>
                <div className="card-item-actions">
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={index === 0}
                    onClick={() => handleReorderCard(index, -1)}
                    aria-label="Naikkan kartu"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={index === deck.cards.length - 1}
                    onClick={() => handleReorderCard(index, 1)}
                    aria-label="Turunkan kartu"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => handleRemoveCard(card.id)}
                    aria-label="Hapus kartu"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="form-grid">
                <label>
                  <span>Depan (Front / Kanji / Kosakata)</span>
                  <input
                    type="text"
                    value={card.front}
                    onChange={(e) =>
                      handleUpdateCard(card.id, { front: e.target.value })
                    }
                    placeholder="contoh: 学ぶ"
                  />
                </label>
                <label>
                  <span>Cara Baca (Reading / Furigana)</span>
                  <input
                    type="text"
                    value={card.reading}
                    onChange={(e) =>
                      handleUpdateCard(card.id, { reading: e.target.value })
                    }
                    placeholder="contoh: まなぶ"
                  />
                </label>
              </div>

              <div className="form-grid">
                <label>
                  <span>Belakang (Back)</span>
                  <input
                    type="text"
                    value={card.back}
                    onChange={(e) =>
                      handleUpdateCard(card.id, { back: e.target.value })
                    }
                    placeholder="contoh: belajar / mempelajari"
                  />
                </label>
                <label>
                  <span>Arti Lengkap (Meaning)</span>
                  <input
                    type="text"
                    value={card.meaning}
                    onChange={(e) =>
                      handleUpdateCard(card.id, { meaning: e.target.value })
                    }
                    placeholder="contoh: menuntut ilmu, memahami"
                  />
                </label>
              </div>

              <label>
                <span>Contoh Kalimat (Example)</span>
                <input
                  type="text"
                  value={card.example}
                  onChange={(e) =>
                    handleUpdateCard(card.id, { example: e.target.value })
                  }
                  placeholder="contoh: 毎日、日本語を学んでいます。"
                />
              </label>
            </div>
          ))}
        </div>
      </div>

      {previewOpen && (
        <FlashcardFlipModal deck={deck} onClose={() => setPreviewOpen(false)} />
      )}
    </div>
  );
}

function FlashcardFlipModal({
  deck,
  onClose,
}: {
  deck: FlashcardDeck;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const card: FlashcardCard | undefined = deck.cards[index];

  function handleNext() {
    if (index < deck.cards.length - 1) {
      setIndex((i) => i + 1);
      setIsFlipped(false);
    }
  }

  function handlePrev() {
    if (index > 0) {
      setIndex((i) => i - 1);
      setIsFlipped(false);
    }
  }

  return (
    <AdminDialog
      open={true}
      title={`Preview Flip: ${deck.title || "Dek Flashcard"}`}
      close={onClose}
      actions={
        <button type="button" className="button button-primary" onClick={onClose}>
          Tutup
        </button>
      }
    >
      <div className="flashcard-preview-container">
        {deck.cards.length === 0 ? (
          <p>Dek ini belum memiliki kartu.</p>
        ) : (
          <>
            <div className="flip-controls-top">
              <span>
                Kartu {index + 1} dari {deck.cards.length}
              </span>
              <small>Klik kartu untuk membalik</small>
            </div>

            <div
              className={`flashcard-interactive-card ${
                isFlipped ? "flipped" : ""
              }`}
              onClick={() => setIsFlipped(!isFlipped)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setIsFlipped(!isFlipped);
                }
              }}
            >
              <div className="flashcard-card-inner">
                <div className="flashcard-front-face">
                  <span className="card-face-tag">DEPAN</span>
                  <div className="card-main-text">{card?.front || "—"}</div>
                  {card?.reading && (
                    <div className="card-sub-text">{card.reading}</div>
                  )}
                </div>
                <div className="flashcard-back-face">
                  <span className="card-face-tag">BELAKANG</span>
                  <div className="card-main-text">{card?.back || "—"}</div>
                  {card?.meaning && (
                    <div className="card-sub-meaning">{card.meaning}</div>
                  )}
                  {card?.example && (
                    <div className="card-example-box">{card.example}</div>
                  )}
                </div>
              </div>
            </div>

            <div className="flip-controls-bottom">
              <button
                type="button"
                className="button button-secondary"
                disabled={index === 0}
                onClick={handlePrev}
              >
                ← Sebelumnya
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setIsFlipped(!isFlipped)}
              >
                Putar Kartu (Flip)
              </button>
              <button
                type="button"
                className="button button-secondary"
                disabled={index === deck.cards.length - 1}
                onClick={handleNext}
              >
                Selanjutnya →
              </button>
            </div>
          </>
        )}
      </div>
    </AdminDialog>
  );
}

export function LibraryTab() {
  const { store, refresh } = useCurriculumStore();
  const [filterType, setFilterType] = useState<string>("");
  const [filterProgram, setFilterProgram] = useState<string>("");
  const [editingMaterial, setEditingMaterial] =
    useState<LibraryMaterial | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LibraryMaterial | null>(null);

  const materials = store.libraryMaterials.filter((m) => {
    const matchType = !filterType || m.type === filterType;
    const matchProgram = !filterProgram || m.programCode === filterProgram;
    return matchType && matchProgram;
  });

  function handleDelete() {
    if (!deleteTarget) return;
    deleteLibraryMaterial(deleteTarget.id);
    refresh();
    setDeleteTarget(null);
  }

  function handleSave(material: LibraryMaterial) {
    saveLibraryMaterial(material);
    refresh();
    setEditingMaterial(null);
  }

  return (
    <div className="library-tab-content">
      <div className="curriculum-header-bar">
        <div className="multi-filters">
          <label className="program-select-label">
            <span>Jenis Materi:</span>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="">Semua Jenis</option>
              {libraryMaterialTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className="program-select-label">
            <span>Program:</span>
            <select
              value={filterProgram}
              onChange={(e) => setFilterProgram(e.target.value)}
            >
              <option value="">Semua Program</option>
              {programCodes.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="button"
          className="button button-primary"
          onClick={() =>
            setEditingMaterial(
              createLibraryMaterial((filterProgram as ProgramCode) || "N5")
            )
          }
        >
          + Tambah Materi
        </button>
      </div>

      <AdminDataTable
        caption="Daftar Perpustakaan Materi"
        rows={materials}
        rowKey={(row) => row.id}
        empty="Belum ada materi perpustakaan."
        columns={[
          {
            key: "program",
            header: "Program",
            cell: (row) => (
              <span className="program-code-badge">{row.programCode}</span>
            ),
          },
          {
            key: "type",
            header: "Jenis",
            cell: (row) => <span className="type-pill">{row.type}</span>,
          },
          {
            key: "title",
            header: "Judul Materi",
            cell: (row) => (
              <div>
                <strong>{row.title || "Tanpa Judul"}</strong>
                <small>{row.description}</small>
              </div>
            ),
          },
          {
            key: "url",
            header: "Tautan URL",
            cell: (row) => (
              <a
                href={row.url}
                target="_blank"
                rel="noreferrer"
                className="url-link"
              >
                {row.url}
              </a>
            ),
          },
          {
            key: "status",
            header: "Status",
            cell: (row) => <AdminStatusBadge status={row.status} />,
          },
        ]}
        actions={{
          header: "Aksi",
          cell: (row) => (
            <div className="table-action-buttons">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setEditingMaterial(row)}
              >
                Edit
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setDeleteTarget(row)}
              >
                Hapus
              </button>
            </div>
          ),
        }}
      />

      {editingMaterial && (
        <LibraryMaterialModal
          material={editingMaterial}
          onClose={() => setEditingMaterial(null)}
          onSave={handleSave}
        />
      )}

      <AdminConfirmDialog
        open={Boolean(deleteTarget)}
        title="Hapus Materi?"
        close={() => setDeleteTarget(null)}
        actions={
          <>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setDeleteTarget(null)}
            >
              Batal
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={handleDelete}
            >
              Hapus
            </button>
          </>
        }
      >
        <p>
          Apakah Anda yakin ingin menghapus materi{" "}
          <strong>{deleteTarget?.title}</strong>?
        </p>
      </AdminConfirmDialog>
    </div>
  );
}

function LibraryMaterialModal({
  material: initialMaterial,
  onClose,
  onSave,
}: {
  material: LibraryMaterial;
  onClose: () => void;
  onSave: (m: LibraryMaterial) => void;
}) {
  const [material, setMaterial] = useState<LibraryMaterial>(initialMaterial);

  function patch(values: Partial<LibraryMaterial>) {
    setMaterial((prev) => ({ ...prev, ...values }));
  }

  return (
    <AdminDialog
      open={true}
      title={material.title ? "Edit Materi" : "Tambah Materi Baru"}
      close={onClose}
      actions={
        <>
          <button
            type="button"
            className="button button-secondary"
            onClick={onClose}
          >
            Batal
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => onSave(material)}
          >
            Simpan Materi
          </button>
        </>
      }
    >
      <div className="material-modal-form">
        <label>
          <span>Judul Materi</span>
          <input
            type="text"
            value={material.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="contoh: Modul Tata Bahasa Lengkap"
          />
        </label>

        <div className="form-grid">
          <label>
            <span>Program</span>
            <select
              value={material.programCode}
              onChange={(e) =>
                patch({ programCode: e.target.value as ProgramCode })
              }
            >
              {programCodes.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Jenis Materi</span>
            <select
              value={material.type}
              onChange={(e) =>
                patch({ type: e.target.value as LibraryMaterialType })
              }
            >
              {libraryMaterialTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          <span>URL File / Sumber</span>
          <input
            type="text"
            value={material.url}
            onChange={(e) => patch({ url: e.target.value })}
            placeholder="/materials/n4-modul.pdf atau https://..."
          />
        </label>

        <label>
          <span>Deskripsi</span>
          <textarea
            rows={3}
            value={material.description}
            onChange={(e) => patch({ description: e.target.value })}
            placeholder="Ringkasan penjelasan materi..."
          />
        </label>

        <label>
          <span>Status Publikasi</span>
          <select
            value={material.status}
            onChange={(e) =>
              patch({ status: e.target.value as LibraryMaterialStatus })
            }
          >
            <option value="Draft">Draft</option>
            <option value="Published">Terbit</option>
          </select>
        </label>
      </div>
    </AdminDialog>
  );
}

function ReplayTab() {
  const { store, refresh } = useCurriculumStore();
  const [filterProgram, setFilterProgram] = useState<string>("");
  const [editingReplay, setEditingReplay] = useState<ReplayRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReplayRecord | null>(null);
  const [previewVideo, setPreviewVideo] = useState<ReplayRecord | null>(null);

  const replays = store.replays.filter((r) => {
    if (!filterProgram) return true;
    return r.programCode === filterProgram;
  });

  function handleDelete() {
    if (!deleteTarget) return;
    deleteReplay(deleteTarget.id);
    refresh();
    setDeleteTarget(null);
  }

  function handleSave(record: ReplayRecord) {
    saveReplay(record);
    refresh();
    setEditingReplay(null);
  }

  return (
    <div className="replay-tab-content">
      <div className="curriculum-header-bar">
        <label className="program-select-label">
          <span>Filter Program:</span>
          <select
            value={filterProgram}
            onChange={(e) => setFilterProgram(e.target.value)}
          >
            <option value="">Semua Program</option>
            {programCodes.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="button button-primary"
          onClick={() =>
            setEditingReplay(
              createReplay((filterProgram as ProgramCode) || undefined)
            )
          }
        >
          + Tambah Replay
        </button>
      </div>

      <AdminDataTable
        caption="Daftar Replay Rekaman"
        rows={replays}
        rowKey={(row) => row.id}
        empty="Belum ada rekaman replay."
        columns={[
          {
            key: "program",
            header: "Program",
            cell: (row) => (
              <span className="program-code-badge">
                {row.programCode || "SEMUA"}
              </span>
            ),
          },
          {
            key: "title",
            header: "Judul Replay",
            cell: (row) => (
              <div>
                <strong>{row.title || "Tanpa Judul"}</strong>
                <small>{row.description}</small>
              </div>
            ),
          },
          {
            key: "sensei",
            header: "Sensei",
            cell: (row) => <span>{row.senseiName}</span>,
          },
          {
            key: "date",
            header: "Tanggal & Durasi",
            cell: (row) => (
              <div>
                <span>{row.date}</span>
                <small>{row.durationMinutes} menit</small>
              </div>
            ),
          },
          {
            key: "status",
            header: "Status",
            cell: (row) => <AdminStatusBadge status={row.status} />,
          },
        ]}
        actions={{
          header: "Aksi",
          cell: (row) => (
            <div className="table-action-buttons">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setPreviewVideo(row)}
              >
                Preview Video
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setEditingReplay(row)}
              >
                Edit
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setDeleteTarget(row)}
              >
                Hapus
              </button>
            </div>
          ),
        }}
      />

      {editingReplay && (
        <ReplayModal
          replay={editingReplay}
          onClose={() => setEditingReplay(null)}
          onSave={handleSave}
        />
      )}

      {previewVideo && (
        <AdminDialog
          open={true}
          title={`Preview Replay: ${previewVideo.title}`}
          close={() => setPreviewVideo(null)}
          actions={
            <button
              type="button"
              className="button button-primary"
              onClick={() => setPreviewVideo(null)}
            >
              Tutup
            </button>
          }
        >
          <div className="replay-preview-modal">
            {previewVideo.youtubeVideoId ? (
              <div className="replay-iframe-wrap">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${previewVideo.youtubeVideoId}`}
                  title={previewVideo.title}
                  allowFullScreen
                  className="replay-embed"
                />
              </div>
            ) : (
              <p>URL video YouTube tidak valid.</p>
            )}
            <p className="preview-sensei">
              Sensei: {previewVideo.senseiName} • {previewVideo.date} (
              {previewVideo.durationMinutes} menit)
            </p>
            <p>{previewVideo.description}</p>
          </div>
        </AdminDialog>
      )}

      <AdminConfirmDialog
        open={Boolean(deleteTarget)}
        title="Hapus Replay?"
        close={() => setDeleteTarget(null)}
        actions={
          <>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setDeleteTarget(null)}
            >
              Batal
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={handleDelete}
            >
              Hapus
            </button>
          </>
        }
      >
        <p>
          Apakah Anda yakin ingin menghapus replay{" "}
          <strong>{deleteTarget?.title}</strong>?
        </p>
      </AdminConfirmDialog>
    </div>
  );
}

function ReplayModal({
  replay: initialReplay,
  onClose,
  onSave,
}: {
  replay: ReplayRecord;
  onClose: () => void;
  onSave: (r: ReplayRecord) => void;
}) {
  const [replay, setReplay] = useState<ReplayRecord>(initialReplay);

  function patch(values: Partial<ReplayRecord>) {
    setReplay((prev) => ({ ...prev, ...values }));
  }

  const videoId =
    replay.youtubeVideoId || extractYouTubeVideoId(replay.youtubeUrl);

  return (
    <AdminDialog
      open={true}
      title={replay.title ? "Edit Replay" : "Tambah Replay Baru"}
      close={onClose}
      actions={
        <>
          <button
            type="button"
            className="button button-secondary"
            onClick={onClose}
          >
            Batal
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => onSave({ ...replay, youtubeVideoId: videoId })}
          >
            Simpan Replay
          </button>
        </>
      }
    >
      <div className="replay-modal-form">
        <label>
          <span>Judul Sesi Replay</span>
          <input
            type="text"
            value={replay.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="contoh: Chapter 4 — Pola Kalimat dan Kehidupan"
          />
        </label>

        <div className="form-grid">
          <label>
            <span>Program</span>
            <select
              value={replay.programCode || ""}
              onChange={(e) =>
                patch({
                  programCode: (e.target.value as ProgramCode) || undefined,
                })
              }
            >
              <option value="">(Semua Program)</option>
              {programCodes.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Nama Sensei</span>
            <input
              type="text"
              value={replay.senseiName}
              onChange={(e) => patch({ senseiName: e.target.value })}
              placeholder="contoh: Kenji Tanaka Sensei"
            />
          </label>
        </div>

        <div className="form-grid">
          <label>
            <span>Tanggal Pelaksanaan</span>
            <input
              type="date"
              value={replay.date}
              onChange={(e) => patch({ date: e.target.value })}
            />
          </label>

          <label>
            <span>Durasi (Menit)</span>
            <input
              type="number"
              min={1}
              value={replay.durationMinutes}
              onChange={(e) =>
                patch({ durationMinutes: Number(e.target.value) || 0 })
              }
            />
          </label>
        </div>

        <label>
          <span>URL YouTube</span>
          <input
            type="url"
            value={replay.youtubeUrl}
            onChange={(e) => patch({ youtubeUrl: e.target.value })}
            placeholder="https://www.youtube.com/watch?v=..."
          />
        </label>

        {videoId && (
          <div className="replay-live-preview">
            <span>Preview Video:</span>
            <div className="replay-iframe-wrap">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${videoId}`}
                title="Preview"
                allowFullScreen
                className="replay-embed"
              />
            </div>
          </div>
        )}

        <label>
          <span>Deskripsi Pembahasan</span>
          <textarea
            rows={3}
            value={replay.description}
            onChange={(e) => patch({ description: e.target.value })}
            placeholder="Ringkasan poin yang dibahas pada sesi ini..."
          />
        </label>

        <label>
          <span>Status Publikasi</span>
          <select
            value={replay.status}
            onChange={(e) =>
              patch({ status: e.target.value as ReplayStatus })
            }
          >
            <option value="Draft">Draft</option>
            <option value="Published">Terbit</option>
          </select>
        </label>
      </div>
    </AdminDialog>
  );
}
