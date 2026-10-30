"use client";

import { useState, type FormEvent } from "react";
import { AdminDataTable, AdminDialog, AdminStatusBadge } from "@/components/admin-primitives";
import { useContent } from "@/lib/public-content-api";
import { apiRequest } from "@/lib/api";
import type { Offer } from "@/lib/commercial-api";

type Program = { id: number; name: string; slug: string; description: string | null; family: string; sort_order: number; status: "draft" | "active" | "inactive" };
type Draft = Omit<Program, "id" | "family"> & { id?: number; plan_code?: Offer["plan_code"] | ""; duration_months?: string; base_price?: string };

export function AdminPrograms() {
  const { data: rows, loading, error, reload } = useContent<Program>("/api/admin/programs");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<Program | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function mutate(path: string, method: string, body?: object) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await apiRequest(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      setDraft(null);
      setDeleting(null);
      reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Program gagal disimpan.");
    } finally {
      setBusy(false);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const { name, description, sort_order, status, id } = draft;
    const base = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 210) || "program";
    const slug = `${base}-${crypto.randomUUID()}`;
    void mutate(`/api/admin/programs${id ? `/${id}` : ""}`, id ? "PATCH" : "POST", { name, description, sort_order, ...(id ? { status } : { slug, plan_code: draft.plan_code, duration_months: Number(draft.duration_months), base_price: Number(draft.base_price) }) });
  }

  return <section>
    <div className="admin-journey-actions"><button type="button" className="button button-primary" disabled={busy || loading || Boolean(error)} onClick={() => { setMessage(""); setDraft({ name: "", slug: "", description: "", status: "draft", plan_code: "", duration_months: "", base_price: "", sort_order: Math.min(32767, Math.max(0, ...rows.map(row => row.sort_order)) + 1) }); }}>+ Tambah Program</button></div>
    {error && <p role="alert">{error} <button type="button" onClick={reload}>Coba lagi</button></p>}
    {message && <p role="alert">{message}</p>}
    <AdminDataTable caption="Daftar Program" loading={loading} rows={rows} rowKey={row => String(row.id)} columns={[
      { key: "name", header: "Nama Program", cell: row => row.name },
      { key: "description", header: "Deskripsi Singkat", cell: row => row.description ?? "" },
      { key: "order", header: "Urutan", cell: row => row.sort_order },
      { key: "status", header: "Status", cell: row => <AdminStatusBadge status={row.status === "active" ? "Aktif" : row.status === "inactive" ? "Nonaktif" : "Draft"} /> },
    ]} actions={{ cell: row => <div className="admin-page-actions">
      <button type="button" className="button" disabled={busy} onClick={() => { setMessage(""); setDraft({ ...row }); }}>Edit / Atur Urutan</button>
      <button type="button" className="button" disabled={busy} onClick={() => void mutate(`/api/admin/programs/${row.id}`, "PATCH", { status: row.status === "active" ? "inactive" : "active" })}>{row.status === "active" ? "Nonaktifkan" : "Aktifkan"}</button>
      <button type="button" className="button" disabled={busy} onClick={() => { setMessage(""); setDeleting(row); }}>Hapus</button>
    </div> }} />
    <AdminDialog open={Boolean(draft)} title={draft?.id ? "Edit Program" : "Tambah Program"} close={() => { if (!busy) setDraft(null); }}>
      {draft && <form className="admin-prototype-form" onSubmit={save}>
        <label className="admin-field">Nama program<input required maxLength={255} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
        <label className="admin-field">Deskripsi / informasi program<textarea maxLength={10000} value={draft.description ?? ""} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
        <label className="admin-field">Urutan<input required type="number" min={0} max={32767} step={1} value={draft.sort_order} onChange={event => setDraft({ ...draft, sort_order: Number(event.target.value) })} /></label>
        <label className="admin-field">Status<select disabled={!draft.id} value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value as Program["status"] })}><option value="draft">Draft</option><option value="active">Aktif</option><option value="inactive">Nonaktif</option></select></label>
        {!draft.id && <>
          <label className="admin-field">Paket<select required value={draft.plan_code} onChange={event => setDraft({ ...draft, plan_code: event.target.value as Offer["plan_code"] | "" })}><option value="" disabled>Pilih paket</option><option value="lms">Belajar Mandiri</option><option value="sensei">Kelas bersama Sensei</option></select></label>
          <label className="admin-field">Durasi (bulan)<input required type="number" min={1} max={32767} step={1} value={draft.duration_months} onChange={event => setDraft({ ...draft, duration_months: event.target.value })} /></label>
          <label className="admin-field">Harga dasar (IDR)<input required type="number" min={0} max={2147483647} step={1} value={draft.base_price} onChange={event => setDraft({ ...draft, base_price: event.target.value })} /></label>
        </>}
        <p>Program baru disimpan sebagai Draft dengan penawaran Nonaktif. Aktivasi program tidak mengaktifkan penawaran atau memberikan akses berbayar.</p>
        {message && <p role="alert">{message}</p>}
        <button type="button" className="button" disabled={busy} onClick={() => setDraft(null)}>Batal</button>
        <button type="submit" className="button button-primary" disabled={busy}>Simpan</button>
      </form>}
    </AdminDialog>
    <AdminDialog open={Boolean(deleting)} title="Hapus Program?" close={() => { if (!busy) setDeleting(null); }}>
      <p>Hapus permanen {deleting?.name}? Program dengan relasi atau histori tidak dapat dihapus; gunakan Nonaktifkan.</p>
      {message && <p role="alert">{message}</p>}
      <button type="button" className="button" disabled={busy} onClick={() => setDeleting(null)}>Batal</button>
      <button type="button" className="button" disabled={busy} onClick={() => deleting && void mutate(`/api/admin/programs/${deleting.id}`, "DELETE")}>Hapus Permanen</button>
    </AdminDialog>
  </section>;
}
