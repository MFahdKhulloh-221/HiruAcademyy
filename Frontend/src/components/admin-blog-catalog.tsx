"use client";

import { type FormEvent, useCallback, useState } from "react";
import { AdminDataTable, AdminDialog, AdminSection, AdminStatusBadge } from "@/components/admin-primitives";
import { useAdminContent } from "@/lib/admin-content-api";

export type BlogCatalogEntry = { id: string; name: string; active: boolean };

export function AdminBlogCatalog({ label, catalog, onChanged }: {
  label: "Kategori" | "Kontributor";
  catalog: ReturnType<typeof useAdminContent<BlogCatalogEntry>>;
  onChanged: () => void;
}) {
  const { rows, loading, loadError, reload, busy, mutate } = catalog;
  const [draft, setDraft] = useState<BlogCatalogEntry | null>(null);
  const [deleting, setDeleting] = useState<BlogCatalogEntry | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const closeEditor = useCallback(() => { if (!busy) { setDraft(null); setError(""); } }, [busy]);
  const closeDelete = useCallback(() => { if (!busy) { setDeleting(null); setError(""); } }, [busy]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    if (!draft.name.trim()) { setError(`Nama ${label.toLowerCase()} wajib diisi.`); return; }
    try {
      await mutate({ ...draft, name: draft.name.trim() });
      setDraft(null); setError(""); setMessage(`${label} disimpan.`); onChanged();
    } catch (error) { setError(error instanceof Error ? error.message : `${label} gagal disimpan.`); }
  }

  async function toggle(row: BlogCatalogEntry) {
    try {
      await mutate({ ...row, active: !row.active });
      setMessage(`Status ${label.toLowerCase()} disimpan.`); onChanged();
    } catch (error) { setMessage(error instanceof Error ? error.message : `Status ${label.toLowerCase()} gagal disimpan.`); }
  }

  return <AdminSection title={label === "Kategori" ? "Kategori Blog" : "Penulis / Kontributor"}>
    <button type="button" className="button" disabled={busy || loading || Boolean(loadError)} onClick={() => { setError(""); setDraft({ id: crypto.randomUUID(), name: "", active: true }); }}>Tambah {label}</button>
    {loadError && <p role="alert">{loadError} <button type="button" onClick={reload}>Muat Ulang {label}</button></p>}
    <p role="status">{message}</p>
    <AdminDataTable loading={loading} caption={`Daftar ${label} Blog`} rows={rows} rowKey={row => row.id} columns={[
      { key: "name", header: "Nama", cell: row => row.name },
      { key: "active", header: "Status", cell: row => <AdminStatusBadge status={row.active ? "Aktif" : "Nonaktif"} /> },
    ]} actions={{ cell: row => <div className="admin-page-actions">
      <button type="button" className="button" disabled={busy} aria-label={`Edit ${label.toLowerCase()} ${row.name}`} onClick={() => { setError(""); setDraft({ ...row }); }}>Edit</button>
      <button type="button" className="button" disabled={busy} aria-label={`${row.active ? "Nonaktifkan" : "Aktifkan"} ${label.toLowerCase()} ${row.name}`} onClick={() => toggle(row)}>{row.active ? "Nonaktifkan" : "Aktifkan"}</button>
      <button type="button" className="button" disabled={busy} aria-label={`Hapus ${label.toLowerCase()} ${row.name}`} onClick={() => { setError(""); setDeleting(row); }}>Hapus</button>
    </div> }} />
    <AdminDialog open={Boolean(draft)} title={`${rows.some(row => row.id === draft?.id) ? "Edit" : "Tambah"} ${label}`} close={closeEditor}>
      {draft && <form className="admin-prototype-form" onSubmit={save}>
        <label className="admin-field">Nama {label}<input required maxLength={255} value={draft.name} disabled={busy} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
        <label className="admin-field"><input type="checkbox" checked={draft.active} disabled={busy} onChange={event => setDraft({ ...draft, active: event.target.checked })} />Aktif</label>
        {error && <p role="alert">{error}</p>}
        <div className="admin-page-actions"><button type="button" className="button" disabled={busy} onClick={closeEditor}>Batal</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? "Menyimpan…" : `Simpan ${label}`}</button></div>
      </form>}
    </AdminDialog>
    <AdminDialog open={Boolean(deleting)} title={`Hapus ${label}?`} close={closeDelete} actions={<><button type="button" className="button" disabled={busy} onClick={closeDelete}>Batal</button><button type="button" className="button button-primary" disabled={busy} onClick={async () => {
      if (!deleting) return;
      try { await mutate(deleting, true); setDeleting(null); setError(""); setMessage(`${label} dihapus.`); onChanged(); }
      catch (error) { setError(error instanceof Error ? error.message : `${label} gagal dihapus.`); }
    }}>{busy ? "Menghapus…" : `Hapus ${label}`}</button></>}>
      <p>Hapus {label.toLowerCase()} {deleting?.name}? Data yang masih digunakan artikel tidak dapat dihapus.</p>
      {error && <p role="alert">{error}</p>}
    </AdminDialog>
  </AdminSection>;
}
