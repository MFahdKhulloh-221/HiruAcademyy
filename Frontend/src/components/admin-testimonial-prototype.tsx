"use client";

import Image from "next/image";
import { AdminMediaUpload } from "@/components/admin-media-upload";
import { validVideoReference } from "@/lib/admin-media";
import { LuSearch } from "react-icons/lu";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AdminDataTable, AdminDialog, AdminPageHeader, AdminSection, AdminShell, AdminStatusBadge } from "@/components/admin-primitives";
import { adminMediaUrl as contentMedia } from "@/lib/admin-media";
import { useAdminContent } from "@/lib/admin-content-api";
import { AdminTestimonialPreview } from "@/components/admin-profile-preview";

type Testimonial = { id: string; name: string; context: string; quote: string; image: string; image_resolved_url?: string; videoUrl: string; video_url_resolved_url?: string; videoTitle: string; published: boolean; landing: boolean; order: number };
type Draft = Omit<Testimonial, "order"> & { order: string };
function safeVideoUrl(value: string) { return validVideoReference(value); }

export function AdminTestimonialPrototype() {
  const { rows, loading, loadError, busy, mutate, reload } = useAdminContent<Testimonial>("testimonials");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [view, setView] = useState<Testimonial | null>(null);
  const [deleting, setDeleting] = useState<Testimonial | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const visibleRows = rows.filter((row) => [row.name, row.context, row.quote, row.videoTitle].some((value) => value.toLowerCase().includes(query)));
  const temporaryUrls = useRef(new Set<string>());
  useEffect(() => {
    const urls = temporaryUrls.current;
    return () => { urls.forEach((url) => URL.revokeObjectURL(url)); urls.clear(); };
  }, []);
  const release = useCallback((url: string) => { if (temporaryUrls.current.delete(url)) URL.revokeObjectURL(url); }, []);
  const editorState = useRef({ draft, rows });
  useEffect(() => { editorState.current = { draft, rows }; }, [draft, rows]);
  const closeEditor = useCallback(() => {
    const { draft, rows } = editorState.current;
    if (draft && !rows.some((row) => row.image === draft.image)) release(draft.image);
    setDraft(null); setError("");
  }, [release]);
  const closeView = useCallback(() => setView(null), []);
  const closeDelete = useCallback(() => setDeleting(null), []);

  function changeImage(image: string) {
    if (!draft) return;
    if (!rows.some((row) => row.image === draft.image)) release(draft.image);
    setDraft({ ...draft, image, image_resolved_url: undefined }); setError("");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const videoUrl = draft.videoUrl.trim();
    const videoTitle = draft.videoTitle.trim();
    const order = Number(draft.order);
    const maxOrder = rows.length + (rows.some((row) => row.id === draft.id) ? 0 : 1);
    if (!draft.name.trim()) { setError("Nama pemberi testimoni wajib diisi."); return; }
    if (!draft.context.trim()) { setError("Konteks testimoni wajib diisi."); return; }
    if (!draft.quote.trim()) { setError("Kutipan testimoni wajib diisi."); return; }
    if (videoUrl && !safeVideoUrl(videoUrl)) { setError("URL video harus berupa URL lengkap dengan skema http:// atau https:// tanpa nama pengguna dan kata sandi."); return; }
    if (videoUrl && !videoTitle) { setError("Judul video wajib diisi jika URL video tersedia."); return; }
    if (!videoUrl && videoTitle) { setError("Isi URL video atau kosongkan judul video."); return; }
    if (!/^\d+$/.test(draft.order) || !Number.isSafeInteger(order) || order < 1 || order > maxOrder) { setError(`Urutan harus berupa angka bulat dari 1 hingga ${maxOrder}.`); return; }
    const next: Testimonial = { ...draft, name: draft.name.trim(), context: draft.context.trim(), quote: draft.quote.trim(), videoUrl, videoTitle, order };
    const old = rows.find((row) => row.id === draft.id);
    try { await mutate(next); } catch (error) { setError(error instanceof Error ? error.message : "Testimoni gagal disimpan."); return; }
    if (old && old.image !== next.image && !rows.some((row) => row.id !== old.id && row.image === old.image)) release(old.image);
    setDraft(null); setError(""); setMessage("Testimoni disimpan.");
  }
  async function remove() {
    if (!deleting) return;
    try { await mutate(deleting, true); } catch (error) { setMessage(error instanceof Error ? error.message : "Testimoni gagal dihapus."); return; }
    if (!rows.some((row) => row.id !== deleting.id && row.image === deleting.image)) release(deleting.image);
    setDeleting(null); setMessage("Testimoni dihapus.");
  }

  return <AdminShell current="/admin/testimoni"><main className="admin-public-prototype">
    <AdminPageHeader title="Testimoni" description="Konten testimoni." actions={<button type="button" className="button button-primary" onClick={() => { setError(""); setDraft({ id: crypto.randomUUID(), name: "", context: "", quote: "", image: "", videoUrl: "", videoTitle: "", published: false, landing: false, order: String(rows.length + 1) }); }}>Tambah Testimoni</button>} />
    <p>Draft tidak ditampilkan pada halaman publik.</p>
    {loading && <p role="status">Memuat testimoni…</p>}{loadError && <div role="alert">{loadError} <button type="button" onClick={reload}>Coba lagi</button></div>}
    <p role="status">{message}</p>
    <AdminSection title="Konten Testimoni"><label className="admin-search-box"><span aria-hidden="true"><LuSearch /></span><input type="search" aria-label="Cari testimoni" value={search} onChange={(event) => setSearch(event.target.value)} /></label><AdminDataTable caption="Daftar Testimoni" rows={[...visibleRows].sort((a, b) => a.order - b.order)} rowKey={(row) => row.id} columns={[
      { key: "name", header: "Nama", cell: (row) => row.name },
      { key: "context", header: "Konteks", cell: (row) => row.context },
      { key: "quote", header: "Kutipan", cell: (row) => row.quote },
      { key: "image", header: "Gambar", cell: (row) => row.image ? <Image src={contentMedia(row.image)} alt={`Foto ${row.name}`} width={100} height={100} unoptimized /> : "—" },
      { key: "video", header: "Video", cell: (row) => row.videoUrl && safeVideoUrl(row.videoUrl) ? <a href={row.videoUrl} target="_blank" rel="noopener noreferrer">{row.videoTitle}</a> : "—" },
      { key: "status", header: "Status", cell: (row) => <AdminStatusBadge status={row.published ? "Published" : "Draft"} /> },
      { key: "landing", header: "Landing", cell: (row) => row.landing ? "Ya" : "Tidak" },
      { key: "order", header: "Urutan", cell: (row) => row.order },
    ]} actions={{ cell: (row) => <div className="admin-page-actions">
      <button type="button" className="button" aria-label={`Lihat testimoni ${row.name}`} onClick={() => setView(row)}>Lihat</button>
      <button type="button" className="button" aria-label={`Edit testimoni ${row.name}`} onClick={() => { setError(""); setDraft({ ...row, order: String(row.order) }); }}>Edit</button>
      <button type="button" className="button" aria-label={`${row.published ? "Jadikan Draft" : "Publikasikan"} testimoni ${row.name}`} disabled={busy} onClick={async () => { try { await mutate({ ...row, published: !row.published }); setMessage("Status publikasi disimpan."); } catch (error) { setMessage(error instanceof Error ? error.message : "Status gagal disimpan."); } }}>{row.published ? "Jadikan Draft" : "Publikasikan"}</button>
      <button type="button" className="button" aria-label={`Hapus testimoni ${row.name}`} onClick={() => setDeleting(row)}>Hapus</button>
    </div> }} /></AdminSection>
    <AdminDialog open={Boolean(draft)} title={rows.some((row) => row.id === draft?.id) ? "Edit Testimoni" : "Tambah Testimoni"} close={closeEditor}>
      {draft && <form className="admin-prototype-form" onSubmit={save} noValidate>
        <label className="admin-field">Nama<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label>
        <label className="admin-field">Konteks<input value={draft.context} onChange={(event) => setDraft({ ...draft, context: event.target.value })} required /></label>
        <label className="admin-field">Kutipan<textarea value={draft.quote} onChange={(event) => setDraft({ ...draft, quote: event.target.value })} required /></label>
        <label className="admin-field">Gambar (opsional)<input value={draft.image} onChange={event => changeImage(event.target.value)} /><small>URL HTTP/HTTPS atau referensi penyimpanan.</small></label>
        <AdminMediaUpload kind="image" onUploaded={(image, url) => setDraft({ ...draft, image, image_resolved_url: url })} />
        <AdminMediaUpload kind="video" onUploaded={(videoUrl, url) => setDraft({ ...draft, videoUrl, video_url_resolved_url: url })} />
        <label className="admin-field">URL video (opsional)<input value={draft.videoUrl} onChange={(event) => setDraft({ ...draft, videoUrl: event.target.value, video_url_resolved_url: undefined })} /><small>YouTube, MP4, atau WebM.</small></label>
        <label className="admin-field">Judul video<input value={draft.videoTitle} onChange={(event) => setDraft({ ...draft, videoTitle: event.target.value })} required={Boolean(draft.videoUrl.trim())} /></label>
        <label className="admin-field">Status<select value={draft.published ? "published" : "draft"} onChange={(event) => setDraft({ ...draft, published: event.target.value === "published" })}><option value="draft">Draft</option><option value="published">Published</option></select></label>
        <label className="admin-field">Landing<select value={draft.landing ? "yes" : "no"} onChange={(event) => setDraft({ ...draft, landing: event.target.value === "yes" })}><option value="no">Tidak</option><option value="yes">Ya</option></select><small>Hanya testimoni Published yang tampil di Landing.</small></label>
        <label className="admin-field">Urutan<input type="number" min="1" step="1" value={draft.order} onChange={(event) => setDraft({ ...draft, order: event.target.value })} required /><small>Urutan tampil testimoni.</small></label>
        <AdminTestimonialPreview testimonial={{ ...draft, videoUrl: safeVideoUrl(draft.videoUrl.trim()) ? draft.videoUrl.trim() : "" }} onImageError={() => setError("Gambar tidak dapat dibaca. Pilih gambar lain atau simpan tanpa gambar.")} />
        {error && <p role="alert">{error}</p>}
        <div className="admin-page-actions"><button type="button" className="button" onClick={closeEditor}>Batal</button><button type="submit" disabled={busy} className="button button-primary">Simpan Testimoni</button></div>
      </form>}
    </AdminDialog>
    <AdminDialog open={Boolean(view)} title="Detail Testimoni" close={closeView}>{view && <AdminTestimonialPreview testimonial={{ ...view, videoUrl: safeVideoUrl(view.videoUrl) ? view.videoUrl : "" }} />}</AdminDialog>
    <AdminDialog open={Boolean(deleting)} title="Hapus Testimoni?" close={closeDelete} actions={<><button type="button" className="button" onClick={closeDelete}>Batal</button><button type="button" className="button button-primary" onClick={remove}>Hapus Testimoni</button></>}><p>Hapus testimoni {deleting?.name}? Testimoni tidak lagi tampil pada halaman publik.</p></AdminDialog>
  </main></AdminShell>;
}
