"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AdminConfirmDialog, AdminDataTable, AdminDialog, AdminFilterToolbar, AdminPageHeader, AdminSection, AdminShell, AdminStatusBadge } from "@/components/admin-primitives";
import { commercialCode, commercialData, commercialId, commercialWrite, type EffectiveAccess, type Offer } from "@/lib/commercial-api";

type Grant = { id: number; program_id: number; plan_code: "lms" | "sensei"; starts_at: string; ends_at: string; status: "active" | "inactive"; source_invoice_id?: number };
type Draft = { id?: number; program_id: string; plan_code: "lms" | "sensei"; starts_at: string; ends_at: string; status: "active" | "inactive" };
export function AdminUsersPrototype() {
  const [users, setUsers] = useState<{ id: number; name: string; email: string; whatsapp: string; account_status: string }[]>([]);
  const [userId, setUserId] = useState("");
  const [loadedId, setLoadedId] = useState("");
  const [grants, setGrants] = useState<Grant[]>([]);
  const [effective, setEffective] = useState<EffectiveAccess | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, setPending] = useState<Grant | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(async () => {
      controller.signal.throwIfAborted();
      const [nextOffers, nextUsers] = await Promise.all([commercialData<Offer[]>("/api/admin/offers", controller.signal), commercialData<typeof users>("/api/admin/users", controller.signal)]);
      if (!controller.signal.aborted) { setOffers(nextOffers); setUsers(nextUsers); }
    }).catch(error => { if (!controller.signal.aborted) setMessage(error.message); });
    return () => controller.abort();
  }, []);
  const closeDraft = useCallback(() => setDraft(null), []);
  const closeConfirm = useCallback(() => setPending(null), []);
  async function load(id: string) {
    const safe = commercialId(id);
    const [sources, projection] = await Promise.all([commercialData<Grant[]>(`/api/admin/users/${safe}/access`), commercialData<EffectiveAccess>(`/api/admin/users/${safe}/effective-access`)]);
    setGrants(sources); setEffective(projection); setLoadedId(safe);
  }
  async function lookup(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setGrants([]); setEffective(null); setLoadedId("");
    try { await load(userId); setMessage(""); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Permintaan belum berhasil."); }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!draft || busy || !loadedId) return;
    if (!draft.program_id || !draft.starts_at || !draft.ends_at || draft.ends_at < draft.starts_at) { setMessage("Tanggal mulai dan tanggal akhir wajib valid."); return; }
    setBusy(true);
    try {
      await commercialWrite(draft.id ? `/api/admin/access/${draft.id}` : `/api/admin/users/${loadedId}/access`, draft.id ? "PATCH" : "POST", { program_id: Number(draft.program_id), plan_code: draft.plan_code, starts_at: draft.starts_at, ends_at: draft.ends_at, status: draft.status });
      await load(loadedId); closeDraft();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Permintaan belum berhasil."); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!pending || busy) return; setBusy(true);
    try { await commercialWrite(`/api/admin/access/${pending.id}`, "DELETE"); await load(loadedId); closeConfirm(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Permintaan belum berhasil."); }
    finally { setBusy(false); }
  }
  const programs = [...new Map(offers.filter(offer => offer.program.code !== "n1").map(offer => [offer.program_id, offer])).values()];
  return <AdminShell current="/admin/pengguna-akses"><main className="admin-public-prototype">
    <AdminPageHeader title="Pengguna & Akses" description="" actions={<button className="button button-primary" disabled>Tambah Pengguna</button>} />
    <p role="status">{message}</p><AdminSection title="Daftar Pengguna dan Status Hak Akses"><AdminFilterToolbar><form onSubmit={lookup} className="admin-prototype-search"><label>ID Pengguna<input aria-label="Cari pengguna" inputMode="numeric" value={userId} onChange={event => setUserId(event.target.value)} required /></label><button className="button" disabled={busy}>Detail</button></form></AdminFilterToolbar><AdminDataTable caption="Pengguna" rows={users} rowKey={row => String(row.id)} columns={[{ key: "name", header: "Nama Siswa", cell: row => row.name }, { key: "email", header: "Email", cell: row => row.email }, { key: "phone", header: "WhatsApp", cell: row => row.whatsapp }, { key: "status", header: "Status", cell: row => row.account_status === "active" ? "Aktif" : "Nonaktif" }]} actions={{ cell: row => <button type="button" className="button" disabled={busy} onClick={() => { setUserId(String(row.id)); void load(String(row.id)).catch(error => setMessage(error.message)); }}>Detail</button> }} /></AdminSection>
    {loadedId && <><AdminSection title="Akses program" actions={<button className="button" disabled={busy || !programs.length} onClick={() => setDraft({ program_id: String(programs[0]?.program_id || ""), plan_code: "lms", starts_at: "", ends_at: "", status: "active" })}>Tambah Akses</button>}>
      <AdminDataTable caption="Riwayat akses program" rows={grants} rowKey={grant => String(grant.id)} columns={[
        { key: "program", header: "Level / Program", cell: grant => commercialCode(offers.find(offer => offer.program_id === grant.program_id)?.program.code || String(grant.program_id)) }, { key: "plan", header: "Membership", cell: grant => grant.plan_code === "lms" ? "Belajar Mandiri" : "Kelas bersama Sensei" }, { key: "start", header: "Tanggal mulai", cell: grant => grant.starts_at.slice(0, 10) }, { key: "end", header: "Aktif Sampai", cell: grant => grant.ends_at.slice(0, 10) }, { key: "status", header: "Status", cell: grant => <AdminStatusBadge status={grant.status === "active" ? "Aktif" : "Nonaktif"} /> }, { key: "invoice", header: "Invoice", cell: grant => grant.source_invoice_id || "Manual" },
      ]} actions={{ cell: grant => <div className="admin-page-actions"><button className="button" disabled={busy} onClick={() => setDraft({ id: grant.id, program_id: String(grant.program_id), plan_code: grant.plan_code, starts_at: grant.starts_at.slice(0, 10), ends_at: grant.ends_at.slice(0, 10), status: grant.status })}>Edit</button><button className="button" disabled={busy} onClick={() => setPending(grant)}>Hapus</button></div> }} />
    </AdminSection><AdminSection title="Akses efektif" description="Read-only. Sumber server; perpanjangan tidak menjanjikan penggabungan periode."><AdminDataTable caption="Akses efektif" rows={Object.entries(effective?.learning || {}).map(([program, material]) => ({ program, material }))} rowKey={row => row.program} columns={[{ key: "program", header: "Level / Program", cell: row => commercialCode(row.program) }, { key: "material", header: "Materi", cell: row => row.material === "full" ? "Akses penuh" : row.material === "preview" ? "Preview Chapter 1" : "Terkunci" }, { key: "replay", header: "Replay", cell: row => effective?.replay_levels.includes(row.program) ? "Akses Replay" : "—" }]} /></AdminSection></>}
    <AdminDialog open={Boolean(draft)} title={draft?.id ? "Edit Akses" : "Tambah Akses"} close={closeDraft}>{draft && <form className="admin-prototype-form" onSubmit={save}><label className="admin-field">Level / Program<select value={draft.program_id} onChange={event => setDraft({ ...draft, program_id: event.target.value, plan_code: "lms" })}>{programs.map(offer => <option key={offer.program_id} value={offer.program_id}>{commercialCode(offer.program.code)}</option>)}</select></label><label className="admin-field">Membership<select value={draft.plan_code} onChange={event => setDraft({ ...draft, plan_code: event.target.value as Draft["plan_code"] })}>{offers.filter(offer => String(offer.program_id) === draft.program_id).map(offer => <option key={offer.plan_code} value={offer.plan_code}>{offer.plan_code === "lms" ? "Belajar Mandiri" : "Kelas bersama Sensei"}</option>)}</select></label><label className="admin-field">Tanggal mulai<input type="date" required value={draft.starts_at} onChange={event => setDraft({ ...draft, starts_at: event.target.value })} /></label><label className="admin-field">Tanggal akhir<input type="date" required min={draft.starts_at} value={draft.ends_at} onChange={event => setDraft({ ...draft, ends_at: event.target.value })} /></label><label className="admin-field">Status<select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value as Draft["status"] })}><option value="active">Aktif</option><option value="inactive">Nonaktif</option></select></label><button className="button button-primary" disabled={busy}>Simpan</button></form>}</AdminDialog>
    <AdminConfirmDialog open={Boolean(pending)} title="Hapus Akses?" close={closeConfirm} actions={<><button className="button" disabled={busy} onClick={closeConfirm}>Batal</button><button className="button button-primary" disabled={busy} onClick={() => void remove()}>Konfirmasi</button></>}><p>Akses sumber dinonaktifkan; riwayat tetap disimpan.</p></AdminConfirmDialog>
  </main></AdminShell>;
}
