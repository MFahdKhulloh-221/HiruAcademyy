"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { LuSearch } from "react-icons/lu";
import { AdminMediaUpload, AdminVideoPreview } from "@/components/admin-media-upload";
import { validVideoReference } from "@/lib/admin-media";
import { adminLearningContext, adminLearningDelete, adminLearningList, adminLearningSave, type AdminMedia } from "@/lib/admin-learning-api";
import { AdminDataTable, AdminDialog, AdminFilterToolbar, AdminPageHeader, AdminSection, AdminShell, AdminStatusBadge } from "@/components/admin-primitives";

export const learningMediaContexts = ["DASAR", "N5", "N4", "N3", "N2", "N1", "SSW", "Interview"] as const;
export type LearningMedia = {
  id: string;
  title: string;
  description: string;
  context: string;
  chapter: string;
  chapterId?: number;
  programId?: number;
  resolvedUrl?: string;
  type: "Video" | "Tata Bahasa" | "Huruf/Kanji" | "Umum";
  file: File | null;
  filename: string;
  url: string;
  duration: string;
  order: string;
  status: "Draft" | "Published";
};

function safeVideoUrl(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

export function AdminLearningMediaPreview({ item }: { item: LearningMedia }) {
  const player = useRef<HTMLVideoElement>(null);
  const documentFrame = useRef<HTMLIFrameElement>(null);
  const video = item.type === "Video";
  useEffect(() => {
    if (!item.file) return;
    const element = video ? player.current : documentFrame.current;
    if (!element) return;
    const url = URL.createObjectURL(item.file);
    element.src = url;
    return () => { element.removeAttribute("src"); URL.revokeObjectURL(url); };
  }, [item.file, video]);
  return <section className="admin-learning-media-preview" aria-label="Pratinjau materi">
    <header className="learning-page-head"><p className="dash-kicker">{item.context} • {item.chapter} • {item.type}</p><h2>{item.title}</h2><p>{item.description}</p></header>
    {video ? <section className="video-card">
      {item.file ? <video ref={player} className="admin-learning-media-player" controls preload="metadata" aria-label={item.title} /> : <AdminVideoPreview value={item.url} resolved={item.resolvedUrl} title={item.title} />}
      {item.duration && <p>{item.duration} menit</p>}
    </section> : <><div className="document-toolbar"><div><strong>{item.file?.name ?? item.filename}</strong>{item.file && <small>{item.file.size.toLocaleString("id-ID")} byte</small>}</div></div><div className="document-paper">{item.file ? <iframe ref={documentFrame} className="admin-learning-media-pdf" title={item.title} /> : <p>OPEN: file PDF lokal belum tersedia.</p>}</div></>}
  </section>;
}

export function AdminLearningMediaWorkspace({ kind, initialRows }: { kind: "Video" | "Modul"; initialRows: LearningMedia[] }) {
  const video = kind === "Video";
  void initialRows;
  const resource = video ? "video-lessons" : "modules";
  const [rows, setRows] = useState<LearningMedia[]>([]);
  const [parents, setParents] = useState<Awaited<ReturnType<typeof adminLearningContext>> | null>(null);
  const [busy, setBusy] = useState(false);
  const loadRows = useCallback(async () => {
    const [context, media] = await Promise.all([adminLearningContext(), adminLearningList<AdminMedia>(resource)]);
    setParents(context);
    setRows(media.map(item => {
      const chapter = context.chapters.find(parent => parent.id === item.chapter_id);
      const program = context.programs.find(parent => parent.id === chapter?.program_id);
      return { id: String(item.id), title: item.title, description: item.description ?? "", context: program?.code === "ssw-food" ? "SSW" : program?.code === "interview" ? "Interview" : program?.code.toUpperCase() ?? "", chapter: chapter?.title ?? "", chapterId: item.chapter_id, programId: chapter?.program_id, resolvedUrl: (item as AdminMedia & { video_url_resolved_url?: string }).video_url_resolved_url, type: video ? "Video" : item.module_type === "grammar" ? "Tata Bahasa" : item.module_type === "kanji" ? "Huruf/Kanji" : "Umum", file: null, filename: item.file_url ?? "", url: item.video_url ?? item.file_url ?? "", duration: "", order: String(item.sort_order), status: item.status === "published" ? "Published" : "Draft" };
    }));
  }, [resource, video]);
  const [draft, setDraft] = useState<LearningMedia | null>(null);
  const [view, setView] = useState<LearningMedia | null>(null);
  const [deleting, setDeleting] = useState<LearningMedia | null>(null);
  const [search, setSearch] = useState("");
  const [context, setContext] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => { let active = true; void Promise.resolve().then(() => { if (active) return loadRows(); }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Permintaan belum berhasil."); }); return () => { active = false; }; }, [loadRows]);
  const closeEditor = useCallback(() => { setDraft(null); setError(""); }, []);
  const closeView = useCallback(() => setView(null), []);
  const closeDelete = useCallback(() => setDeleting(null), []);
  const query = search.trim().toLowerCase();
  const visible = rows.filter((row) => (!context || row.context === context) && (!status || row.status === status) && (!type || row.type === type) && [row.title, row.description, row.chapter, row.filename, row.context].some((value) => value.toLowerCase().includes(query))).sort((a, b) => Number(a.order) - Number(b.order));
  function edit(row: LearningMedia) { setError(""); setDraft({ ...row }); }
  async function persist(item: LearningMedia) {
    const chapter = parents?.chapters.find(parent => parent.id === item.chapterId && parent.program_id === item.programId);
    if (!chapter) throw new Error("Pilih chapter yang tersimpan.");
    if (video && rows.some(row => row.chapterId === chapter.id && row.id !== item.id)) throw new Error("Video chapter sudah tersedia. Edit video yang ada.");
    if (item.file) throw new Error("Gunakan URL PDF materi.");
    await adminLearningSave(resource, { chapter_id: chapter.id, title: item.title.trim(), description: item.description.trim(), sort_order: Number(item.order), status: item.status.toLowerCase(), ...(video ? { video_url: item.url } : { file_url: item.url, module_type: item.type === "Tata Bahasa" ? "grammar" : item.type === "Huruf/Kanji" ? "kanji" : "general" }) }, /^\d+$/.test(item.id) ? Number(item.id) : undefined);
    await loadRows();
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    if (!draft.title.trim()) { setError("Judul wajib diisi."); return; }
    if (!draft.chapterId || !draft.programId) { setError("Pilih program dan chapter."); return; }
    if (!/^\d+$/.test(draft.order) || !Number.isSafeInteger(Number(draft.order)) || Number(draft.order) < 1) { setError("Urutan harus berupa bilangan bulat positif."); return; }
    if (draft.duration && (!Number.isFinite(Number(draft.duration)) || Number(draft.duration) <= 0)) { setError("Durasi harus berupa angka positif."); return; }
    if (draft.file && (!draft.file.name.trim() || draft.file.size === 0 || (video ? !draft.file.type.startsWith("video/") : draft.file.type !== "application/pdf"))) { setError(video ? "Pilih file video yang valid dan tidak kosong." : "Pilih file PDF yang valid dan tidak kosong."); return; }
    if (video ? !validVideoReference(draft.url.trim()) : !safeVideoUrl(draft.url.trim())) { setError("Pilih sumber materi yang valid."); return; }
    if (busy) return;
    setBusy(true);
    try { await persist({ ...draft, url: draft.url.trim() }); closeEditor(); setMessage(`${kind} disimpan.`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Permintaan belum berhasil."); }
    finally { setBusy(false); }
  }
  return <AdminShell current={video ? "/admin/video-lesson" : "/admin/modul"}><main className="admin-public-prototype admin-learning-media-prototype">
    <AdminPageHeader title={kind} actions={<button className="button button-primary" type="button" onClick={() => edit({ id: crypto.randomUUID(), title: "", description: "", context: "N4", chapter: "", type: video ? "Video" : "Umum", file: null, filename: "", url: "", duration: "", order: String(rows.length + 1), status: "Draft" })}>Tambah {kind}</button>} />
    <p role="status">{message}</p>{error && !draft && <p role="alert">{error}</p>}
    <AdminSection><AdminFilterToolbar>
      <label className="admin-search-box admin-learning-media-search"><input type="search" aria-label={`Cari ${kind}`} value={search} onChange={(event) => setSearch(event.target.value)} /><span aria-hidden="true"><LuSearch /></span></label>
      <label className="admin-field">Konteks<select value={context} onChange={(event) => setContext(event.target.value)}><option value="">Semua</option>{learningMediaContexts.map((value) => <option key={value}>{value}</option>)}</select></label>
      {!video && <label className="admin-field">Jenis<select value={type} onChange={(event) => setType(event.target.value)}><option value="">Semua</option>{["Tata Bahasa", "Huruf/Kanji", "Umum"].map((value) => <option key={value}>{value}</option>)}</select></label>}
      <label className="admin-field">Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Semua</option><option>Draft</option><option>Published</option></select></label>
    </AdminFilterToolbar><AdminDataTable caption={kind} rows={visible} rowKey={(row) => row.id} columns={[
      { key: "title", header: "Judul", cell: (row) => row.title },
      { key: "context", header: "Konteks", cell: (row) => `${row.context} • ${row.chapter}` },
      { key: "type", header: "Jenis", cell: (row) => row.type },
      { key: "file", header: video ? "Sumber" : "File PDF", cell: (row) => row.file?.name || row.filename || row.url },
      { key: "order", header: "Urutan", cell: (row) => row.order },
      { key: "status", header: "Status", cell: (row) => <AdminStatusBadge status={row.status} /> },
    ]} actions={{ cell: (row) => <div className="admin-page-actions">
      <button type="button" className="button" aria-label={`Lihat ${row.title}`} onClick={() => setView({ ...row })}>Lihat</button>
      <button type="button" className="button" aria-label={`Edit ${row.title}`} onClick={() => edit(row)}>Edit</button>
      <button type="button" className="button" aria-label={`${row.status === "Draft" ? "Publish" : "Draft"} ${row.title}`} disabled={busy} onClick={() => { setBusy(true); void persist({ ...row, status: row.status === "Draft" ? "Published" : "Draft" }).then(() => setMessage("Status disimpan.")).catch(cause => setError(cause instanceof Error ? cause.message : "Permintaan belum berhasil.")).finally(() => setBusy(false)); }}>{row.status === "Draft" ? "Publish" : "Draft"}</button>
      <button type="button" className="button" aria-label={`Hapus ${row.title}`} onClick={() => setDeleting(row)}>Hapus</button>
    </div> }} /></AdminSection>
    <AdminDialog open={Boolean(draft)} title={`${rows.some((row) => row.id === draft?.id) ? "Edit" : "Tambah"} ${kind}`} close={closeEditor}>
      {draft && <form className="admin-prototype-form" onSubmit={save} noValidate>
        <label className="admin-field">Judul<input required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label className="admin-field">Deskripsi<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
        <label className="admin-field">Program<select required value={draft.programId ?? ""} onChange={event => { const program = parents?.programs.find(item => item.id === Number(event.target.value)); setDraft({ ...draft, programId: program?.id, chapterId: undefined, chapter: "", context: program?.code.toUpperCase() ?? "" }); }}><option value="">Pilih program</option>{parents?.programs.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="admin-field">Chapter<select required value={draft.chapterId ?? ""} onChange={event => { const chapter = parents?.chapters.find(item => item.id === Number(event.target.value)); const existing = video && rows.find(item => item.chapterId === chapter?.id); setDraft(existing ? { ...existing } : { ...draft, chapterId: chapter?.id, chapter: chapter?.title ?? "" }); }}><option value="">Pilih chapter</option>{parents?.chapters.filter(item => item.program_id === draft.programId).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        {!video && <label className="admin-field">Jenis<select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as LearningMedia["type"] })}><option>Tata Bahasa</option><option>Huruf/Kanji</option><option>Umum</option></select></label>}
        {video ? <AdminMediaUpload kind="video" onUploaded={(url, resolvedUrl) => setDraft({ ...draft, url, resolvedUrl, file: null })} /> : <label className="admin-field">File PDF<input type="file" accept={video ? "video/*" : "application/pdf"} onChange={(event) => {
          const file = event.target.files?.[0]; event.target.value = "";
          if (!file) return;
          if (!file.name.trim() || !file.size || (video ? !file.type.startsWith("video/") : file.type !== "application/pdf")) { setError(video ? "Pilih file video yang valid dan tidak kosong." : "Pilih file PDF yang valid dan tidak kosong."); return; }
          setError(""); setDraft({ ...draft, file, filename: file.name, url: "" });
        }} /></label>}
        {draft.file && <div className="admin-learning-media-file"><span>{draft.file.name} • {draft.file.size.toLocaleString("id-ID")} byte</span><button type="button" className="button" onClick={() => setDraft({ ...draft, file: null, filename: "" })}>Hapus file</button></div>}
        {!video && <label className="admin-field">URL PDF<input value={draft.url} onChange={event => setDraft({ ...draft, url: event.target.value, file: null })} /></label>}
        {video && <><label className="admin-field">URL video (opsional)<input value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value, resolvedUrl: undefined, file: null, filename: "" })} /></label><label className="admin-field">Durasi (menit, opsional)<input type="number" min="0" step="any" value={draft.duration} onChange={(event) => setDraft({ ...draft, duration: event.target.value })} /></label></>}
        <label className="admin-field">Urutan<input type="number" min="1" step="1" required value={draft.order} onChange={(event) => setDraft({ ...draft, order: event.target.value })} /></label>
        <label className="admin-field">Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as LearningMedia["status"] })}><option>Draft</option><option>Published</option></select></label>
        <AdminLearningMediaPreview item={draft} />
        {error && <p role="alert">{error}</p>}
        <div className="admin-page-actions"><button type="button" className="button" onClick={closeEditor}>Batal</button><button type="submit" disabled={busy} className="button button-primary">Simpan {kind}</button></div>
      </form>}
    </AdminDialog>
    <AdminDialog open={Boolean(view)} title={`Detail ${kind}`} close={closeView}>{view && <AdminLearningMediaPreview item={view} />}</AdminDialog>
    <AdminDialog open={Boolean(deleting)} title={`Hapus ${kind}?`} close={closeDelete} actions={<><button type="button" className="button" onClick={closeDelete}>Batal</button><button type="button" className="button button-primary" disabled={busy} onClick={() => { if (!deleting || busy) return; setBusy(true); void adminLearningDelete(resource, Number(deleting.id)).then(loadRows).then(() => { closeDelete(); setMessage(`${kind} dihapus.`); }).catch(cause => setError(cause instanceof Error ? cause.message : "Permintaan belum berhasil.")).finally(() => setBusy(false)); }}>Hapus {kind}</button></>}><p>Hapus {deleting?.title} ? Materi ini tidak lagi tersedia.</p></AdminDialog>
  </main></AdminShell>;
}
