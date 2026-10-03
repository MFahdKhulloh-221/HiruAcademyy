"use client";

import { type FormEvent, useCallback, useState } from "react";
import { AdminDialog, AdminEmptyState, AdminPageHeader, AdminSection, AdminShell, AdminStatusBadge } from "@/components/admin-primitives";
import { AdminPlacementPreview, PlacementMedia, type PlacementQuestion, type PlacementSettings } from "@/components/admin-placement-preview";
import { placementQuestions } from "@/lib/public-mock";

const letters = ["A", "B", "C", "D"] as const;
const categories = [...new Set(placementQuestions.map((question) => question.area))];
type QuestionDraft = PlacementQuestion & { order: string };
const initialSettings: PlacementSettings = {
  title: "Placement Test HIRU Academy",
  introHeading: "Kenali levelmu sebelum memulai journey",
  minutes: "5",
  description: "Isi Nama, WhatsApp, dan Target Ujian, lalu jawab 20 soal sekitar 5 menit. Tidak perlu login untuk memulai.",
};

function questionError(question: PlacementQuestion) {
  if (!question.prompt.trim()) return "Pertanyaan wajib diisi.";
  if (question.answers.length !== 4 || question.answers.some((answer) => !answer.trim())) return "Isi semua pilihan jawaban A, B, C, dan D.";
  if (!letters.some((letter) => letter === question.correct)) return "Pilih satu jawaban benar: A, B, C, atau D.";
  if (!categories.some((category) => category === question.category)) return "Pilih kategori pertanyaan yang tersedia.";
  if (question.image && !question.image.type.startsWith("image/")) return "Pilih file gambar dengan MIME image/*.";
  if (question.audio && !question.audio.type.startsWith("audio/")) return "Pilih file audio dengan MIME audio/*.";
  return "";
}

function settingsError(settings: PlacementSettings) {
  if (!settings.title.trim()) return "Judul Placement Test wajib diisi.";
  if (!settings.introHeading.trim()) return "Intro Heading wajib diisi.";
  if (!settings.description.trim()) return "Deskripsi Tes wajib diisi.";
  const minutes = Number(settings.minutes);
  if (!/^\d+$/.test(settings.minutes) || !Number.isSafeInteger(minutes) || minutes < 1) return "Waktu pengerjaan harus berupa angka bulat positif dalam menit.";
  return "";
}

export function AdminPlacementPrototype() {
  const [settings, setSettings] = useState(initialSettings);
  const [rows, setRows] = useState<PlacementQuestion[]>(() => placementQuestions.map((question) => ({ id: `placement-${question.number}`, prompt: question.prompt, answers: question.answers.map((answer) => answer.replace(/^[A-D]\.\s*/, "")), correct: letters[question.answers.indexOf(question.correctAnswer)] ?? "", category: question.area, published: true, explanation: "" })));
  const [draft, setDraft] = useState<QuestionDraft | null>(null);
  const [view, setView] = useState<PlacementQuestion | null>(null);
  const [deleting, setDeleting] = useState<PlacementQuestion | null>(null);
  const [preview, setPreview] = useState(false);
  const [status, setStatus] = useState("Draft");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pageError, setPageError] = useState("");
  const [message, setMessage] = useState("");
  const closeEditor = useCallback(() => { setDraft(null); setError(""); }, []);
  const closeView = useCallback(() => setView(null), []);
  const closeDelete = useCallback(() => setDeleting(null), []);
  const closePreview = useCallback(() => setPreview(false), []);

  function updateSettings(patch: Partial<PlacementSettings>) {
    setSettings((current) => ({ ...current, ...patch }));
    setPageError(""); setStatus("Draft"); setMessage("");
  }

  function saveConfiguration(publish: boolean) {
    const invalid = settingsError(settings) || (publish && !rows.some((row) => row.published) ? "Assessment membutuhkan minimal satu pertanyaan." : "") || (publish ? rows.filter((row) => row.published).map(questionError).find(Boolean) : "");
    if (invalid) { setPageError(invalid); return; }
    setSettings({ ...settings, title: settings.title.trim(), introHeading: settings.introHeading.trim(), description: settings.description.trim(), minutes: String(Number(settings.minutes)) });
    setStatus(publish ? "Published" : "Draft");
    setUpdatedAt(new Date().toISOString()); setPageError("");
    setMessage(publish ? "Placement test diterbitkan untuk sesi ini. Placement publik tidak berubah." : "Draft placement test disimpan untuk sesi ini. Placement publik tidak berubah.");
  }

  function saveQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const invalid = questionError(draft);
    if (invalid) { setError(invalid); return; }
    const order = Number(draft.order);
    const maxOrder = rows.length + (rows.some((row) => row.id === draft.id) ? 0 : 1);
    if (!/^\d+$/.test(draft.order) || !Number.isSafeInteger(order) || order < 1 || order > maxOrder) { setError(`Urutan harus berupa angka bulat dari 1 hingga ${maxOrder}.`); return; }
    const next: PlacementQuestion = { id: draft.id, prompt: draft.prompt.trim(), answers: draft.answers.map((answer) => answer.trim()), correct: draft.correct, category: draft.category, published: draft.published, explanation: draft.explanation.trim(), image: draft.image, audio: draft.audio };
    setRows((current) => {
      const reordered = current.filter((row) => row.id !== next.id);
      reordered.splice(order - 1, 0, next);
      return reordered;
    });
    closeEditor(); setStatus("Draft"); setMessage("Pertanyaan disimpan untuk sesi ini. Placement publik tidak berubah.");
  }

  function selectMedia(kind: "image" | "audio", file?: File) {
    if (!draft || !file) return;
    if (!file.type.startsWith(`${kind}/`)) { setError(kind === "image" ? "Pilih file gambar dengan MIME image/*." : "Pilih file audio dengan MIME audio/*."); return; }
    setError(""); setDraft({ ...draft, [kind]: file });
  }

  function move(id: string, direction: number) {
    setRows((current) => {
      const index = current.findIndex((row) => row.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const reordered = [...current];
      [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
      return reordered;
    });
    setStatus("Draft"); setMessage("Urutan pertanyaan diubah untuk sesi ini.");
  }

  return <AdminShell current="/admin/placement-hasil"><main className="admin-public-prototype placement-admin admin-placement-prototype">
    <AdminPageHeader title="Placement Test" />
    <p>Perubahan hanya berlaku selama sesi ini. Placement publik tidak berubah. OPEN: copy Admin final dan aturan waktu produksi.</p>
    <div className="placement-tab-content">
      <div className="placement-pub-bar"><div className="placement-pub-status"><span>Status:</span><AdminStatusBadge status={status} /><small>Terakhir diperbarui: {updatedAt ? new Date(updatedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</small></div>
        <div className="placement-pub-actions"><button type="button" className="button button-secondary" onClick={() => setPreview(true)}>Pratinjau Tes</button><button type="button" className="button button-secondary" onClick={() => saveConfiguration(false)}>Simpan Draft</button><button type="button" className="button button-primary" onClick={() => saveConfiguration(true)}>Terbitkan</button></div>
      </div>
      {message && <p className="placement-notice" role="status">{message}</p>}
      {pageError && <p className="placement-alert-error" role="alert">{pageError}</p>}
      <AdminSection title="Pengaturan Placement Test" className="placement-settings-box"><div className="placement-settings-grid">
        <label className="admin-field">Judul Tes<input value={settings.title} onChange={(event) => updateSettings({ title: event.target.value })} required /></label>
        <label className="admin-field">Intro Heading<input value={settings.introHeading} onChange={(event) => updateSettings({ introHeading: event.target.value })} required /></label>
        <label className="admin-field">Durasi Pengerjaan (menit)<input type="number" min="1" step="1" value={settings.minutes} onChange={(event) => updateSettings({ minutes: event.target.value })} required /></label>
        <label className="admin-field placement-span-full">Deskripsi Tes<textarea rows={2} value={settings.description} onChange={(event) => updateSettings({ description: event.target.value })} required /></label>
      </div></AdminSection>
      <AdminSection title="Pertanyaan" className="placement-settings-box" actions={<button type="button" className="button button-primary" onClick={() => { setError(""); setDraft({ id: crypto.randomUUID(), prompt: "", answers: ["", "", "", ""], correct: "", category: categories[0], published: false, explanation: "", order: String(rows.length + 1) }); }}>Tambah Pertanyaan</button>}>
        {!rows.length ? <AdminEmptyState title="Belum ada pertanyaan dibuat." /> : <ol className="placement-outline-list admin-placement-question-list" aria-label="Daftar Pertanyaan Placement Test">{rows.map((row, index) => <li className="placement-outline-item admin-placement-question-card" key={row.id}>
          <div><div className="placement-outline-meta"><span className="placement-q-num">#{index + 1}</span><span className="placement-q-area">{row.category}</span><AdminStatusBadge status={row.published ? "Published" : "Draft"} /></div>
            <p className="placement-q-preview">{row.prompt}</p><small>Jawaban Benar: {row.correct}. {row.answers[letters.findIndex((letter) => letter === row.correct)]}</small>
            {(row.image || row.audio) && <p className="admin-placement-media-names">{[row.image?.name, row.audio?.name].filter(Boolean).join(" · ")}</p>}
          </div>
          <div className="placement-editor-actions admin-placement-question-actions">
            <button type="button" className="button button-secondary button-sm" aria-label={`Lihat pertanyaan ${index + 1}`} onClick={() => setView(row)}>Lihat</button>
            <button type="button" className="button button-secondary button-sm" aria-label={`Edit pertanyaan ${index + 1}`} onClick={() => { setError(""); setDraft({ ...row, answers: [...row.answers], order: String(index + 1) }); }}>Edit</button>
            <button type="button" className="button button-secondary button-sm" aria-label={`Duplikat pertanyaan ${index + 1}`} onClick={() => { setError(""); setDraft({ ...row, id: crypto.randomUUID(), answers: [...row.answers], published: false, order: String(index + 2) }); }}>Duplikat</button>
            <button type="button" className="button button-secondary button-sm" aria-label={`${row.published ? "Jadikan Draft" : "Publikasikan"} pertanyaan ${index + 1}`} onClick={() => { const invalid = row.published ? "" : questionError(row); if (invalid) { setPageError(invalid); return; } setRows((current) => current.map((item) => item.id === row.id ? { ...item, published: !item.published } : item)); setStatus("Draft"); setMessage("Status pertanyaan diubah untuk sesi ini."); }}>{row.published ? "Jadikan Draft" : "Publikasikan"}</button>
            <button type="button" className="button button-secondary button-sm" disabled={index === 0} aria-label={`Naikkan pertanyaan ${index + 1}`} onClick={() => move(row.id, -1)}>Naik</button>
            <button type="button" className="button button-secondary button-sm" disabled={index === rows.length - 1} aria-label={`Turunkan pertanyaan ${index + 1}`} onClick={() => move(row.id, 1)}>Turun</button>
            <button type="button" className="button button-secondary button-sm placement-text-danger" aria-label={`Hapus pertanyaan ${index + 1}`} onClick={() => setDeleting(row)}>Hapus</button>
          </div>
        </li>)}</ol>}
      </AdminSection>
    </div>
    <AdminDialog open={Boolean(draft)} title={rows.some((row) => row.id === draft?.id) ? "Edit Pertanyaan" : "Tambah Pertanyaan"} close={closeEditor}>
      {draft && <form className="admin-prototype-form placement-editor-panel" onSubmit={saveQuestion} noValidate>
        <div className="placement-field-grid">
          <label className="admin-field placement-span-full">Pertanyaan<textarea rows={3} value={draft.prompt} onChange={(event) => setDraft({ ...draft, prompt: event.target.value })} required /></label>
          <label className="admin-field">Kategori<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} required>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
          <label className="admin-field">Status<select value={draft.published ? "published" : "draft"} onChange={(event) => setDraft({ ...draft, published: event.target.value === "published" })}><option value="draft">Draft</option><option value="published">Published</option></select></label>
          <label className="admin-field">Gambar (Opsional)<input type="file" accept="image/*" onChange={(event) => { selectMedia("image", event.target.files?.[0]); event.target.value = ""; }} /></label>
          <label className="admin-field">Audio (Opsional)<input type="file" accept="audio/*" onChange={(event) => { selectMedia("audio", event.target.files?.[0]); event.target.value = ""; }} /></label>
          <div className="placement-span-full"><PlacementMedia image={draft.image} audio={draft.audio} /><div className="placement-editor-actions">{draft.image && <button type="button" className="button" onClick={() => setDraft({ ...draft, image: undefined })}>Hapus Gambar</button>}{draft.audio && <button type="button" className="button" onClick={() => setDraft({ ...draft, audio: undefined })}>Hapus Audio</button>}</div></div>
          <label className="admin-field placement-span-full">Penjelasan / Pembahasan (Opsional)<textarea rows={2} value={draft.explanation} onChange={(event) => setDraft({ ...draft, explanation: event.target.value })} /></label>
        </div>
        <fieldset className="placement-options-fieldset"><legend>Pilihan Jawaban (Pilihan Tunggal)</legend><div className="placement-options-list">{letters.map((letter, index) => <label className="admin-field" key={letter}>Jawaban {letter}<input value={draft.answers[index]} onChange={(event) => setDraft({ ...draft, answers: draft.answers.map((answer, answerIndex) => answerIndex === index ? event.target.value : answer) })} required /></label>)}</div></fieldset>
        <label className="admin-field">Jawaban Benar<select value={draft.correct} onChange={(event) => setDraft({ ...draft, correct: event.target.value })} required><option value="">Pilih jawaban benar</option>{letters.map((letter) => <option key={letter} value={letter}>{letter}</option>)}</select></label>
        <label className="admin-field">Urutan<input type="number" min="1" max={rows.length + (rows.some((row) => row.id === draft.id) ? 0 : 1)} step="1" value={draft.order} onChange={(event) => setDraft({ ...draft, order: event.target.value })} required /><small>Pertanyaan lain bergeser otomatis.</small></label>
        {error && <p className="placement-alert-error" role="alert">{error}</p>}
        <details className="admin-placement-editor-preview"><summary>Pratinjau Tes</summary><AdminPlacementPreview settings={settings} questions={[draft]} initialQuestionId={draft.id} /></details>
        <div className="admin-page-actions"><button type="button" className="button" onClick={closeEditor}>Batal</button><button type="submit" className="button button-primary">Simpan Pertanyaan</button></div>
      </form>}
    </AdminDialog>
    <AdminDialog open={preview} title="Pratinjau Tes Placement" close={closePreview}>{preview && <AdminPlacementPreview settings={settings} questions={rows} />}</AdminDialog>
    <AdminDialog open={Boolean(view)} title="Detail Pertanyaan" close={closeView}>{view && <><AdminPlacementPreview settings={settings} questions={rows} initialQuestionId={view.id} /><article><p>Jawaban Benar: {view.correct}</p><p>Kategori: {view.category}</p><p>Urutan: {rows.findIndex((row) => row.id === view.id) + 1}</p><AdminStatusBadge status={view.published ? "Published" : "Draft"} />{view.explanation && <div><h3>Penjelasan / Pembahasan</h3><p>{view.explanation}</p></div>}</article></>}</AdminDialog>
    <AdminDialog open={Boolean(deleting)} title="Hapus Pertanyaan?" close={closeDelete} actions={<><button type="button" className="button" onClick={closeDelete}>Batal</button><button type="button" className="button button-primary" onClick={() => { if (!deleting) return; setRows((current) => current.filter((row) => row.id !== deleting.id)); setDeleting(null); setStatus("Draft"); setMessage("Pertanyaan dihapus dari sesi ini."); }}>Hapus Pertanyaan</button></>}><p>{deleting?.prompt}</p><p>Hapus pertanyaan dari sesi ini? Placement publik tidak berubah.</p></AdminDialog>
  </main></AdminShell>;
}
