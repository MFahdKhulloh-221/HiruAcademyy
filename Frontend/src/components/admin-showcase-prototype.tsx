"use client";

import Image from "next/image";
import { AdminMediaUpload } from "@/components/admin-media-upload";
import { type FormEvent, useState } from "react";
import { AdminDataTable, AdminDialog, AdminFilterToolbar, AdminPageHeader, AdminSection, AdminShell, AdminStatusBadge } from "@/components/admin-primitives";
import { adminMediaUrl as contentMedia } from "@/lib/admin-media";
import { useAdminContent } from "@/lib/admin-content-api";

const approvedShowcase = [{ key: "dashboard", label: "Dashboard" }, { key: "journey", label: "Pembelajaran" }, { key: "lesson", label: "Materi / Video Lesson" }, { key: "flashcard", label: "Flashcard" }, { key: "evaluation", label: "Try Out / Evaluasi" }];
type Showcase = { id: string; key: string; label: string; imageSrc: string; alt: string; order: number; visible: boolean };
export function AdminShowcasePrototype() {
  const { rows, loading, loadError, busy, mutate, reload } = useAdminContent<Showcase>("showcase-items");
  const [draft, setDraft] = useState<Showcase | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Showcase | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    if (!draft.imageSrc.trim() || !draft.alt.trim() || !Number.isInteger(draft.order) || draft.order < 1) { setError("Isi gambar, teks alternatif, dan urutan yang valid."); return; }
    try { await mutate(draft); setDraft(null); setMessage("Showcase disimpan."); } catch (error) { setError(error instanceof Error ? error.message : "Showcase gagal disimpan."); }
  }
  const image = (row: Showcase) => contentMedia(row.imageSrc) ? <Image unoptimized src={contentMedia(row.imageSrc)} alt={row.alt} width={860} height={480} className="lms-preview-img" /> : <span>No Image</span>;
  return <AdminShell current="/admin/showcase"><main className="admin-public-prototype">
    <AdminPageHeader title="Showcase" actions={<button type="button" className="button button-primary" disabled={busy || loading} onClick={() => { const item = approvedShowcase.find(item => !rows.some(row => row.key === item.key)); if (!item) { setMessage("Semua identifier showcase sudah tersedia."); return; } setError(""); setDraft({ ...item, id: crypto.randomUUID(), imageSrc: "", alt: "", order: rows.length + 1, visible: false }); }}>Tambah Showcase</button>} />
    {loading && <p role="status">Memuat showcase…</p>}{loadError && <div role="alert">{loadError} <button type="button" onClick={reload}>Coba lagi</button></div>}<p role="status">{message}</p>
    <AdminSection title="Showcase LMS"><AdminFilterToolbar><button type="button" className="button" onClick={() => setPreview("public")}>Pratinjau urutan tampil</button></AdminFilterToolbar><AdminDataTable caption="Gambar showcase" rows={[...rows].sort((a, b) => a.order - b.order)} rowKey={row => row.id} columns={[
      { key: "id", header: "Identifier (dikunci)", cell: row => row.key }, { key: "label", header: "Copy (dikunci)", cell: row => row.label }, { key: "image", header: "Gambar", cell: row => image(row) }, { key: "alt", header: "Teks alternatif", cell: row => row.alt }, { key: "order", header: "Urutan", cell: row => row.order }, { key: "visible", header: "Status tampil", cell: row => <AdminStatusBadge status={row.visible ? "Aktif" : "Nonaktif"} /> }
    ]} actions={{ cell: row => <div className="admin-page-actions"><button type="button" className="button" onClick={() => setPreview(row.id)}>Pratinjau</button><button type="button" className="button" disabled={busy} onClick={() => { setError(""); setDraft({ ...row }); }}>Edit gambar / tampilan</button><button type="button" className="button" disabled={busy} onClick={() => setDeleting(row)}>Hapus</button></div> }} /></AdminSection>
    <AdminDialog open={Boolean(draft)} title="Edit gambar / tampilan" close={() => { if (!busy) setDraft(null); }}>{draft && <form className="admin-prototype-form" onSubmit={save}><label className="admin-field">Identifier (dikunci)<select disabled={/^\d+$/.test(draft.id)} value={draft.key} onChange={event => { const item = approvedShowcase.find(item => item.key === event.target.value); if (item) setDraft({ ...draft, ...item }); }}>{approvedShowcase.filter(item => item.key === draft.key || !rows.some(row => row.key === item.key)).map(item => <option key={item.key} value={item.key}>{item.key}</option>)}</select></label><label className="admin-field">Copy (dikunci)<input readOnly value={draft.label} /></label><label className="admin-field">Gambar<input required value={draft.imageSrc} onChange={event => setDraft({ ...draft, imageSrc: event.target.value })} /><small>URL HTTP/HTTPS atau referensi penyimpanan.</small></label><AdminMediaUpload kind="image" onUploaded={imageSrc => setDraft({ ...draft, imageSrc })} /><label className="admin-field">Teks alternatif<input required value={draft.alt} onChange={event => setDraft({ ...draft, alt: event.target.value })} /></label><label className="admin-field">Urutan<input type="number" min="1" step="1" required value={draft.order} onChange={event => setDraft({ ...draft, order: Number(event.target.value) })} /></label><label className="admin-field">Status tampil<select value={draft.visible ? "visible" : "hidden"} onChange={event => setDraft({ ...draft, visible: event.target.value === "visible" })}><option value="visible">Tampil</option><option value="hidden">Tidak tampil</option></select></label>{error && <p role="alert">{error}</p>}<div className="admin-page-actions"><button type="button" className="button" disabled={busy} onClick={() => setDraft(null)}>Batal</button><button type="submit" className="button button-primary" disabled={busy}>Simpan showcase</button></div></form>}</AdminDialog>
    <AdminDialog open={Boolean(preview)} title="Pratinjau showcase" close={() => setPreview(null)}>{rows.filter(row => preview === "public" ? row.visible : row.id === preview).map(row => <figure className="lms-preview admin-showcase-preview" key={row.id}><figcaption>{row.label}</figcaption><div className="lms-preview-image-wrap">{image(row)}</div></figure>)}{preview === "public" && !rows.some(row => row.visible) && <p>Belum ada showcase dengan status tampil.</p>}</AdminDialog>
    <AdminDialog open={Boolean(deleting)} title="Hapus Showcase?" close={() => { if (!busy) setDeleting(null); }} actions={<><button type="button" className="button" disabled={busy} onClick={() => setDeleting(null)}>Batal</button><button type="button" className="button button-primary" disabled={busy} onClick={async () => { if (!deleting) return; try { await mutate(deleting, true); setDeleting(null); setMessage("Showcase dihapus."); } catch (error) { setMessage(error instanceof Error ? error.message : "Showcase gagal dihapus."); } }}>Hapus</button></>}><p>Hapus showcase {deleting?.label}?</p></AdminDialog>
  </main></AdminShell>;
}
