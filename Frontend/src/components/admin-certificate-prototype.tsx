"use client";

import { type FormEvent, useCallback, useState } from "react";
import { useSystemAdminRows } from "@/components/system-admin-hooks";
import { adminMediaUrl, rememberAdminMedia } from "@/lib/admin-media";
import { AdminMediaUpload } from "@/components/admin-media-upload";
import { LuSearch } from "react-icons/lu";
import { AdminDataTable, AdminDialog, AdminFilterToolbar, AdminPageHeader, AdminSection, AdminShell, AdminStatusBadge } from "@/components/admin-primitives";

type Certificate = { id: string; program: string; title: string; description: string; image: string | null; status: string; order: number };
type Draft = Omit<Certificate, "order"> & { order: string };
type CertificateResponse = Omit<Certificate, "id" | "order"> & { id: number; sort_order: number };
const decodeCertificate = (row: CertificateResponse): Certificate => { rememberAdminMedia(row); return { ...row, id: String(row.id), order: row.sort_order, status: row.status === "published" ? "Published" : "Draft" }; };
const encodeCertificate = (row: Certificate) => ({ program: row.program, title: row.title, description: row.description, image: row.image || null, sort_order: row.order, status: row.status.toLowerCase() });

function CertificatePreview({ item }: { item: Pick<Certificate, "title" | "program" | "description" | "image"> }) {
  const imageUrl = adminMediaUrl(item.image);
  return <section className="certificate-detail-page" aria-label="Pratinjau template sertifikat">
    <header className="supporting-header"><p className="dash-kicker">DIGITAL CERTIFICATE</p><p>{item.description}</p></header>
    <section className="certificate-preview">
      {imageUrl && <div role="img" aria-label={`Template ${item.title}`} style={{ backgroundImage: `url(${JSON.stringify(imageUrl)})`, width: "100%", height: 260, backgroundSize: "contain", backgroundPosition: "center", backgroundRepeat: "no-repeat" }} />}
      <span aria-hidden="true">証</span><small>DIGITAL</small><p className="dash-kicker">SERTIFIKAT KELULUSAN</p><h2>{item.title}</h2><p>{item.program}</p>
    </section>
  </section>;
}

export function AdminCertificatePrototype() {
  const store = useSystemAdminRows("certificate-templates", decodeCertificate, encodeCertificate);
  const rows = store.rows;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [view, setView] = useState<Certificate | null>(null);
  const [deleting, setDeleting] = useState<Certificate | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [program, setProgram] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const closeEditor = useCallback(() => { setDraft(null); setError(""); }, []);
  const closeView = useCallback(() => setView(null), []);
  const closeDelete = useCallback(() => setDeleting(null), []);
  const query = search.trim().toLowerCase();
  const visible = rows.filter((row) => (!status || row.status === status) && (!program || row.program === program) && [row.title, row.program, row.description].some((text) => text.toLowerCase().includes(query))).sort((a, b) => a.order - b.order);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const order = Number(draft.order);
    const maximum = rows.length + (rows.some((row) => row.id === draft.id) ? 0 : 1);
    if (!draft.program.trim() || !draft.title.trim() || !draft.description.trim()) { setError("Program, judul, dan deskripsi wajib diisi."); return; }
    if (!["Draft", "Published"].includes(draft.status)) { setError("Status tidak valid."); return; }
    if (!/^\d+$/.test(draft.order) || !Number.isSafeInteger(order) || order < 1 || order > maximum) { setError(`Urutan harus berupa angka bulat dari 1 hingga ${maximum}.`); return; }
    const next: Certificate = { ...draft, program: draft.program.trim(), title: draft.title.trim(), description: draft.description.trim(), order };
    if (!await store.save(next)) return;
    setDraft(null); setError(""); setMessage("Template disimpan. Sertifikat siswa tidak berubah.");
  }
  async function remove() {
    if (!deleting || !await store.remove(deleting.id)) return;
    if (view?.id === deleting.id) setView(null);
    setDeleting(null); setMessage("Template dihapus.");
  }
  return <AdminShell current="/admin/sertifikat"><main className="admin-public-prototype">
    <AdminPageHeader title="Sertifikat" actions={<button type="button" className="button button-primary" onClick={() => { setError(""); setDraft({ id: crypto.randomUUID(), program: "", title: "", description: "", image: null, status: "Draft", order: String(rows.length + 1) }); }}>Tambah Sertifikat</button>} />
    <p>Template bukan penerbitan sertifikat siswa. PDF tidak dibuat atau diunggah.</p><p role="status">{store.loading ? "Memuat…" : message}</p>{(store.error || store.mutationError) && <p role="alert">{store.error || store.mutationError}</p>}{store.error && <button className="button" onClick={store.retry}>Coba Lagi</button>}
    <AdminSection title="Template Sertifikat"><AdminFilterToolbar>
      <label className="admin-field">Program<select value={program} onChange={(event) => setProgram(event.target.value)}><option value="">Semua</option>{[...new Set(rows.map((row) => row.program))].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="admin-field">Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Semua</option><option>Draft</option><option>Published</option></select></label>
      <label className="admin-prototype-search"><input type="search" aria-label="Cari sertifikat" value={search} onChange={(event) => setSearch(event.target.value)} /><span aria-hidden="true"><LuSearch /></span></label>
    </AdminFilterToolbar><AdminDataTable caption="Template Sertifikat" rows={visible} rowKey={(row) => row.id} columns={[
      { key: "program", header: "Program", cell: (row) => row.program }, { key: "title", header: "Judul", cell: (row) => row.title }, { key: "description", header: "Deskripsi", cell: (row) => row.description }, { key: "image", header: "Gambar", cell: (row) => row.image || "—" }, { key: "order", header: "Urutan", cell: (row) => row.order }, { key: "status", header: "Status", cell: (row) => <AdminStatusBadge status={row.status} /> },
    ]} actions={{ cell: (row) => <div className="admin-page-actions">
      <button type="button" className="button" aria-label={`Lihat ${row.title}`} onClick={() => setView(row)}>Lihat</button><button type="button" className="button" aria-label={`Edit ${row.title}`} onClick={() => { setError(""); setDraft({ ...row, order: String(row.order) }); }}>Edit</button>
      <button type="button" className="button" aria-label={`${row.status === "Draft" ? "Publikasikan" : "Jadikan Draft"} ${row.title}`} disabled={store.busy} onClick={() => void store.save({ ...row, status: row.status === "Draft" ? "Published" : "Draft" })}>{row.status === "Draft" ? "Publikasikan" : "Jadikan Draft"}</button><button type="button" className="button" aria-label={`Hapus ${row.title}`} onClick={() => setDeleting(row)}>Hapus</button>
    </div> }} /></AdminSection>
    <AdminDialog open={Boolean(draft)} title={rows.some((row) => row.id === draft?.id) ? "Edit Sertifikat" : "Tambah Sertifikat"} close={closeEditor}>{draft && <form className="admin-prototype-form" onSubmit={save} noValidate>
      <label className="admin-field">Program<input value={draft.program} onChange={(event) => setDraft({ ...draft, program: event.target.value })} required /></label><label className="admin-field">Judul<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required /></label><label className="admin-field">Deskripsi<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} required /></label>
      <label className="admin-field">Gambar template (opsional)<input value={draft.image || ""} onChange={event => setDraft({ ...draft, image: event.target.value || null })} /><small>URL gambar atau referensi penyimpanan.</small></label><AdminMediaUpload kind="image" onUploaded={image => setDraft({ ...draft, image })} />{draft.image && <button type="button" className="button" onClick={() => setDraft({ ...draft, image: null })}>Hapus Gambar</button>}
      <label className="admin-field">Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option>Draft</option><option>Published</option></select></label><label className="admin-field">Urutan<input type="number" min="1" step="1" value={draft.order} onChange={(event) => setDraft({ ...draft, order: event.target.value })} required /></label>
      <CertificatePreview item={draft} />{(error || store.mutationError) && <p role="alert">{error || store.mutationError}</p>}<div className="admin-page-actions"><button type="button" className="button" onClick={closeEditor}>Batal</button><button type="submit" disabled={store.busy || store.loading} className="button button-primary">Simpan Sertifikat</button></div>
    </form>}</AdminDialog>
    <AdminDialog open={Boolean(view)} title="Detail Template Sertifikat" close={closeView}>{view && <CertificatePreview item={view} />}</AdminDialog>
    <AdminDialog open={Boolean(deleting)} title="Hapus Sertifikat?" close={closeDelete} actions={<><button type="button" className="button" onClick={closeDelete}>Batal</button><button type="button" className="button button-primary" onClick={remove}>Hapus Sertifikat</button></>}><p>Hapus template {deleting?.title}? Sertifikat siswa tidak berubah.</p></AdminDialog>
  </main></AdminShell>;
}
