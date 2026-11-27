"use client";

import { useRef, useState, type FormEvent } from "react";
import { AdminDataTable, AdminDialog, AdminStatusBadge } from "@/components/admin-primitives";
import { useContent } from "@/lib/public-content-api";
import { apiRequest } from "@/lib/api";
import type { Offer } from "@/lib/commercial-api";
import styles from "./admin-programs.module.css";

type Program = { id: number; name: string; slug: string; description: string | null; family: string; free_preview?: boolean; sort_order: number; show_on_programs: boolean; status: "draft" | "active" | "inactive" };
type Draft = Omit<Program, "id" | "family"> & { id?: number; plan_code?: Offer["plan_code"] | "free" | ""; duration_months?: string; base_price?: string };

export function AdminPrograms() {
  const { data: rows, loading, error, reload } = useContent<Program>("/api/admin/programs");
  const offers = useContent<Offer>("/api/admin/offers");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<Program | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [message, setMessage] = useState("");

  async function mutate(path: string, method: string, body?: object) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      await apiRequest(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      setDraft(null);
      setDeleting(null);
      reload();
      offers.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Program gagal disimpan.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const { name, description, sort_order, status, show_on_programs, id } = draft;
    const base = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 210) || "program";
    const slug = `${base}-${crypto.randomUUID()}`;
    const candidates = offers.data.filter(item => item.program_id === id);
    const offer = candidates.find(item => item.status === "active" && item.plan_code === "sensei") ?? candidates.find(item => item.status === "active") ?? candidates[0];
    const originalPlan = rows.find(item => item.id === id)?.free_preview ? "free" : offer?.plan_code ?? "";
    const commercialChanged = !id || draft.plan_code !== originalPlan || (draft.plan_code !== "free" && (Number(draft.duration_months) !== offer?.duration_months || Number(draft.base_price) !== offer?.base_price));
    void mutate(`/api/admin/programs${id ? `/${id}` : ""}`, id ? "PATCH" : "POST", { name, description, show_on_programs, sort_order: sort_order - 1, ...(id ? { status } : { slug }), ...(commercialChanged ? { plan_code: draft.plan_code, ...(draft.plan_code !== "free" ? { duration_months: Number(draft.duration_months), base_price: Number(draft.base_price) } : {}) } : {}) });
  }

  return <section className={styles.workspace}>
    <div className={styles.toolbar}><h2>Daftar program</h2><button type="button" className="button button-primary" disabled={busy || loading || Boolean(error)} onClick={() => { setMessage(""); setDraft({ name: "", slug: "", description: "", sort_order: rows.length + 1, status: "draft", show_on_programs: true, plan_code: "", duration_months: "", base_price: "" }); }}>+ Tambah Program</button></div>
    {error && <p className={styles.alert} role="alert">{error} <button type="button" onClick={reload}>Coba lagi</button></p>}
    {message && <p className={styles.alert} role="alert">{message}</p>}
    <AdminDataTable caption="Daftar Program" loading={loading} rows={rows} rowKey={row => String(row.id)} columns={[
      { key: "order", header: "Urutan", cell: row => <span className={styles.order}>{rows.findIndex(item => item.id === row.id) + 1}</span> },
      { key: "name", header: "Program", cell: row => <div className={styles.program}><strong>{row.name}</strong><p>{row.description || "Belum ada deskripsi."}</p></div> },
      { key: "status", header: "Status program", cell: row => <AdminStatusBadge status={row.status === "active" ? "Aktif" : row.status === "inactive" ? "Nonaktif" : "Draft"} /> },
      { key: "visibility", header: "Katalog publik", cell: row => <div className={styles.visibility}><label><input type="checkbox" checked={row.show_on_programs === true} disabled={busy || loading || Boolean(error)} aria-label={`Tampilkan ${row.name} di /program`} onChange={event => void mutate(`/api/admin/programs/${row.id}`, "PATCH", { show_on_programs: event.target.checked })} /><span>Tampilkan</span></label><small>{row.show_on_programs === undefined ? "Muat ulang data program" : !row.show_on_programs ? "Tersembunyi dari /program" : row.status === "active" ? "Tampil di halaman Program" : "Tampil setelah diaktifkan"}</small></div> },
    ]} actions={{ cell: row => <div className={styles.actions}>
      <button type="button" className="button" disabled={busy || loading || offers.loading || Boolean(error) || Boolean(offers.error)} aria-label={`Edit program ${row.name}`} onClick={() => { const candidates = offers.data.filter(item => item.program_id === row.id); const offer = candidates.find(item => item.status === "active" && item.plan_code === "sensei") ?? candidates.find(item => item.status === "active") ?? candidates[0]; setMessage(""); setDraft({ ...row, sort_order: rows.findIndex(item => item.id === row.id) + 1, plan_code: row.free_preview ? "free" : offer?.plan_code ?? "", duration_months: offer ? String(offer.duration_months) : "", base_price: offer?.base_price != null ? String(offer.base_price) : "" }); }}>Edit</button>
      <button type="button" className={`button ${styles.delete}`} disabled={busy || loading || Boolean(error)} aria-label={`Hapus program ${row.name}`} onClick={() => { setMessage(""); setDeleting(row); }}>Hapus</button>
    </div> }} />
    <AdminDialog open={Boolean(draft)} title={draft?.id ? "Edit Program" : "Tambah Program"} close={() => { if (!busy) setDraft(null); }}>
      {draft && <form className="admin-prototype-form" onSubmit={save}>
        <label className="admin-field">Nama program<input required maxLength={255} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
        <label className="admin-field">Deskripsi / informasi program<textarea maxLength={10000} value={draft.description ?? ""} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
        <label className="admin-field">Urutan<input required type="number" min={1} max={draft.id ? rows.length : rows.length + 1} step={1} value={draft.sort_order} onChange={event => setDraft({ ...draft, sort_order: Number(event.target.value) })} /></label>
        <label className="admin-field">Status<select disabled={!draft.id} value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value as Program["status"] })}><option value="draft">Draft</option><option value="active">Aktif</option><option value="inactive">Nonaktif</option></select></label>
        <label className="admin-field"><span><input type="checkbox" checked={draft.show_on_programs} onChange={event => setDraft({ ...draft, show_on_programs: event.target.checked })} /> Tampilkan di /program</span></label>
        <p>Program hanya tampil di /program jika berstatus Aktif dan opsi ini dicentang. Menyembunyikan program tidak mengubah status atau akses di /journey.</p>
        <>
          {offers.error && <p role="alert">{offers.error} <button type="button" onClick={offers.reload}>Coba lagi</button></p>}
          <label className="admin-field">Paket<select required value={draft.plan_code} onChange={event => setDraft({ ...draft, plan_code: event.target.value as Draft["plan_code"] })}><option value="" disabled>Pilih paket</option><option value="free">Free — Preview Chapter 1</option><option value="lms">Belajar Mandiri</option><option value="sensei">Kelas bersama Sensei</option></select></label>
          {draft.plan_code !== "free" && <><label className="admin-field">Durasi (bulan)<input required type="number" min={1} max={32767} step={1} value={draft.duration_months} onChange={event => setDraft({ ...draft, duration_months: event.target.value })} /></label>
          <label className="admin-field">Harga dasar (IDR)<input required type="number" min={0} max={2147483647} step={1} value={draft.base_price} onChange={event => setDraft({ ...draft, base_price: event.target.value })} /></label></>}
        </>
        <p>Sensei mencakup Belajar Mandiri. Free hanya membuka preview Chapter 1. Perubahan paket tidak mengubah akses yang sudah dibeli.</p>
        <p>{draft.id ? "Menyimpan paket berbayar menawarkannya untuk pembelian berikutnya dan menonaktifkan penawaran paket lain. Program tetap harus Aktif agar bisa dibeli." : "Program baru disimpan sebagai Draft; penawaran berbayar tetap Nonaktif sampai diaktifkan di Harga & Promo."}</p>
        {message && <p role="alert">{message}</p>}
        <button type="button" className="button" disabled={busy} onClick={() => setDraft(null)}>Batal</button>
        <button type="submit" className="button button-primary" disabled={busy}>Simpan</button>
      </form>}
    </AdminDialog>
    <AdminDialog open={Boolean(deleting)} title="Hapus Program?" className={styles.deleteDialog} close={() => { if (!busy) setDeleting(null); }} closeOnBackdrop={!busy} actions={<>
      <button type="button" className="button" disabled={busy} onClick={() => setDeleting(null)}>Batal</button>
      <button type="button" className={`button ${styles.confirmDelete}`} disabled={busy} onClick={() => deleting && void mutate(`/api/admin/programs/${deleting.id}`, "DELETE")}>{busy ? "Menghapus…" : "Hapus Permanen"}</button>
    </>}>
      <p>Hapus permanen <strong>{deleting?.name}</strong>?</p>
      <p>Program yang sudah digunakan atau memiliki riwayat belajar dan transaksi tidak bisa dihapus. Jika program tidak ingin digunakan lagi, klik Edit lalu pilih status Nonaktif. Data tetap tersimpan.</p>
      {message && <p role="alert">{message}</p>}
    </AdminDialog>
  </section>;
}
