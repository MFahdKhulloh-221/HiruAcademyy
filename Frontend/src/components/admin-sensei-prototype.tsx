"use client";

import Image from "next/image";
import { AdminMediaUpload } from "@/components/admin-media-upload";
import { LuSearch } from "react-icons/lu";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AdminDataTable, AdminDialog, AdminPageHeader, AdminSection, AdminShell, AdminStatusBadge } from "@/components/admin-primitives";
import { adminMediaUrl as contentMedia } from "@/lib/admin-media";
import { useAdminContent } from "@/lib/admin-content-api";
import { AdminSenseiPreview } from "@/components/admin-profile-preview";

const levels = ["N5", "N4", "N3", "N2", "N1"];
type Sensei = { id: string; name: string; role: string; bio: string; photo: string; photo_resolved_url?: string; expertise: string[]; active: boolean; order: number; level: string };
type Draft = Omit<Sensei, "expertise" | "order"> & { expertise: string; order: string };

export function AdminSenseiPrototype() {
  const { rows, loading, loadError, busy, mutate, reload } = useAdminContent<Sensei>("sensei-profiles");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [view, setView] = useState<Sensei | null>(null);
  const [deleting, setDeleting] = useState<Sensei | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const visibleRows = rows.filter((row) => [row.name, row.role, row.bio, row.level, ...row.expertise].some((value) => value.toLowerCase().includes(query)));
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
    if (draft && !rows.some((row) => row.photo === draft.photo)) release(draft.photo);
    setDraft(null); setError("");
  }, [release]);
  const closeView = useCallback(() => setView(null), []);
  const closeDelete = useCallback(() => setDeleting(null), []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const expertise = [...new Set(draft.expertise.split(",").map((label) => label.trim()).filter(Boolean))];
    const order = Number(draft.order);
    const maxOrder = rows.length + (rows.some((row) => row.id === draft.id) ? 0 : 1);
    if (!draft.name.trim()) { setError("Nama Sensei wajib diisi."); return; }
    if (!draft.role.trim()) { setError("Peran Sensei wajib diisi."); return; }
    if (!draft.bio.trim()) { setError("Bio singkat wajib diisi."); return; }
    if (!expertise.length) { setError("Isi minimal satu label keahlian, pisahkan dengan koma."); return; }
    if (draft.photo.startsWith("blob:")) { setError("Pilih foto yang tersimpan."); return; }
    if (draft.level && !levels.includes(draft.level)) { setError("Pilih level utama yang tersedia."); return; }
    if (!/^\d+$/.test(draft.order) || !Number.isSafeInteger(order) || order < 1 || order > maxOrder) { setError(`Urutan harus berupa angka bulat dari 1 hingga ${maxOrder}.`); return; }
    const next: Sensei = { ...draft, name: draft.name.trim(), role: draft.role.trim(), bio: draft.bio.trim(), expertise, order };
    const old = rows.find((row) => row.id === draft.id);
    try { await mutate(next); } catch (error) { setError(error instanceof Error ? error.message : "Sensei gagal disimpan."); return; }
    if (old && old.photo !== next.photo && !rows.some((row) => row.id !== old.id && row.photo === old.photo)) release(old.photo);
    setDraft(null); setError(""); setMessage("Sensei disimpan.");
  }
  async function remove() {
    if (!deleting) return;
    try { await mutate(deleting, true); } catch (error) { setMessage(error instanceof Error ? error.message : "Sensei gagal dihapus."); return; }
    if (!rows.some((row) => row.id !== deleting.id && row.photo === deleting.photo)) release(deleting.photo);
    setDeleting(null); setMessage("Sensei dihapus.");
  }

  return <AdminShell current="/admin/sensei"><main className="admin-public-prototype">
    <AdminPageHeader title="Sensei" description="Profil Sensei." actions={<button type="button" className="button button-primary" onClick={() => { setError(""); setDraft({ id: crypto.randomUUID(), name: "", role: "", bio: "", photo: "", expertise: "", active: false, order: String(rows.length + 1), level: "" }); }}>Tambah Sensei</button>} />
    {loading && <p role="status">Memuat Sensei…</p>}{loadError && <div role="alert">{loadError} <button type="button" onClick={reload}>Coba lagi</button></div>}
    <p role="status">{message}</p>
    <AdminSection title="Profil Sensei"><label className="admin-search-box"><span aria-hidden="true"><LuSearch /></span><input type="search" aria-label="Cari Sensei" value={search} onChange={(event) => setSearch(event.target.value)} /></label><AdminDataTable caption="Daftar Sensei" rows={[...visibleRows].sort((a, b) => a.order - b.order)} rowKey={(row) => row.id} columns={[
      { key: "photo", header: "Foto", cell: (row) => <Image src={contentMedia(row.photo)} alt={`Foto ${row.name}`} width={100} height={100} unoptimized /> },
      { key: "name", header: "Nama", cell: (row) => row.name },
      { key: "role", header: "Peran", cell: (row) => row.role },
      { key: "bio", header: "Bio singkat", cell: (row) => row.bio },
      { key: "expertise", header: "Keahlian", cell: (row) => row.expertise.join(", ") },
      { key: "level", header: "Level utama", cell: (row) => row.level || "—" },
      { key: "order", header: "Urutan", cell: (row) => row.order },
      { key: "status", header: "Status", cell: (row) => <AdminStatusBadge status={row.active ? "Aktif" : "Nonaktif"} /> },
    ]} actions={{ cell: (row) => <div className="admin-page-actions">
      <button type="button" className="button" aria-label={`Lihat ${row.name}`} onClick={() => setView(row)}>Lihat</button>
      <button type="button" className="button" aria-label={`Edit ${row.name}`} onClick={() => { setError(""); setDraft({ ...row, expertise: row.expertise.join(", "), order: String(row.order) }); }}>Edit</button>
      <button type="button" className="button" aria-label={`${row.active ? "Nonaktifkan" : "Aktifkan"} ${row.name}`} disabled={busy} onClick={async () => { try { await mutate({ ...row, active: !row.active }); setMessage("Status Sensei disimpan."); } catch (error) { setMessage(error instanceof Error ? error.message : "Status gagal disimpan."); } }}>{row.active ? "Nonaktifkan" : "Aktifkan"}</button>
      <button type="button" className="button" aria-label={`Hapus ${row.name}`} onClick={() => setDeleting(row)}>Hapus</button>
    </div> }} /></AdminSection>
    <AdminDialog open={Boolean(draft)} title={rows.some((row) => row.id === draft?.id) ? "Edit Sensei" : "Tambah Sensei"} close={closeEditor}>
      {draft && <form className="admin-prototype-form" onSubmit={save} noValidate>
        <label className="admin-field">Nama<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label>
        <label className="admin-field">Peran<input value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })} required /></label>
        <label className="admin-field">Bio singkat<textarea value={draft.bio} onChange={(event) => setDraft({ ...draft, bio: event.target.value })} required /></label>
        <label className="admin-field">Keahlian<input value={draft.expertise} onChange={(event) => setDraft({ ...draft, expertise: event.target.value })} required /><small>Pisahkan beberapa label dengan koma.</small></label>
        <AdminMediaUpload label="Foto" kind="image" onUploaded={(photo, url) => setDraft({ ...draft, photo, photo_resolved_url: url })} />
        <label className="admin-field">Level utama (opsional)<select value={draft.level} onChange={(event) => setDraft({ ...draft, level: event.target.value })}><option value="">Tidak ditentukan</option>{levels.map((level) => <option key={level}>{level}</option>)}</select></label>
        <label className="admin-field">Status<select value={draft.active ? "active" : "inactive"} onChange={(event) => setDraft({ ...draft, active: event.target.value === "active" })}><option value="active">Aktif</option><option value="inactive">Nonaktif</option></select></label>
        <label className="admin-field">Urutan<input type="number" min="1" step="1" value={draft.order} onChange={(event) => setDraft({ ...draft, order: event.target.value })} required /><small>Urutan tampil profil.</small></label>
        <AdminSenseiPreview profile={{ ...draft, expertise: [...new Set(draft.expertise.split(",").map((label) => label.trim()).filter(Boolean))] }} onPhotoError={() => setError("Foto tidak dapat dibaca. Pilih foto lain sebelum menyimpan.")} />
        {error && <p role="alert">{error}</p>}
        <div className="admin-page-actions"><button type="button" className="button" onClick={closeEditor}>Batal</button><button type="submit" disabled={busy} className="button button-primary">Simpan Sensei</button></div>
      </form>}
    </AdminDialog>
    <AdminDialog open={Boolean(view)} title="Detail Sensei" close={closeView}>{view && <AdminSenseiPreview profile={view} />}</AdminDialog>
    <AdminDialog open={Boolean(deleting)} title="Hapus Sensei?" close={closeDelete} actions={<><button type="button" className="button" onClick={closeDelete}>Batal</button><button type="button" className="button button-primary" onClick={remove}>Hapus Sensei</button></>}><p>Hapus profil {deleting?.name}? Profil tidak lagi tampil pada halaman publik.</p></AdminDialog>
  </main></AdminShell>;
}
