"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { LuSearch } from "react-icons/lu";
import { AdminDataTable, AdminDialog, AdminFilterToolbar, AdminPageHeader, AdminSection, AdminShell, AdminStatusBadge } from "@/components/admin-primitives";

export const learningMediaContexts = ["DASAR", "N5", "N4", "N3", "N2", "N1", "SSW", "Interview"] as const;
export type LearningMedia = {
  id: string;
  title: string;
  description: string;
  context: string;
  chapter: string;
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
      {item.file ? <video ref={player} className="admin-learning-media-player" controls preload="metadata" aria-label={item.title} /> : <div className="video-surface"><strong>{item.title}</strong>{safeVideoUrl(item.url) && <a href={safeVideoUrl(item.url)} target="_blank" rel="noopener noreferrer">{item.url}</a>}</div>}
      {item.duration && <p>{item.duration} menit</p>}
    </section> : <><div className="document-toolbar"><div><strong>{item.file?.name ?? item.filename}</strong>{item.file && <small>{item.file.size.toLocaleString("id-ID")} byte</small>}</div></div><div className="document-paper">{item.file ? <iframe ref={documentFrame} className="admin-learning-media-pdf" title={item.title} /> : <p>OPEN: file PDF lokal belum tersedia.</p>}</div></>}
  </section>;
}

export function AdminLearningMediaWorkspace({ kind, initialRows }: { kind: "Video" | "Modul"; initialRows: LearningMedia[] }) {
  const video = kind === "Video";
  const [rows, setRows] = useState(() => initialRows.map((row) => ({ ...row })));
  const [draft, setDraft] = useState<LearningMedia | null>(null);
  const [view, setView] = useState<LearningMedia | null>(null);
  const [deleting, setDeleting] = useState<LearningMedia | null>(null);
  const [search, setSearch] = useState("");
  const [context, setContext] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const closeEditor = useCallback(() => { setDraft(null); setError(""); }, []);
  const closeView = useCallback(() => setView(null), []);
  const closeDelete = useCallback(() => setDeleting(null), []);
  const query = search.trim().toLowerCase();
  const visible = rows.filter((row) => (!context || row.context === context) && (!status || row.status === status) && (!type || row.type === type) && [row.title, row.description, row.chapter, row.filename, row.context].some((value) => value.toLowerCase().includes(query))).sort((a, b) => Number(a.order) - Number(b.order));
  function edit(row: LearningMedia) { setError(""); setDraft({ ...row }); }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    if (!draft.title.trim()) { setError("Judul wajib diisi."); return; }
    if (!learningMediaContexts.some((value) => value === draft.context) || !draft.chapter.trim()) { setError("Pilih konteks dan isi chapter."); return; }
    if (!/^\d+$/.test(draft.order) || !Number.isSafeInteger(Number(draft.order)) || Number(draft.order) < 1) { setError("Urutan harus berupa bilangan bulat positif."); return; }
    if (draft.duration && (!Number.isFinite(Number(draft.duration)) || Number(draft.duration) <= 0)) { setError("Durasi harus berupa angka positif."); return; }
    if (draft.file && (!draft.file.name.trim() || draft.file.size === 0 || (video ? !draft.file.type.startsWith("video/") : draft.file.type !== "application/pdf"))) { setError(video ? "Pilih file video yang valid dan tidak kosong." : "Pilih file PDF yang valid dan tidak kosong."); return; }
    if (video && draft.url.trim() && !safeVideoUrl(draft.url.trim())) { setError("URL video harus menggunakan HTTP atau HTTPS tanpa kredensial."); return; }
    const original = rows.find((row) => row.id === draft.id);
    if (video ? !draft.file && !draft.url.trim() : !draft.file && !(original && original.filename === draft.filename)) { setError(video ? "Pilih file video atau isi URL video." : "Pilih file PDF."); return; }
    const next = { ...draft, title: draft.title.trim(), description: draft.description.trim(), chapter: draft.chapter.trim(), url: video && !draft.file ? safeVideoUrl(draft.url.trim()) : "", filename: draft.file?.name ?? draft.filename };
    setRows((current) => current.some((row) => row.id === next.id) ? current.map((row) => row.id === next.id ? next : row) : [...current, next]);
    closeEditor(); setMessage(`${kind} disimpan untuk sesi ini. Halaman siswa tidak berubah.`);
  }
  return <AdminShell current={video ? "/admin/video-lesson" : "/admin/modul"}><main className="admin-public-prototype admin-learning-media-prototype">
    <AdminPageHeader title={kind} actions={<button className="button button-primary" type="button" onClick={() => edit({ id: crypto.randomUUID(), title: "", description: "", context: "N4", chapter: "", type: video ? "Video" : "Umum", file: null, filename: "", url: "", duration: "", order: String(rows.length + 1), status: "Draft" })}>Tambah {kind}</button>} />
    <p role="status">{message}</p>
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
      <button type="button" className="button" aria-label={`${row.status === "Draft" ? "Publish" : "Draft"} ${row.title}`} onClick={() => { setRows((current) => current.map((item) => item.id === row.id ? { ...item, status: item.status === "Draft" ? "Published" : "Draft" } : item)); setMessage("Status diubah untuk sesi ini. Halaman siswa tidak berubah."); }}>{row.status === "Draft" ? "Publish" : "Draft"}</button>
      <button type="button" className="button" aria-label={`Hapus ${row.title}`} onClick={() => setDeleting(row)}>Hapus</button>
    </div> }} /></AdminSection>
    <AdminDialog open={Boolean(draft)} title={`${rows.some((row) => row.id === draft?.id) ? "Edit" : "Tambah"} ${kind}`} close={closeEditor}>
      {draft && <form className="admin-prototype-form" onSubmit={save} noValidate>
        <label className="admin-field">Judul<input required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label className="admin-field">Deskripsi<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
        <label className="admin-field">Konteks<select value={draft.context} onChange={(event) => setDraft({ ...draft, context: event.target.value })}>{learningMediaContexts.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="admin-field">Chapter<input required value={draft.chapter} onChange={(event) => setDraft({ ...draft, chapter: event.target.value })} /></label>
        {!video && <label className="admin-field">Jenis<select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as LearningMedia["type"] })}><option>Tata Bahasa</option><option>Huruf/Kanji</option><option>Umum</option></select></label>}
        <label className="admin-field">{video ? "File video" : "File PDF"}<input type="file" accept={video ? "video/*" : "application/pdf"} onChange={(event) => {
          const file = event.target.files?.[0]; event.target.value = "";
          if (!file) return;
          if (!file.name.trim() || !file.size || (video ? !file.type.startsWith("video/") : file.type !== "application/pdf")) { setError(video ? "Pilih file video yang valid dan tidak kosong." : "Pilih file PDF yang valid dan tidak kosong."); return; }
          setError(""); setDraft({ ...draft, file, filename: file.name, url: "" });
        }} /></label>
        {draft.file && <div className="admin-learning-media-file"><span>{draft.file.name} • {draft.file.size.toLocaleString("id-ID")} byte</span><button type="button" className="button" onClick={() => setDraft({ ...draft, file: null, filename: "" })}>Hapus file</button></div>}
        {video && <><label className="admin-field">URL video (opsional)<input type="url" value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value, file: null, filename: "" })} /></label><label className="admin-field">Durasi (menit, opsional)<input type="number" min="0" step="any" value={draft.duration} onChange={(event) => setDraft({ ...draft, duration: event.target.value })} /></label></>}
        <label className="admin-field">Urutan<input type="number" min="1" step="1" required value={draft.order} onChange={(event) => setDraft({ ...draft, order: event.target.value })} /></label>
        <label className="admin-field">Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as LearningMedia["status"] })}><option>Draft</option><option>Published</option></select></label>
        <AdminLearningMediaPreview item={draft} />
        {error && <p role="alert">{error}</p>}
        <div className="admin-page-actions"><button type="button" className="button" onClick={closeEditor}>Batal</button><button type="submit" className="button button-primary">Simpan {kind}</button></div>
      </form>}
    </AdminDialog>
    <AdminDialog open={Boolean(view)} title={`Detail ${kind}`} close={closeView}>{view && <AdminLearningMediaPreview item={view} />}</AdminDialog>
    <AdminDialog open={Boolean(deleting)} title={`Hapus ${kind}?`} close={closeDelete} actions={<><button type="button" className="button" onClick={closeDelete}>Batal</button><button type="button" className="button button-primary" onClick={() => { setRows((current) => current.filter((row) => row.id !== deleting?.id)); closeDelete(); setMessage(`${kind} dihapus dari sesi ini.`); }}>Hapus {kind}</button></>}><p>Hapus {deleting?.title} dari sesi ini? Halaman siswa tidak berubah.</p></AdminDialog>
  </main></AdminShell>;
}
