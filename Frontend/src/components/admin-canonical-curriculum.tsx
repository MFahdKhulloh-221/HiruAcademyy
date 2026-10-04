"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import { AdminDataTable, AdminDialog, AdminPageHeader, AdminSection, AdminStatusBadge } from "@/components/admin-primitives";
import { useLearningRequest } from "@/components/learning-hooks";
import { adminLearningContext, adminLearningDelete, adminLearningList, adminLearningSave, type AdminChapter, type AdminFlashcard } from "@/lib/admin-learning-api";

export function AdminCanonicalCurriculum({ flashcards = false, nested = false }: { flashcards?: boolean; nested?: boolean }) {
  const resource = flashcards ? "flashcards" : "chapters";
  const load = useCallback(async (signal: AbortSignal) => {
    const context = await adminLearningContext(signal);
    const rows = flashcards ? await adminLearningList<AdminFlashcard>("flashcards", signal) : context.chapters;
    return { ...context, rows };
  }, [flashcards]);
  const request = useLearningRequest(load, `admin/${resource}`);
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [id, setId] = useState<number | undefined>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  function edit(row?: AdminChapter | AdminFlashcard) {
    setId(row?.id); setError("");
    setDraft(flashcards ? { chapter_id: String(row && "chapter_id" in row ? row.chapter_id : request.data?.chapters[0]?.id ?? ""), japanese: row && "japanese" in row ? row.japanese : "", reading: row && "reading" in row ? row.reading : "", meaning: row && "meaning" in row ? row.meaning : "", example: row && "example" in row ? row.example ?? "" : "", sort_order: String(row?.sort_order ?? 0), status: row?.status ?? "draft" } : { program_id: String(row && "program_id" in row ? row.program_id : request.data?.programs[0]?.id ?? ""), chapter_number: String(row && "chapter_number" in row ? row.chapter_number : 1), title: row && "title" in row ? row.title : "", description: row && "description" in row ? row.description ?? "" : "", sort_order: String(row?.sort_order ?? 0), status: row?.status ?? "draft" });
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || pending.current) return;
    const numeric = flashcards ? ["chapter_id", "sort_order"] : ["program_id", "chapter_number", "sort_order"];
    if (numeric.some(key => !/^\d+$/.test(draft[key]) || !Number.isSafeInteger(Number(draft[key])) || Number(draft[key]) < (key === "sort_order" ? 0 : 1))) { setError("Periksa kembali data yang dimasukkan."); return; }
    pending.current = true; setBusy(true); setError("");
    try {
      await adminLearningSave(resource, Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, numeric.includes(key) ? Number(value) : value])), id);
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
  return <div className="curriculum-tab-content"><AdminPageHeader headingLevel={nested ? 2 : 1} title={flashcards ? "Flashcard" : "Kurikulum"} actions={<button type="button" className="button button-primary" disabled={!request.data || busy} onClick={() => edit()}>Tambah {flashcards ? "Kartu" : "Chapter"}</button>} />{(error || request.error) && <p role="alert">{error || request.error}</p>}{request.loading && <p role="status">Memuat materi...</p>}{request.error && <button type="button" onClick={request.retry}>Coba Lagi</button>}<AdminSection><AdminDataTable<AdminChapter | AdminFlashcard> caption={flashcards ? "Flashcard" : "Chapter"} rows={request.data?.rows ?? []} rowKey={row => String(row.id)} columns={[
    { key: "title", header: flashcards ? "Japanese" : "Judul", cell: row => "japanese" in row ? <ruby>{row.japanese}<rt>{row.reading}</rt></ruby> : row.title },
    { key: "parent", header: "Konteks", cell: row => "chapter_id" in row ? request.data?.chapters.find(item => item.id === row.chapter_id)?.title : request.data?.programs.find(item => item.id === row.program_id)?.name },
    { key: "order", header: "Urutan", cell: row => row.sort_order },
    { key: "status", header: "Status", cell: row => <AdminStatusBadge status={row.status === "published" ? "Published" : "Draft"} /> },
  ]} actions={{ cell: row => <div className="admin-page-actions"><button type="button" disabled={busy} onClick={() => edit(row)}>Edit</button><button type="button" disabled={busy} onClick={() => void remove(row.id)}>Hapus</button></div> }} /></AdminSection><AdminDialog open={Boolean(draft)} title={flashcards ? "Flashcard" : "Chapter"} close={() => { if (!busy) setDraft(null); }}>{draft && <form className="admin-prototype-form" onSubmit={save}>
    <label className="admin-field">{flashcards ? "Chapter" : "Program"}<select required value={draft[flashcards ? "chapter_id" : "program_id"]} onChange={event => setDraft({ ...draft, [flashcards ? "chapter_id" : "program_id"]: event.target.value })}>{(flashcards ? request.data?.chapters : request.data?.programs)?.map(item => <option value={item.id} key={item.id}>{"title" in item ? item.title : item.name}</option>)}</select></label>
    {Object.entries(draft).filter(([key]) => !["chapter_id", "program_id", "status"].includes(key)).map(([key, value]) => <label className="admin-field" key={key}>{({ title: "Judul", description: "Deskripsi", chapter_number: "Chapter", japanese: "Japanese", reading: "Bacaan", meaning: "Arti", example: "Contoh kalimat", sort_order: "Urutan" } as Record<string, string>)[key]}<input required={!["description", "example"].includes(key)} type={["sort_order", "chapter_number"].includes(key) ? "number" : "text"} value={value} onChange={event => setDraft({ ...draft, [key]: event.target.value })} /></label>)}
    <label className="admin-field">Status<select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value })}><option value="draft">Draft</option><option value="published">Published</option></select></label>{error && <p role="alert">{error}</p>}<button className="button button-primary" type="submit" disabled={busy}>Simpan</button>
  </form>}</AdminDialog></div>;
}
