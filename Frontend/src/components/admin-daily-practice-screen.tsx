"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AdminDataTable, AdminDialog, AdminPageHeader, AdminSection, AdminShell, AdminStatusBadge } from "@/components/admin-primitives";
import { AdminTryoutQuestionBuilder } from "@/components/admin-tryout-question-builder";
import { AdminTryoutResults } from "@/components/admin-tryout-results";
import { assessmentPassageError, assessmentQuestionError, type AdminAssessment } from "@/components/admin-assessment-fixtures";
import { useEditorNavigation } from "@/components/admin-editor-navigation";
import { useLearningRequest } from "@/components/learning-hooks";
import { useContent } from "@/lib/public-content-api";
import { ApiError } from "@/lib/api";
import styles from "./admin-daily-practice.module.css";
import { dailyAssessment, dailyCategories, dailyCategoryLabels, dailyLocked, dailyReportsApi, deleteDailyPractice, loadDailyPractice, loadDailyPractices, saveDailySettings, saveDailyStudio, type DailyPractice, type DailySettings } from "@/lib/admin-daily-practice-api";

const empty: DailySettings = { title: "", category: "vocabulary", target_level: "", status: "draft", starts_at: "", ends_at: "" };
const localWib = (value: string) => value ? new Date(new Date(value).getTime() + 7 * 3600000).toISOString().slice(0, 16) : "";
const date = (value: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value));
const errorText = (cause: unknown) => cause instanceof ApiError ? [cause.message, ...Object.entries(cause.errors).flatMap(([field, messages]) => messages.map(message => `${field}: ${message}`))].join("\n") : cause instanceof Error ? cause.message : "Permintaan gagal. Coba lagi.";

export function AdminDailyPracticeScreen() {
  return <AdminShell current="/admin/latihan-harian"><DailyPracticeWorkspace /></AdminShell>;
}

function DailyPracticeWorkspace() {
  const request = useLearningRequest(loadDailyPractices, "admin-daily-practices");
  const catalog = useContent<{ code: string; name: string; status: string }>("/api/admin/programs");
  const [form, setForm] = useState<DailySettings | null>(null);
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
  async function write(action: () => Promise<void>) {
    if (busyRef.current || uploading) return;
    busyRef.current = true; setBusy(true); setError(""); setMessage("");
    try { await action(); request.retry(); }
    catch (cause) { setError(errorText(cause)); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function open(item: DailyPractice, mode: "settings" | "studio") {
    await write(async () => {
      const detail = await loadDailyPractice(item.id);
      if (dailyLocked(detail)) throw new Error("Latihan sudah memiliki attempt. Edit dan hapus dikunci.");
      if (mode === "studio") { const baseline = dailyAssessment(detail); setStudio({ item: detail, baseline, draft: baseline }); }
      else { setEditing(detail); setForm({ ...detail, starts_at: localWib(detail.starts_at), ends_at: localWib(detail.ends_at) }); }
      setDirty(false);
    });
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    if (form.starts_at.slice(0, 10) !== form.ends_at.slice(0, 10) || form.ends_at <= form.starts_at) { setError("Mulai dan selesai harus pada tanggal WIB yang sama; selesai setelah mulai."); return; }
    void write(async () => {
      const saved = await saveDailySettings({ ...form, starts_at: `${form.starts_at}:00+07:00`, ends_at: `${form.ends_at}:00+07:00` }, editing?.id);
      setForm(null); setEditing(null); setDirty(false); setMessage("Pengaturan tersimpan.");
      if (!editing) { const detail = await loadDailyPractice(saved.id); const baseline = dailyAssessment(detail); setStudio({ item: detail, baseline, draft: baseline }); }
    });
  }
  async function saveQuestions(draft: AdminAssessment) {
    if (!studio) return;
    const issue = draft.questions.map(question => assessmentQuestionError(question, draft)).find(Boolean) || (draft.passages ?? []).map(passage => assessmentPassageError(passage)).find(Boolean);
    if (issue) { setError(issue); return; }
    await write(async () => {
      const saved = await saveDailyStudio(studio.item, draft, studio.baseline);
      const baseline = dailyAssessment(saved); setStudio({ item: saved, baseline, draft: baseline }); setDirty(false); setMessage("Seluruh soal dan bacaan tersimpan.");
    });
  }
  const rows = request.data ?? [];
  return <main className="admin-page">
    {studio ? <AdminTryoutQuestionBuilder key={`${studio.item.id}:${studio.item.category}`} draft={studio.draft} initialQuestion={null} fixedSession={dailyCategories.indexOf(studio.item.category)} studioTitle="Latihan Harian" saveLabel="Simpan Latihan Harian" busy={busy} error={error} saveStatus={message} onDirtyChange={setDirty} onUploadBusyChange={setUploading} onChange={draft => { setStudio({ ...studio, draft }); setDirty(true); }} onSave={saveQuestions} onClose={close} onDelete={async () => {}} /> : results ? <><button className="button" type="button" onClick={() => setResults(null)}>Kembali ke daftar</button><AdminTryoutResults key={results.id} id={String(results.id)} title={results.title} level={results.target_level} assessmentLabel="Latihan Harian" showPassing={false} reportsApi={dailyReportsApi} packages={rows.map(item => ({ id: String(item.id), title: item.title, context: item.target_level }))} onPackageChange={id => setResults(rows.find(item => String(item.id) === id) ?? null)} onClose={() => setResults(null)} /></> : <>
      <AdminPageHeader title="Latihan Harian" description="Latihan mandiri untuk semua membership. Jadwal WIB; beberapa latihan dan jadwal tumpang tindih diperbolehkan." actions={<button className="button button-primary" type="button" disabled={busy || request.loading || !!request.error} onClick={() => { setEditing(null); setForm({ ...empty }); setError(""); setDirty(false); }}>Buat Latihan</button>} />
      {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
      {request.error && <p role="alert">{request.error} <button className="button" type="button" onClick={request.retry}>Coba Lagi</button></p>}
      <AdminSection className={styles.list}><AdminDataTable caption="Daftar latihan harian" loading={request.loading} rows={rows} rowKey={item => String(item.id)} columns={[
        { key: "title", header: "Judul", cell: item => item.title }, { key: "category", header: "Kategori", cell: item => dailyCategoryLabels[dailyCategories.indexOf(item.category)] }, { key: "level", header: "Target level", cell: item => item.target_level }, { key: "window", header: "Jadwal WIB", cell: item => `${date(item.starts_at)} – ${date(item.ends_at)}` }, { key: "status", header: "Status", cell: item => <AdminStatusBadge status={item.status} /> }, { key: "questions", header: "Soal", cell: item => item.question_count },
      ]} actions={{ cell: item => <div className="admin-row-actions"><button className="button" type="button" disabled={busy || dailyLocked(item)} onClick={() => void open(item, "settings")}>Edit</button><button className="button" type="button" disabled={busy || dailyLocked(item)} onClick={() => void open(item, "studio")}>Kelola Soal</button><button className="button" type="button" disabled={busy} onClick={() => setResults(item)}>Analisis</button><button className="button" type="button" disabled={busy || dailyLocked(item)} onClick={() => setDeleting(item)}>Hapus</button>{dailyLocked(item) && <span>Sudah ada pengerjaan; dikunci</span>}</div> }} /></AdminSection>
    </>}
    <AdminDialog open={form !== null} title={editing ? "Edit Latihan Harian" : "Buat Latihan Harian"} close={close}>
      {form && <form onSubmit={submit} onChange={() => setDirty(true)}><fieldset disabled={busy} className="admin-form-grid">
        <label className="admin-field">Judul<input required value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label>
        <label className="admin-field">Kategori<select value={form.category} disabled={!!editing?.question_count} onChange={event => setForm({ ...form, category: event.target.value as DailySettings["category"] })}>{dailyCategories.map((category, index) => <option key={category} value={category}>{dailyCategoryLabels[index]}</option>)}</select></label>
        <label className="admin-field">Target level<select required value={form.target_level} onChange={event => setForm({ ...form, target_level: event.target.value })}><option value="">Pilih level</option>{form.target_level && !catalog.data.some(item => item.code === form.target_level) && <option value={form.target_level}>{form.target_level}</option>}{catalog.data.filter(item => item.status === "active").map(item => <option key={item.code} value={item.code}>{item.name} ({item.code})</option>)}</select></label>
        {catalog.error && <p role="alert">{catalog.error}</p>}
        <label className="admin-field">Mulai (WIB)<input required type="datetime-local" value={form.starts_at} onChange={event => setForm({ ...form, starts_at: event.target.value })} /></label>
        <label className="admin-field">Selesai (WIB)<input required type="datetime-local" value={form.ends_at} onChange={event => setForm({ ...form, ends_at: event.target.value })} /></label>
        <label className="admin-field">Status<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value as DailySettings["status"] })}><option value="draft">Draft</option><option value="published" disabled={!editing}>Published</option></select></label>
        <p>Simpan draft terlebih dahulu, lengkapi soal, lalu terbitkan melalui Edit. Semua membership mendapat latihan yang sama. Kategori dikunci setelah soal tersedia. Edit dan hapus dikunci setelah attempt dimulai.</p>
        {error && <p role="alert">{error}</p>}<button className="button button-primary" type="submit" disabled={catalog.loading || !!catalog.error}>Simpan Pengaturan</button>
      </fieldset></form>}
    </AdminDialog>
    <AdminDialog open={!!deleting} title="Hapus Latihan Harian" close={() => { if (!busy) setDeleting(null); }} actions={<button className="button" type="button" disabled={busy} onClick={() => void write(async () => { if (deleting) await deleteDailyPractice(deleting.id); setDeleting(null); setMessage("Latihan dihapus."); })}>Hapus Permanen</button>}><p>Hapus {deleting?.title}? Tindakan ini tidak dapat dibatalkan.</p>{error && <p role="alert">{error}</p>}</AdminDialog>
  </main>;
}
