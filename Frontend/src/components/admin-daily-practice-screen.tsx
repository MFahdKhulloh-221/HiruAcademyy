"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { FiArrowLeft, FiBookOpen, FiCheckCircle, FiEdit2, FiFileText, FiPlus, FiSearch, FiTrash2, FiBarChart2 } from "react-icons/fi";
import { AdminDataTable, AdminDialog, AdminPageHeader, AdminSection, AdminShell } from "@/components/admin-primitives";
import { AdminTryoutQuestionBuilder } from "@/components/admin-tryout-question-builder";
import { AdminTryoutResults } from "@/components/admin-tryout-results";
import { assessmentPassageError, assessmentQuestionError, assessmentQuestionLocation, type AdminAssessment } from "@/components/admin-assessment-fixtures";
import { useEditorNavigation } from "@/components/admin-editor-navigation";
import { useLearningRequest } from "@/components/learning-hooks";
import { useContent } from "@/lib/public-content-api";
import { ApiError } from "@/lib/api";
import styles from "./admin-daily-practice.module.css";
import { dailyAssessment, dailyCategories, dailyCategoryLabels, dailyLocked, dailyReportsApi, deleteDailyPractice, loadDailyPractice, loadDailyPractices, saveDailySettings, saveDailyStudio, type DailyPractice, type DailySettings } from "@/lib/admin-daily-practice-api";

const empty: DailySettings = { title: "", category: "vocabulary", target_level: "", status: "draft" };
const dailyFieldLabels: Record<string, string> = { title: "Judul latihan", category: "Kategori", target_level: "Target level", status: "Status", questions: "Daftar soal", passages: "Daftar bacaan", question: "Pertanyaan", options: "Pilihan jawaban", correct_option: "Kunci jawaban", explanation: "Pembahasan", points: "Bobot poin", body: "Teks bacaan", audio_url: "Audio", studio: "Isi soal dan bacaan" };
const errorText = (cause: unknown) => cause instanceof ApiError && cause.status === 422 && Object.keys(cause.errors).length ? Object.keys(cause.errors).map(key => { const parts = key.split("."); const index = /^\d+$/.test(parts[1] ?? "") ? Number(parts[1]) + 1 : null; const field = dailyFieldLabels[parts.at(-1) ?? ""] ?? "Isian"; return `${index ? `${parts[0] === "passages" ? "Bacaan" : "Soal"} ${index} — ` : ""}${field}: periksa kelengkapan dan format isian.`; }).join("\n") : cause instanceof ApiError && (cause.status === 401 || cause.status === 419) ? "Sesi berakhir. Silakan masuk kembali." : cause instanceof ApiError && cause.status === 409 ? "Latihan sudah berubah atau sedang dikerjakan. Muat ulang daftar sebelum melanjutkan." : cause instanceof ApiError && cause.status === 422 ? "Periksa kembali informasi latihan dan kelengkapan soal sebelum menyimpan." : "Permintaan belum berhasil. Silakan coba lagi.";

export function AdminDailyPracticeScreen() {
  return <AdminShell current="/admin/latihan-harian"><DailyPracticeWorkspace /></AdminShell>;
}

function DailyPracticeWorkspace() {
  const request = useLearningRequest(loadDailyPractices, "admin-daily-practices");
  const catalog = useContent<{ code: string; name: string; status: string }>("/api/admin/programs");
  const [form, setForm] = useState<DailySettings | null>(null);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [editing, setEditing] = useState<DailyPractice | null>(null);
  const [studio, setStudio] = useState<{ item: DailyPractice; baseline: AdminAssessment; draft: AdminAssessment } | null>(null);
  const [results, setResults] = useState<DailyPractice | null>(null);
  const [deleting, setDeleting] = useState<DailyPractice | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState<{ success: boolean; message: string } | null>(null);
  function reportIssue(message: string) { setError(message); setNotice({ success: false, message }); }
  function reportSaved(message: string) { setMessage(message); setNotice({ success: true, message }); }
  const setGuard = useEditorNavigation()?.setGuard;
  const discard = useCallback(() => { setStudio(null); setForm(null); setDirty(false); setError(""); }, []);
  useEffect(() => { setGuard?.({ dirty, saving: busy || uploading, discard }); return () => setGuard?.(null); }, [setGuard, dirty, busy, uploading, discard]);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  function close() { if (!busy && !uploading && (!dirty || window.confirm("Buang perubahan yang belum disimpan?"))) discard(); }
  function closeStudio() {
    if (!studio || busy || uploading || (dirty && !window.confirm("Buang perubahan yang belum disimpan?"))) return;
    setEditing(studio.item);
    setForm({ ...studio.item });
    setStudio(null); setDirty(false); setError("");
  }
  async function write(action: () => Promise<void>) {
    if (busyRef.current || uploading) return;
    busyRef.current = true; setBusy(true); setError(""); setMessage("");
    try { await action(); request.retry(); }
    catch (cause) { reportIssue(errorText(cause)); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function open(item: DailyPractice, mode: "settings" | "studio") {
    await write(async () => {
      const detail = await loadDailyPractice(item.id);
      if (dailyLocked(detail)) { setError("Latihan sudah dikerjakan. Edit dan hapus dikunci."); return; }
      if (mode === "studio") { const baseline = dailyAssessment(detail); setStudio({ item: detail, baseline, draft: baseline }); }
      else { setEditing(detail); setForm({ ...detail }); }
      setDirty(false);
    });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const intent = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ?? "draft";
    if (!form) return;
    const invalid = event.currentTarget.querySelector<HTMLInputElement | HTMLSelectElement>(":invalid");
    if (invalid) { invalid.focus(); reportIssue(`${invalid.labels?.[0]?.childNodes[0]?.textContent?.trim() || "Isian latihan"}: ${invalid.validationMessage}`); return; }
    if (!form.title.trim()) { reportIssue("Judul: isi judul latihan sebelum menyimpan."); return; }
    if (intent === "published" && (!editing || !editing.question_count)) { reportIssue("Soal belum tersedia. Tambahkan dan simpan soal melalui Kelola Soal sebelum publikasi."); return; }
    void write(async () => {
      const saved = await saveDailySettings({ ...form, status: intent === "published" ? "published" : intent === "studio" ? form.status : "draft" }, editing?.id);
      setEditing(saved); setForm({ ...saved }); setDirty(false); reportSaved(intent === "published" ? "Latihan berhasil dipublikasikan." : "Informasi latihan berhasil disimpan.");
      if (intent === "studio") { const detail = await loadDailyPractice(saved.id); const baseline = dailyAssessment(detail); setForm(null); setStudio({ item: detail, baseline, draft: baseline }); }
    });
  }
  async function saveQuestions(draft: AdminAssessment) {
    if (!studio) return;
    const issues = [
      ...draft.questions.flatMap(question => { const issue = assessmentQuestionError(question, draft); return issue ? [`${assessmentQuestionLocation(question, draft)}: ${issue}`] : []; }),
      ...(draft.passages ?? []).flatMap((passage, index) => { const issue = assessmentPassageError(passage); return issue ? [`Bacaan ${index + 1} (${passage.title || "tanpa judul"}): ${issue}`] : []; }),
    ];
    if (issues.length) { reportIssue(issues.join("\n").replaceAll("Tata Bahasa", "Pola Kalimat")); return; }
    await write(async () => {
      const saved = await saveDailyStudio(studio.item, draft, studio.baseline);
      const baseline = dailyAssessment(saved); setStudio({ item: saved, baseline, draft: baseline }); setDirty(false); reportSaved("Seluruh soal dan bacaan berhasil disimpan.");
    });
  }
  const rows = request.data ?? [];
  const filtered = rows.filter(item => (tab === "all" || item.status === tab) && (!category || item.category === category) && item.title.toLocaleLowerCase("id-ID").includes(search.toLocaleLowerCase("id-ID")));
  const published = rows.filter(item => item.status === "published").length;
  const categoryLabel = (value: string) => dailyCategoryLabels[dailyCategories.indexOf(value as DailySettings["category"])];
  return <main className={`admin-page ${styles.page}`}>
    {studio ? <AdminTryoutQuestionBuilder key={`${studio.item.id}:${studio.item.category}`} draft={studio.draft} initialQuestion={null} fixedSession={dailyCategories.indexOf(studio.item.category)} studioTitle="Latihan Harian" saveLabel="Simpan Latihan Harian" busy={busy} error={error} saveStatus={message} onDirtyChange={setDirty} onUploadBusyChange={setUploading} onChange={draft => { setStudio({ ...studio, draft }); setDirty(true); }} onSave={saveQuestions} closeLabel="Kembali ke Pengaturan" onClose={closeStudio} onDelete={async () => {}} /> : results ? <><AdminTryoutResults key={results.id} id={String(results.id)} title={results.title} level={results.target_level} assessmentLabel="Latihan Harian" showPassing={false} reportsApi={dailyReportsApi} packages={rows.map(item => ({ id: String(item.id), title: item.title, context: item.target_level }))} onPackageChange={id => setResults(rows.find(item => String(item.id) === id) ?? null)} onClose={() => setResults(null)} /></> : form ? <>
      <button className="button" type="button" disabled={busy || uploading} onClick={close}><FiArrowLeft aria-hidden /> Kembali ke daftar</button>
      <AdminPageHeader title={editing ? "Edit Latihan Harian" : "Buat Latihan Harian"} description="Atur informasi, lengkapi soal, lalu terbitkan latihan." />
      <form noValidate onSubmit={submit} onChange={() => setDirty(true)} className={styles.form}>
        <fieldset disabled={busy || uploading} className={styles.fields}>
          <section className={styles.card} aria-labelledby="daily-info"><h2 id="daily-info">Informasi latihan</h2><p>Latihan yang sama untuk semua membership.</p>
            <label className="admin-field">Judul<input required placeholder="Contoh: Latihan Pola Kalimat N5" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label>
            <div className={styles.fieldRow}><label className="admin-field">Kategori<select value={form.category} disabled={!!editing?.question_count} onChange={event => setForm({ ...form, category: event.target.value as DailySettings["category"] })}>{dailyCategories.map((value, index) => <option key={value} value={value}>{dailyCategoryLabels[index]}</option>)}</select></label>
            <label className="admin-field">Target level<select required value={form.target_level} onChange={event => setForm({ ...form, target_level: event.target.value })}><option value="">Pilih level</option>{form.target_level && !catalog.data.some(item => item.code === form.target_level) && <option value={form.target_level}>{form.target_level}</option>}{catalog.data.filter(item => item.status === "active").map(item => <option key={item.code} value={item.code}>{item.name} ({item.code})</option>)}</select></label></div>
            {!!editing?.question_count && <p>Kategori dikunci karena soal sudah tersedia.</p>}
            {catalog.error && <p role="alert">Level belum dapat dimuat. <button className="button" type="button" onClick={catalog.reload}>Coba Lagi</button></p>}
          </section>
        </fieldset>
        <aside className={styles.card} aria-label="Ringkasan latihan"><h2>Ringkasan latihan</h2><span className={styles.badge} data-published={form.status === "published"}>{form.status === "published" ? "Terbit" : "Draft"}</span><h3>{form.title || "Judul latihan belum diisi"}</h3>
          <dl className={styles.summary}><div><dt>Kategori</dt><dd>{categoryLabel(form.category)}</dd></div><div><dt>Target level</dt><dd>{form.target_level.toUpperCase() || "Belum dipilih"}</dd></div><div><dt>Jumlah soal</dt><dd>{editing?.question_count ?? 0} soal</dd></div></dl>
          <p>Isi informasi latihan, lalu pilih Kelola Soal. Latihan dapat diterbitkan setelah soal lengkap.</p>
          {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
          <div className={styles.formActions}><button className="button" type="submit" value="draft" disabled={busy || uploading || catalog.loading || !!catalog.error}><FiFileText aria-hidden /> Simpan Draft</button><button className="button" type="submit" value="studio" disabled={busy || uploading || catalog.loading || !!catalog.error}><FiBookOpen aria-hidden /> Kelola Soal</button><button className="button button-primary" type="submit" value="published" disabled={busy || uploading || catalog.loading || !!catalog.error || !editing?.question_count}><FiCheckCircle aria-hidden /> Publikasikan</button></div>
          {!editing?.question_count && <p>Publikasikan aktif setelah soal ditambahkan dan disimpan.</p>}
        </aside>
      </form>
    </> : <>
      <AdminPageHeader title="Kelola Latihan Harian" description="Buat, terbitkan, dan pantau latihan harian dalam satu tempat." actions={<button className="button button-primary" type="button" disabled={busy || request.loading || !!request.error} onClick={() => { setEditing(null); setForm({ ...empty }); setError(""); setMessage(""); setDirty(false); }}><FiPlus aria-hidden /> Buat Latihan</button>} />
      <div className={styles.stats} aria-label="Statistik latihan"><div><FiBookOpen aria-hidden /><span>Total latihan<strong>{rows.length}</strong></span></div><div><FiCheckCircle aria-hidden /><span>Terbit<strong>{published}</strong></span></div><div><FiFileText aria-hidden /><span>Draft<strong>{rows.length - published}</strong></span></div></div>
      <section className={styles.toolbar} aria-label="Filter latihan"><div className={styles.tabs} role="tablist" aria-label="Status latihan">{[["all", "Semua"], ["published", "Terbit"], ["draft", "Draft"]].map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>{label}</button>)}</div><div className={styles.filters}><label className={styles.search}><FiSearch aria-hidden /><input aria-label="Cari judul latihan" placeholder="Cari judul latihan…" value={search} onChange={event => setSearch(event.target.value)} /></label><select aria-label="Filter kategori" value={category} onChange={event => setCategory(event.target.value)}><option value="">Semua kategori</option>{dailyCategories.map((value, index) => <option key={value} value={value}>{dailyCategoryLabels[index]}</option>)}</select></div></section>
      {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
      {request.error && <p role="alert">Daftar latihan belum dapat dimuat. <button className="button" type="button" onClick={request.retry}>Coba Lagi</button></p>}
      <AdminSection className={styles.list}><AdminDataTable caption="Daftar latihan harian" loading={request.loading} rows={filtered} rowKey={item => String(item.id)} columns={[
        { key: "title", header: "Judul", cell: item => <strong>{item.title}</strong> }, { key: "category", header: "Kategori", cell: item => dailyCategoryLabels[dailyCategories.indexOf(item.category)] }, { key: "level", header: "Target level", cell: item => item.target_level }, { key: "questions", header: "Jumlah soal", cell: item => `${item.question_count} soal` }, { key: "status", header: "Status", cell: item => <span className={styles.badge} data-published={item.status === "published"}>{item.status === "published" ? "Terbit" : "Draft"}</span> },
      ]} actions={{ cell: item => <div className="admin-row-actions"><button className="button" type="button" disabled={busy || dailyLocked(item)} onClick={() => void open(item, "settings")}><FiEdit2 aria-hidden /> Edit</button><button className="button" type="button" disabled={busy || dailyLocked(item)} onClick={() => void open(item, "studio")}><FiBookOpen aria-hidden /> Kelola Soal</button><button className="button" type="button" disabled={busy} onClick={() => setResults(item)}><FiBarChart2 aria-hidden /> Analisis</button><button className="button" type="button" disabled={busy || dailyLocked(item)} onClick={() => setDeleting(item)}><FiTrash2 aria-hidden /> Hapus</button>{dailyLocked(item) && <span>Sudah ada pengerjaan; dikunci</span>}</div> }} /></AdminSection>
    </>}
    <AdminDialog open={!!notice} title={notice?.success ? "Berhasil disimpan" : "Latihan belum dapat disimpan"} close={() => setNotice(null)} actions={<button type="button" className="button button-primary" onClick={() => setNotice(null)}>Mengerti</button>}><p style={{ whiteSpace: "pre-line" }}>{notice?.message}</p>{notice && !notice.success && <p>Perbaiki bagian yang disebutkan, lalu simpan kembali. Isianmu tetap tersedia.</p>}</AdminDialog>
    <AdminDialog open={!!deleting} title="Hapus Latihan Harian" close={() => { if (!busy) setDeleting(null); }} actions={<button className="button" type="button" disabled={busy} onClick={() => void write(async () => { if (deleting) await deleteDailyPractice(deleting.id); setDeleting(null); setMessage("Latihan dihapus."); })}>Hapus Permanen</button>}><p>Hapus {deleting?.title}? Tindakan ini tidak dapat dibatalkan.</p>{error && <p role="alert">{error}</p>}</AdminDialog>
  </main>;
}
