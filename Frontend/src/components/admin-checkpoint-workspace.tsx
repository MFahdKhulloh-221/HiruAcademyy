"use client";

import { useCallback, useState } from "react";
import { AdminDialog, AdminPageHeader, AdminShell, AdminTabs } from "@/components/admin-primitives";
import { AdminCheckpointPackages } from "@/components/admin-checkpoint-packages";
import { AdminJourneyToolbar } from "@/components/admin-journey-toolbar";
import { useLearningRequest } from "@/components/learning-hooks";
import { adminLearningContext } from "@/lib/admin-learning-api";
import { apiRequest } from "@/lib/api";
import { PlacementRichText, PlacementTextEditor } from "@/components/placement-rich-text";
import { placementText } from "@/lib/placement-rich-text";
import styles from "./admin-tryout-builder.module.css";
import placement from "./admin-placement-builder.module.css";

type Question = { id?: number; chapter_id?: number; question: string; options: Record<string, string>; correct_option: string; explanation: string | null; sort_order: number; status: "draft" | "published" };
const letters = ["A", "B", "C", "D"];
const endpoint = "/api/admin/checkpoint-questions";

export function AdminCheckpointWorkspace() {
  const load = useCallback(async (signal: AbortSignal) => {
    const [context, questions] = await Promise.all([adminLearningContext(signal), apiRequest<{ data: Question[] }>(endpoint, { signal })]);
    return { ...context, questions: questions.data };
  }, []);
  const request = useLearningRequest(load, "admin-checkpoint-bank");
  const [tab, setTab] = useState("Paket Checkpoint");
  const [program, setProgram] = useState("");
  const [chapter, setChapter] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [active, setActive] = useState<string | null>(null);
  const [buffer, setBuffer] = useState<Record<string, Question>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [answer, setAnswer] = useState("");
  const rows = [...(request.data?.questions ?? []).filter(row => !buffer[String(row.id)]).map(row => ({ key: String(row.id), row })), ...Object.entries(buffer).map(([key, row]) => ({ key, row }))].sort((a, b) => a.row.sort_order - b.row.sort_order || a.key.localeCompare(b.key));
  const filtered = rows.filter(({ row }, index) => (!program || request.data?.chapters.some(item => item.id === row.chapter_id && String(item.program_id) === program)) && (!chapter || String(row.chapter_id) === chapter) && (!status || row.status === status) && (!search.trim() || String(index + 1).includes(search.trim()) || placementText(row.question).toLowerCase().includes(search.trim().toLowerCase())));
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page, pages);
  const selected = rows.find(item => item.key === active)?.row;
  function update(next: Question) { if (active) setBuffer(current => ({ ...current, [active]: next })); }
  function add() {
    const key = crypto.randomUUID();
    setBuffer(current => ({ ...current, [key]: { chapter_id: chapter ? Number(chapter) : undefined, question: "", options: { A: "", B: "", C: "", D: "" }, correct_option: "A", explanation: "", sort_order: rows.reduce((max, item) => Math.max(max, item.row.sort_order), -1) + 1, status: "draft" } }));
    setActive(key); setTab("Bank Soal"); setPreview(false); setError(""); setMessage(""); setSearch(""); setStatus(""); setPage(Math.ceil((filtered.length + 1) / 10));
  }
  async function save() {
    if (!selected || busy) return;
    if (!selected.chapter_id || !placementText(selected.question).trim() || letters.some(letter => !placementText(selected.options[letter]).trim())) { setError("Pilih chapter dan isi pertanyaan serta pilihan A–D."); return; }
    const key = active!;
    setBusy(true); setError("");
    try {
      const { data } = await apiRequest<{ data: Question }>(`${endpoint}${selected.id ? `/${selected.id}` : ""}`, { method: selected.id ? "PATCH" : "POST", body: JSON.stringify(selected) });
      setBuffer(current => { const next = { ...current }; delete next[key]; next[String(data.id)] = data; return next; });
      setActive(String(data.id)); setMessage("Soal Checkpoint berhasil disimpan."); request.retry();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Soal belum berhasil disimpan. Isi tetap tersedia, silakan coba lagi."); }
    finally { setBusy(false); }
  }
  return <AdminShell current="/admin/checkpoint"><main className={`admin-page ${styles.workspace}`}>
    <AdminPageHeader title="Checkpoint" />
    <AdminTabs tabs={["Paket Checkpoint", "Bank Soal"]} active={tab} onChange={setTab} label="Pengelolaan Checkpoint" />
    {tab === "Paket Checkpoint" ? <AdminCheckpointPackages programs={request.data?.programs ?? []} chapters={request.data?.chapters ?? []} questions={request.data?.questions ?? []} /> : <>
      <AdminJourneyToolbar programs={request.data?.programs ?? []} chapters={request.data?.chapters ?? []} program={program} chapter={chapter} onProgram={value => { setProgram(value); setChapter(""); setPage(1); }} onChapter={value => { setChapter(value); setPage(1); }}><label className="admin-field">Status<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">Semua status</option><option value="draft">Draft</option><option value="published">Published</option></select></label><button type="button" className="button button-primary" disabled={!request.data || busy} onClick={add}>+ Tambah Soal</button></AdminJourneyToolbar>
      {request.error && <p role="alert">{request.error}<button type="button" onClick={request.retry}>Coba Lagi</button></p>}
      <p role="status">{message || "Perubahan ditahan selama halaman terbuka. Klik Simpan Soal sebelum meninggalkan halaman."}</p>{error && <p role="alert">{error}</p>}
      <div className={`${styles.twoPanels} ${selected ? styles.editing : ""}`}>
        <aside className={styles.questionList} aria-label="Daftar soal Checkpoint"><label className="admin-field">Cari nomor atau isi soal<input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label><ol>{filtered.slice((currentPage - 1) * 10, currentPage * 10).map(({ key, row }) => <li key={key}><button type="button" aria-current={active === key ? "step" : undefined} onClick={() => { setActive(key); setPreview(false); setError(""); }}><strong>Soal {rows.findIndex(item => item.key === key) + 1}</strong><span className={styles.summary}>{placementText(row.question) || "Soal baru"}</span></button></li>)}</ol><p>{filtered.length} soal · Halaman {currentPage} / {pages}</p><div className={placement.actions}><button type="button" className="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Sebelumnya</button><button type="button" className="button" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Berikutnya</button></div></aside>
        <section className={styles.questionEditor} aria-label="Editor soal Checkpoint">{selected ? <form className={`${placement.form} ${styles.form}`} onSubmit={event => { event.preventDefault(); void save(); }}><button type="button" className={`button ${styles.backToList}`} onClick={() => setActive(null)}>Kembali ke daftar soal</button><h2 className={styles.questionTitle}>Soal {rows.findIndex(item => item.key === active) + 1} - Checkpoint</h2><fieldset disabled={busy} className={placement.fields}>
          <label className="admin-field">Chapter soal<select required value={selected.chapter_id ?? ""} onChange={event => update({ ...selected, chapter_id: Number(event.target.value) })}><option value="">Pilih chapter</option>{request.data?.chapters.filter(item => !program || String(item.program_id) === program).map(item => <option key={item.id} value={item.id}>{request.data?.programs.find(p => p.id === item.program_id)?.name} / {item.title}</option>)}</select></label>
          <PlacementTextEditor label="Pertanyaan" value={selected.question} onChange={question => update({ ...selected, question })} />
          <div className={styles.answerGrid}>{letters.map(letter => <div key={letter} className={styles.answer}><PlacementTextEditor label={`Pilihan ${letter}`} value={selected.options[letter]} onChange={value => update({ ...selected, options: { ...selected.options, [letter]: value } })} /></div>)}</div>
          <label className="admin-field">Jawaban benar<select value={selected.correct_option} onChange={event => update({ ...selected, correct_option: event.target.value })}>{letters.map(letter => <option key={letter}>{letter}</option>)}</select></label>
          <details><summary>Penjelasan jawaban (opsional)</summary><PlacementTextEditor label="Penjelasan jawaban" value={selected.explanation ?? ""} onChange={explanation => update({ ...selected, explanation })} /></details><label className="admin-field">Status soal<select value={selected.status} onChange={event => update({ ...selected, status: event.target.value as Question["status"] })}><option value="draft">Draft</option><option value="published">Published</option></select></label>
        </fieldset><div className={placement.actions}><button type="button" className="button" onClick={() => { setPreview(!preview); setAnswer(""); }}>Pratinjau Siswa</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? "Menyimpan…" : "Simpan Soal"}</button><button type="button" className="button" disabled={busy} onClick={() => setConfirmDelete(true)}>Hapus Soal</button></div>
          {preview && <section className={placement.media} aria-label="Pratinjau Siswa"><h3>Pratinjau Siswa</h3><PlacementRichText value={selected.question} /><fieldset><legend>Pilihan jawaban</legend>{letters.map(letter => <label key={letter}><input type="radio" name="checkpoint-preview" checked={answer === letter} onChange={() => setAnswer(letter)} />{letter}. <PlacementRichText value={selected.options[letter]} /></label>)}</fieldset></section>}
        </form> : <p>Pilih soal atau klik Tambah Soal.</p>}</section>
      </div>
    </>}
    <AdminDialog open={confirmDelete} title="Hapus soal Checkpoint?" close={() => { if (!busy) setConfirmDelete(false); }} actions={<><button type="button" className="button" disabled={busy} onClick={() => setConfirmDelete(false)}>Batal</button><button type="button" className="button button-primary" disabled={busy} onClick={async () => { if (!selected || busy) return; setBusy(true); try { if (selected.id) await apiRequest(`${endpoint}/${selected.id}`, { method: "DELETE" }); setBuffer(current => { const next = { ...current }; delete next[active!]; return next; }); setActive(null); setConfirmDelete(false); request.retry(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Gagal menghapus soal."); setConfirmDelete(false); } finally { setBusy(false); } }}>Hapus</button></>}><p>Soal yang dihapus tidak dapat dikembalikan.</p></AdminDialog>
  </main></AdminShell>;
}
