"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminConfirmDialog, AdminDataTable, AdminDialog, AdminFilterToolbar, AdminPageHeader, AdminSection, AdminShell } from "@/components/admin-primitives";
import { ApiError } from "@/lib/api";
import { commercialCode, commercialData, commercialWrite, type CommercialInvoice, type Offer } from "@/lib/commercial-api";

const labels: Record<string, string> = { draft: "Draft", awaiting_payment: "Menunggu Pembayaran", paid: "Perlu Konfirmasi", verified: "Perlu Aktivasi", active: "Sudah Bayar", cancelled: "Dibatalkan" };
const next: Record<string, string> = { draft: "awaiting_payment", awaiting_payment: "paid", paid: "paid", verified: "paid" };
function InvoiceStatus({ status }: { status: string }) {
  return <span className={`admin-invoice-status${status === "active" ? " admin-invoice-status-paid" : ""}`}>{labels[status] || status}</span>;
}
const money = (amount: number) => `Rp${amount.toLocaleString("id-ID")}`;
export function AdminInvoicePrototype() {
  const [invoices, setInvoices] = useState<CommercialInvoice[]>([]);
  const [users, setUsers] = useState<{ id: number; name: string; email: string; whatsapp?: string }[]>([]);
  const [creation, setCreation] = useState<{ user_id: string; program_offer_id: string; referral_code: string } | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [archived, setArchived] = useState(false);
  const [destructive, setDestructive] = useState<"delete" | "cancel" | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [selected, setSelected] = useState<CommercialInvoice | null>(null);
  const [pending, setPending] = useState<CommercialInvoice | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    const [rows, prices, students] = await Promise.all([commercialData<CommercialInvoice[]>(`/api/admin/invoices${archived ? "?archived=1" : ""}`), commercialData<Offer[]>("/api/admin/offers"), commercialData<typeof users>("/api/admin/users")]);
    setInvoices(rows); setOffers(prices); setUsers(students);
  }, [archived]);
  useEffect(() => { let active = true; void Promise.resolve().then(() => { if (active) return refresh(); }).catch(error => { if (active) setMessage(error.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [refresh]);
  const closeDetail = useCallback(() => setSelected(null), []);
  const closeConfirm = useCallback(() => setPending(null), []);
  function program(invoice: CommercialInvoice) { return commercialCode(invoice.program_code || offers.find(offer => offer.program_id === invoice.program_id)?.program.code || ""); }
  function studentName(invoice: CommercialInvoice) { return users.find(user => user.id === invoice.user_id)?.name?.trim() || "Nama siswa tidak tersedia"; }
  async function detail(invoice: CommercialInvoice) {
    try { setSelected(await commercialData<CommercialInvoice>(`/api/admin/invoices/${invoice.id}`)); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Permintaan belum berhasil."); }
  }
  const closeDestructive = useCallback(() => { if (!busy) setDestructive(null); }, [busy]);
  const unpaid = selected && ["draft", "awaiting_payment"].includes(selected.status);
  function openDestructive(action: "delete" | "cancel") {
    setDialogError(""); setConfirmed(false); setReason(""); setDestructive(action);
  }
  async function removeOrCancel() {
    if (!selected || !unpaid || archived || busy || !destructive || (destructive === "delete" ? selected.can_delete !== true || !confirmed : selected.can_delete !== false || !reason.trim())) return;
    setBusy(true); setDialogError("");
    try {
      await commercialWrite(`/api/admin/invoices/${selected.id}${destructive === "cancel" ? "/cancel" : ""}`, destructive === "delete" ? "DELETE" : "POST", destructive === "cancel" ? { reason: reason.trim(), confirmation: true } : undefined);
    } catch (error) {
      setDialogError(error instanceof ApiError ? Object.values(error.errors ?? {}).flat().join(" ") || error.message : error instanceof Error ? error.message : "Permintaan belum berhasil.");
      setBusy(false); return;
    }
    setSelected(null); setDestructive(null);
    setMessage(destructive === "delete" ? "Invoice berhasil dihapus permanen." : "Invoice dibatalkan dan disembunyikan. Kredit yang dicadangkan dilepas; riwayat tetap tersimpan.");
    try { await refresh(); }
    catch { setMessage("Perubahan berhasil disimpan, tetapi daftar gagal dimuat. Muat ulang halaman untuk melihat data terbaru."); }
    finally { setBusy(false); }
  }
  async function confirm() {
    if (!pending || busy || !next[pending.status]) return;
    setBusy(true);
    try {
      await commercialWrite(`/api/admin/invoices/${pending.id}/transition`, "POST", { status: next[pending.status] });
      await refresh(); closeConfirm();
      if (selected?.id === pending.id) await detail(pending);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Permintaan belum berhasil."); }
    finally { setBusy(false); }
  }
  return <AdminShell current="/admin/invoice"><main className="admin-public-prototype">
    <AdminPageHeader title="Invoice" description="WhatsApp tidak mengaktifkan akses. Tidak ada payment gateway." actions={<button type="button" className="button button-primary" disabled={busy} onClick={() => setCreation({ user_id: String(users[0]?.id ?? ""), program_offer_id: String(offers[0]?.id ?? ""), referral_code: "" })}>Tambah Invoice</button>} />
    <p role="status">{message}</p><AdminSection title="Daftar Invoice" className="admin-invoice-list"><AdminFilterToolbar><label className="admin-field">Cari invoice<input type="search" placeholder="Cari invoice, nama, atau program" value={search} onChange={event => setSearch(event.target.value)} /></label><label className="admin-field">Status<select value={filter} disabled={archived} onChange={event => setFilter(event.target.value)}><option value="">Semua Status</option>{["awaiting_payment", "active"].map(value => <option key={value} value={value}>{labels[value]}</option>)}</select></label><label className="admin-invoice-check"><input type="checkbox" checked={archived} disabled={busy} onChange={event => { setInvoices([]); setLoading(true); setArchived(event.target.checked); }} /> Tampilkan invoice dibatalkan</label></AdminFilterToolbar>
      <AdminDataTable loading={loading} caption="Invoice" rows={invoices.filter(invoice => `${invoice.id} ${studentName(invoice)} ${program(invoice)}`.toLowerCase().includes(search.toLowerCase()) && (archived || !filter || invoice.status === filter))} rowKey={invoice => String(invoice.id)} columns={[
        { key: "id", header: "Invoice ID", cell: invoice => invoice.id }, { key: "user", header: "Nama Siswa", cell: studentName }, { key: "program", header: "Level / Program", cell: program }, { key: "plan", header: "Membership", cell: invoice => invoice.plan_code === "lms" ? "Belajar Mandiri" : "Kelas bersama Sensei" }, { key: "amount", header: "Total", cell: invoice => money(invoice.total_price) }, { key: "due", header: "Jatuh tempo", cell: invoice => invoice.due_date || "Belum diisi" }, { key: "status", header: "Status", cell: invoice => <InvoiceStatus status={invoice.status} /> },
      ]} actions={{ cell: invoice => <button type="button" className="button" onClick={() => void detail(invoice)}>Detail</button> }} />
    </AdminSection>
    <AdminDialog open={Boolean(creation)} title="Tambah Invoice" close={() => { if (!busy) setCreation(null); }}>{creation && <form className="admin-prototype-form" onSubmit={async event => {
      event.preventDefault(); if (busy) return; setBusy(true); setMessage("");
      try { await commercialWrite("/api/admin/invoices", "POST", { user_id: Number(creation.user_id), program_offer_id: Number(creation.program_offer_id), referral_code: creation.referral_code || null }); setCreation(null); await refresh(); }
      catch (cause) { setMessage(cause instanceof Error ? cause.message : "Permintaan belum berhasil."); }
      finally { setBusy(false); }
    }}><label className="admin-field">Nama Siswa<select required value={creation.user_id} onChange={event => setCreation({ ...creation, user_id: event.target.value })}>{users.map(user => <option value={user.id} key={user.id}>{user.name} — {user.email}</option>)}</select></label><label className="admin-field">Level / Program<select required value={creation.program_offer_id} onChange={event => setCreation({ ...creation, program_offer_id: event.target.value })}>{offers.map(offer => <option value={offer.id} key={offer.id}>{offer.program.name} • {offer.plan_code === "lms" ? "Belajar Mandiri" : "Kelas bersama Sensei"}</option>)}</select></label><label className="admin-field">Kode Referral<input value={creation.referral_code} onChange={event => setCreation({ ...creation, referral_code: event.target.value })} /></label>{message && <p role="alert">{message}</p>}<button type="submit" className="button button-primary" disabled={busy}>Buat Invoice</button></form>}</AdminDialog>
    <AdminDialog open={Boolean(selected) && !destructive} title="Detail Invoice" close={closeDetail} actions={<><button type="button" className="button" onClick={closeDetail}>Tutup</button>{!archived && unpaid && typeof selected.can_delete === "boolean" && <button type="button" className="button" disabled={busy} onClick={() => openDestructive(selected.can_delete ? "delete" : "cancel")}>{selected.can_delete ? "Hapus Invoice" : "Batalkan & Sembunyikan"}</button>}{!archived && selected && next[selected.status] && <button type="button" className="button button-primary" disabled={busy} onClick={() => setPending(selected)}>{selected.status === "draft" ? "Menunggu Pembayaran" : "Konfirmasi Sudah Bayar"}</button>}</>}>{selected && <div className="admin-invoice-detail">
      <div className="admin-invoice-summary"><strong>Invoice: {selected.id}</strong><InvoiceStatus status={selected.status} /></div>
      <AdminSection title="Informasi Pembeli"><dl className="admin-user-detail">{[["Nama Siswa", studentName(selected)], ["Email", users.find(user => user.id === selected.user_id)?.email || "—"], ["Nomor WA", users.find(user => user.id === selected.user_id)?.whatsapp || "—"]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></AdminSection>
      <AdminSection title="Detail Pembelian"><dl className="admin-user-detail">{[["Level / Program", program(selected)], ["Membership", selected.plan_code], ["Harga dasar", money(selected.base_price)], ["Diskon", money(selected.discount_amount)], ["Total", money(selected.total_price)], ["Tanggal", selected.created_at], ["Tanggal mulai", selected.access_grant?.starts_at || "Belum diisi"], ["Tanggal akhir", selected.access_grant?.ends_at || "Belum diisi"], ["Catatan", selected.note || "—"]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></AdminSection>
    </div>}</AdminDialog>
    <AdminConfirmDialog open={Boolean(destructive && selected)} title={destructive === "delete" ? "Hapus Invoice Permanen?" : "Batalkan & Sembunyikan Invoice?"} close={closeDestructive} actions={<><button type="button" className="button" disabled={busy} onClick={closeDestructive}>Kembali</button><button type="button" className="button button-primary" disabled={busy || (destructive === "delete" ? !confirmed : !reason.trim())} onClick={() => void removeOrCancel()}>{destructive === "delete" ? "Hapus Permanen" : "Konfirmasi Pembatalan"}</button></>}>{selected && <div className="admin-invoice-confirm">
      <dl className="admin-user-detail"><div><dt>Invoice ID</dt><dd>{selected.id}</dd></div><div><dt>Nama Siswa</dt><dd>{studentName(selected)}</dd></div><div><dt>Total</dt><dd>{money(selected.total_price)}</dd></div></dl>
      {destructive === "delete" ? <><p>Invoice akan dihapus permanen. Tindakan ini tidak dapat dibatalkan dan data invoice tidak dapat dipulihkan.</p><label className="admin-invoice-check"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} /> Saya memahami dan menyetujui penghapusan permanen invoice ini.</label></> : <><p>Invoice dibatalkan dan disembunyikan dari daftar utama, bukan dihapus. Kredit yang dicadangkan akan dilepas. Riwayat invoice dan audit tetap tersimpan.</p><label className="admin-field">Alasan pembatalan<textarea required value={reason} disabled={busy} onChange={event => setReason(event.target.value)} /></label></>}
      {dialogError && <p role="alert">{dialogError}</p>}
    </div>}</AdminConfirmDialog>
    <AdminConfirmDialog open={Boolean(pending)} title="Ubah Status Invoice?" close={closeConfirm} actions={<><button type="button" className="button" disabled={busy} onClick={closeConfirm}>Batal</button><button type="button" className="button button-primary" disabled={busy} onClick={() => void confirm()}>Konfirmasi</button></>}>{pending && <><p>{pending.id}: {labels[pending.status]} menjadi {pending.status === "draft" ? labels.awaiting_payment : labels.active}.</p>{pending.status !== "draft" && <p>Pastikan pembayaran sudah diterima dan diperiksa secara manual. Konfirmasi ini memverifikasi pembayaran dan langsung mengaktifkan akses siswa. Konfirmasi berulang tidak menggandakan akses.</p>}</>}</AdminConfirmDialog>
  </main></AdminShell>;
}
