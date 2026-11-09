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
    return { ...context, rows: flashcards ? rows : [...rows].sort((a, b) => a.sort_order - b.sort_order || ("chapter_number" in a && "chapter_number" in b ? a.chapter_number - b.chapter_number : 0) || a.id - b.id) };
  }, [flashcards]);
  const request = useLearningRequest(load, `admin/${resource}`);
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [id, setId] = useState<number | undefined>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [selectedProgram, setProgram] = useState("");
  const program = selectedProgram || (!flashcards ? String(request.data?.programs[0]?.id ?? "") : "");
  const [chapter, setChapter] = useState("");
  const chapters = request.data?.chapters.filter(item => !program || String(item.program_id) === program).sort((a, b) => a.sort_order - b.sort_order || a.chapter_number - b.chapter_number || a.id - b.id) ?? [];
  const visible = request.data?.rows.filter(row => "chapter_id" in row ? chapters.some(item => item.id === row.chapter_id) && (!chapter || String(row.chapter_id) === chapter) : !program || String(row.program_id) === program) ?? [];
  function edit(row?: AdminChapter | AdminFlashcard) {
    setId(row?.id); setError("");
    setDraft(flashcards ? { chapter_id: String(row && "chapter_id" in row ? row.chapter_id : chapter || chapters[0]?.id || ""), japanese: row && "japanese" in row ? row.japanese : "", ...(!row ? { reading: "" } : {}), meaning: row && "meaning" in row ? row.meaning : "", example: row && "example" in row ? row.example ?? "" : "", sort_order: String(row?.sort_order ?? 0), status: row?.status ?? "draft" } : { program_id: String(row && "program_id" in row ? row.program_id : program || request.data?.programs[0]?.id || ""), chapter_number: String(row && "chapter_number" in row ? row.chapter_number : 1), title: row && "title" in row ? row.title : "", description: row && "description" in row ? row.description ?? "" : "", sort_order: String(row ? chapters.findIndex(item => item.id === row.id) + 1 : chapters.length + 1), status: row?.status ?? "draft" });
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || pending.current) return;
    const numeric = flashcards ? ["chapter_id", "sort_order"] : ["program_id", "chapter_number", "sort_order"];
    if (numeric.some(key => !/^\d+$/.test(draft[key]) || !Number.isSafeInteger(Number(draft[key])) || Number(draft[key]) < (key === "sort_order" && flashcards ? 0 : 1))) { setError("Periksa kembali data yang dimasukkan."); return; }
    pending.current = true; setBusy(true); setError("");
    try {
      await adminLearningSave(resource, Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, numeric.includes(key) ? Number(value) - (key === "sort_order" && !flashcards ? 1 : 0) : value])), id);
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
  return <div className="curriculum-tab-content"><AdminJourneyToolbar requireProgram={!flashcards} programs={request.data?.programs ?? []} chapters={flashcards ? request.data?.chapters ?? [] : undefined} program={program} chapter={chapter} onProgram={value => { setProgram(value); setChapter(""); }} onChapter={setChapter}><button type="button" className="button button-primary" disabled={!request.data || busy} onClick={() => edit()}>+ Tambah {flashcards ? "Kartu" : "Chapter"}</button></AdminJourneyToolbar>{(error || request.error) && <p role="alert">{error || request.error}</p>}{request.error && <button type="button" onClick={request.retry}>Coba Lagi</button>}{(!request.error || request.data) && <AdminSection><AdminDataTable<AdminChapter | AdminFlashcard> loading={request.loading && !request.data} caption={flashcards ? "Flashcard" : "Chapter"} rows={visible} empty="Belum ada konten untuk filter ini." rowKey={row => String(row.id)} columns={[
    { key: "title", header: flashcards ? "Depan kartu" : "Judul", cell: row => "japanese" in row ? row.japanese : row.title },
    { key: "parent", header: "Konteks", cell: row => "chapter_id" in row ? request.data?.chapters.find(item => item.id === row.chapter_id)?.title : request.data?.programs.find(item => item.id === row.program_id)?.name },
    { key: "order", header: "Urutan", cell: row => flashcards ? row.sort_order : visible.findIndex(item => item.id === row.id) + 1 },
    { key: "status", header: "Status", cell: row => <AdminStatusBadge status={row.status === "published" ? "Published" : "Draft"} /> },
  ]} actions={{ cell: row => <div className="admin-page-actions"><button type="button" disabled={busy} onClick={() => edit(row)}>Edit</button><button type="button" disabled={busy} onClick={() => void remove(row.id)}>Hapus</button></div> }} /></AdminSection>}<AdminDialog open={Boolean(draft)} title={flashcards ? "Flashcard" : "Chapter"} close={() => { if (!busy) setDraft(null); }}>{draft && <form className="admin-prototype-form" onSubmit={save}>
    {flashcards && <p>Isi teks Jepang di depan, arti dan contoh opsional di belakang. Siswa membalik kartu untuk melihat jawabannya. {id ? "Bacaan lama tetap disimpan tanpa diubah." : "Bacaan masih wajib untuk penyimpanan, tetapi tidak ditampilkan pada kartu siswa."}</p>}
    <label className="admin-field">{flashcards ? "Chapter" : "Program"}<select required value={draft[flashcards ? "chapter_id" : "program_id"]} onChange={event => setDraft({ ...draft, [flashcards ? "chapter_id" : "program_id"]: event.target.value, ...(!flashcards ? { sort_order: String((request.data?.chapters.filter(item => String(item.program_id) === event.target.value && item.id !== id).length ?? 0) + 1) } : {}) })}>{(flashcards ? request.data?.chapters : request.data?.programs)?.map(item => <option value={item.id} key={item.id}>{"title" in item ? item.title : item.name}</option>)}</select></label>
    {Object.entries(draft).filter(([key]) => !["chapter_id", "program_id", "status"].includes(key)).map(([key, value]) => <label className="admin-field" key={key}>{({ title: "Judul", description: "Deskripsi", chapter_number: "Chapter", japanese: "Depan kartu (teks Jepang)", reading: "Bacaan (wajib untuk penyimpanan)", meaning: "Belakang kartu (arti)", example: "Contoh kalimat (opsional, belakang kartu)", sort_order: "Urutan" } as Record<string, string>)[key]}<input required={!["description", "example"].includes(key)} type={["sort_order", "chapter_number"].includes(key) ? "number" : "text"} min={key === "sort_order" && !flashcards ? 1 : undefined} max={key === "sort_order" && !flashcards ? (request.data?.chapters.filter(item => String(item.program_id) === draft.program_id && item.id !== id).length ?? 0) + 1 : undefined} placeholder={({ japanese: "Contoh: 学校", reading: "Contoh: がっこう", meaning: "Contoh: Sekolah", example: "Contoh: 毎日学校へ行きます。", ...(flashcards ? { sort_order: "Contoh: 1" } : {}) } as Record<string, string>)[key]} value={value} onChange={event => setDraft({ ...draft, [key]: event.target.value })} /></label>)}
    {flashcards && <section aria-label="Pratinjau flashcard"><h3>Pratinjau kartu siswa</h3><p>Depan dan belakang ditampilkan bersamaan di sini.</p><div><small>Depan kartu</small><p lang="ja">{draft.japanese || "Teks Jepang"}</p></div><div><small>Belakang kartu — Arti</small><p>{draft.meaning || "Arti"}</p>{draft.example && <><small>Contoh kalimat</small><p lang="ja">{draft.example}</p></>}</div></section>}
    <label className="admin-field">Status<select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value })}><option value="draft">Draft</option><option value="published">Published</option></select></label>{error && <p role="alert">{error}</p>}<button type="button" className="button" disabled={busy} onClick={() => setDraft(null)}>Batal</button><button className="button button-primary" type="submit" disabled={busy}>Simpan</button>
  </form>}</AdminDialog></div>;
}
