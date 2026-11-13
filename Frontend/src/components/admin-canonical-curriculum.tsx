"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import { AdminDataTable, AdminDialog, AdminSection, AdminStatusBadge } from "@/components/admin-primitives";
import { AdminJourneyToolbar } from "@/components/admin-journey-toolbar";
import { useLearningRequest } from "@/components/learning-hooks";
import { adminLearningContext, adminLearningDelete, adminLearningList, adminLearningSave, type AdminChapter, type AdminFlashcard } from "@/lib/admin-learning-api";

export function AdminCanonicalCurriculum({ flashcards = false }: { flashcards?: boolean; nested?: boolean }) {
  const resource = flashcards ? "flashcards" : "chapters";
  const load = useCallback(async (signal: AbortSignal) => {
    const context = await adminLearningContext(signal);
    const rows = flashcards ? await adminLearningList<AdminFlashcard>("flashcards", signal) : context.chapters;
    const programs = flashcards ? context.programs.filter(item => item.family === "jlpt" && /^n[1-5]$/.test(item.code)) : context.programs;
    const chapters = flashcards ? context.chapters.filter(item => programs.some(program => program.id === item.program_id)) : context.chapters;
    return { programs, chapters, rows: flashcards ? rows : [...rows].sort((a, b) => a.sort_order - b.sort_order || ("chapter_number" in a && "chapter_number" in b ? a.chapter_number - b.chapter_number : 0) || a.id - b.id) };
  }, [flashcards]);
  const request = useLearningRequest(load, `admin/${resource}`);
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [id, setId] = useState<number | undefined>();
  const [previewFlipped, setPreviewFlipped] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [selectedProgram, setProgram] = useState("");
  const program = selectedProgram || (!flashcards ? String(request.data?.programs[0]?.id ?? "") : "");
  const [chapter, setChapter] = useState("");
  const chapters = request.data?.chapters.filter(item => !program || String(item.program_id) === program).sort((a, b) => a.sort_order - b.sort_order || a.chapter_number - b.chapter_number || a.id - b.id) ?? [];
  const visible = request.data?.rows.filter(row => "chapter_id" in row ? chapters.some(item => item.id === row.chapter_id) && (!chapter || String(row.chapter_id) === chapter) : !program || String(row.program_id) === program) ?? [];
  function edit(row?: AdminChapter | AdminFlashcard) {
    setId(row?.id); setError(""); setPreviewFlipped(false);
    setDraft(flashcards ? { chapter_id: String(row && "chapter_id" in row ? row.chapter_id : chapter || (program ? chapters[0]?.id : "") || ""), japanese: row && "japanese" in row ? row.japanese : "", meaning: row && "meaning" in row ? row.meaning : "", example: row && "example" in row ? row.example ?? "" : "", sort_order: String(row?.sort_order ?? 0), status: row?.status ?? "draft" } : { program_id: String(row && "program_id" in row ? row.program_id : program || request.data?.programs[0]?.id || ""), chapter_number: String(row && "chapter_number" in row ? row.chapter_number : 1), title: row && "title" in row ? row.title : "", description: row && "description" in row ? row.description ?? "" : "", sort_order: String(row ? chapters.findIndex(item => item.id === row.id) + 1 : chapters.length + 1), status: row?.status ?? "draft" });
  }
  const draftChapter = request.data?.chapters.find(item => String(item.id) === draft?.chapter_id);
  const draftProgram = draft?.program_id ?? String(draftChapter?.program_id ?? "");
  const draftChapters = request.data?.chapters.filter(item => String(item.program_id) === draftProgram) ?? [];
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || pending.current) return;
    const numeric = flashcards ? ["chapter_id", "sort_order"] : ["program_id", "chapter_number", "sort_order"];
    if (numeric.some(key => !/^\d+$/.test(draft[key]) || !Number.isSafeInteger(Number(draft[key])) || Number(draft[key]) < (key === "sort_order" && flashcards ? 0 : 1))) { setError("Periksa kembali data yang dimasukkan."); return; }
    if (flashcards && !draftChapters.some(item => String(item.id) === draft.chapter_id)) { setError("Pilih chapter sesuai program JLPT N5–N1."); return; }
    pending.current = true; setBusy(true); setError("");
    try {
      await adminLearningSave(resource, Object.fromEntries(Object.entries(draft).filter(([key]) => !flashcards || !["program_id", "sort_order"].includes(key)).map(([key, value]) => [key, numeric.includes(key) ? Number(value) - (key === "sort_order" && !flashcards ? 1 : 0) : value])), id);
      setDraft(null); request.retry();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Permintaan belum berhasil."); }
    finally { pending.current = false; setBusy(false); }
  }
  async function remove(rowId: number) {
    if (pending.current || !window.confirm("Hapus materi ini?")) return;
    pending.current = true; setBusy(true);
    try { await adminLearningDelete(resource, rowId); request.retry(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Permintaan belum berhasil."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <div className="curriculum-tab-content"><AdminJourneyToolbar requireProgram={!flashcards} programs={request.data?.programs ?? []} chapters={flashcards ? request.data?.chapters.map(item => ({ ...item, title: `${request.data?.programs.find(parent => parent.id === item.program_id)?.name} · Chapter ${item.chapter_number} — ${item.title}` })) ?? [] : undefined} program={program} chapter={chapter} onProgram={value => { setProgram(value); setChapter(""); }} onChapter={setChapter}><button type="button" className="button button-primary" disabled={!request.data || busy} onClick={() => edit()}>+ Tambah {flashcards ? "Kartu" : "Chapter"}</button></AdminJourneyToolbar>{(error || request.error) && <p role="alert">{error || request.error}</p>}{request.error && <button type="button" onClick={request.retry}>Coba Lagi</button>}{(!request.error || request.data) && <AdminSection><AdminDataTable<AdminChapter | AdminFlashcard> loading={request.loading && !request.data} caption={flashcards ? "Flashcard" : "Chapter"} rows={visible} empty="Belum ada konten untuk filter ini." rowKey={row => String(row.id)} columns={[
    { key: "title", header: flashcards ? "Depan kartu" : "Judul", cell: row => "japanese" in row ? row.japanese : row.title },
    { key: "parent", header: "Konteks", cell: row => { const parent = "chapter_id" in row ? request.data?.chapters.find(item => item.id === row.chapter_id) : undefined; return parent ? `${request.data?.programs.find(item => item.id === parent.program_id)?.name} · Chapter ${parent.chapter_number} — ${parent.title}` : request.data?.programs.find(item => "program_id" in row && item.id === row.program_id)?.name; } },
    ...(!flashcards ? [{ key: "order", header: "Urutan", cell: (row: AdminChapter | AdminFlashcard) => visible.findIndex(item => item.id === row.id) + 1 }] : []),
    { key: "status", header: "Status", cell: row => <AdminStatusBadge status={row.status === "published" ? "Published" : "Draft"} /> },
  ]} actions={{ cell: row => <div className="admin-page-actions"><button type="button" disabled={busy} onClick={() => edit(row)}>Edit</button><button type="button" disabled={busy} onClick={() => void remove(row.id)}>Hapus</button></div> }} /></AdminSection>}<AdminDialog className={flashcards ? "admin-flashcard-dialog" : ""} open={Boolean(draft)} title={flashcards ? id ? "Edit Kartu" : "Tambah Kartu" : "Chapter"} close={() => { if (!busy) setDraft(null); }}>{draft && <form className="admin-prototype-form" onSubmit={save}>
    {flashcards ? <>
      <p>Pilih program dan chapter tujuan. Urutan kartu diacak otomatis saat siswa belajar.</p>
      <div className="admin-flashcard-context">
        <label className="admin-field">Program<select required value={draftProgram} onChange={event => { setDraft({ ...draft, program_id: event.target.value, chapter_id: "" }); setPreviewFlipped(false); }}><option value="">Pilih program JLPT</option>{request.data?.programs.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label className="admin-field">Chapter<select required disabled={!draftProgram} value={draft.chapter_id} onChange={event => setDraft({ ...draft, chapter_id: event.target.value })}><option value="">Pilih chapter</option>{draftChapters.map(item => <option value={item.id} key={item.id}>Chapter {item.chapter_number} — {item.title}</option>)}</select></label>
      </div>
    </> : <label className="admin-field">Program<select required value={draft.program_id} onChange={event => setDraft({ ...draft, program_id: event.target.value, sort_order: String((request.data?.chapters.filter(item => String(item.program_id) === event.target.value && item.id !== id).length ?? 0) + 1) })}>{request.data?.programs.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
    {Object.entries(draft).filter(([key]) => !["chapter_id", "program_id", "status", ...(flashcards ? ["sort_order"] : [])].includes(key)).map(([key, value]) => <label className="admin-field" key={key}>{({ title: "Judul", description: "Deskripsi", chapter_number: "Chapter", japanese: "Depan kartu (teks Jepang)", reading: "Bacaan (wajib untuk penyimpanan)", meaning: "Belakang kartu (arti)", example: "Contoh kalimat (opsional, belakang kartu)", sort_order: "Urutan" } as Record<string, string>)[key]}<input required={!["description", "example"].includes(key)} type={["sort_order", "chapter_number"].includes(key) ? "number" : "text"} min={key === "sort_order" && !flashcards ? 1 : undefined} max={key === "sort_order" && !flashcards ? (request.data?.chapters.filter(item => String(item.program_id) === draft.program_id && item.id !== id).length ?? 0) + 1 : undefined} placeholder={({ japanese: "Contoh: 学校", reading: "Contoh: がっこう", meaning: "Contoh: Sekolah", example: "Contoh: 毎日学校へ行きます。", ...(flashcards ? { sort_order: "Contoh: 1" } : {}) } as Record<string, string>)[key]} value={value} onChange={event => setDraft({ ...draft, [key]: event.target.value })} /></label>)}
    {flashcards && <section className="admin-flashcard-preview" aria-label="Pratinjau flashcard"><h3>Pratinjau kartu siswa</h3><p>Klik kartu atau tekan Enter untuk membalik.</p><div className="flashcard-session"><button type="button" className={`flashcard-surface${previewFlipped ? " flipped" : ""}`} aria-label="Balik pratinjau kartu" aria-pressed={previewFlipped} onClick={() => setPreviewFlipped(value => !value)}><div className="flashcard-inner"><div className="flash-face flash-front" aria-hidden={previewFlipped}><small>Japanese</small><ruby lang="ja">{draft.japanese || "Teks Jepang"}</ruby></div><div className="flash-face flash-back" aria-hidden={!previewFlipped}><span className="back-word"><small>Arti</small><strong>{draft.meaning || "Arti"}</strong></span>{draft.example && <span className="example-block"><small>Contoh kalimat</small><span className="example-japanese" lang="ja">{draft.example}</span></span>}</div></div></button></div></section>}
    <label className="admin-field">Status<select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value })}><option value="draft">Draft</option><option value="published">Published</option></select></label>{error && <p role="alert">{error}</p>}<div className="admin-flashcard-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={() => setDraft(null)}>Batal</button><button className="button button-primary" type="submit" disabled={busy}>Simpan</button></div>
  </form>}</AdminDialog></div>;
}
