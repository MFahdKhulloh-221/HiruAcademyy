"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminConfirmDialog, AdminDataTable, AdminDialog, AdminFilterToolbar, AdminPageHeader, AdminSection, AdminShell, AdminStatusBadge } from "@/components/admin-primitives";
import { commercialCode, commercialData, commercialWrite, commercialWhatsApp, type CommercialInvoice, type Offer } from "@/lib/commercial-api";

const labels: Record<string, string> = { draft: "Draft", awaiting_payment: "Menunggu Pembayaran", paid: "Sudah Bayar", verified: "Diverifikasi", active: "Aktif" };
const next: Record<string, string> = { draft: "awaiting_payment", awaiting_payment: "paid", paid: "verified", verified: "active" };
const money = (amount: number) => `Rp${amount.toLocaleString("id-ID")}`;
export function AdminInvoicePrototype() {
  const [invoices, setInvoices] = useState<CommercialInvoice[]>([]);
  const [users, setUsers] = useState<{ id: number; name: string; email: string }[]>([]);
  const [creation, setCreation] = useState<{ user_id: string; program_offer_id: string; referral_code: string } | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [whatsapp, setWhatsapp] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<CommercialInvoice | null>(null);
  const [pending, setPending] = useState<CommercialInvoice | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const [rows, prices, students] = await Promise.all([commercialData<CommercialInvoice[]>("/api/admin/invoices"), commercialData<Offer[]>("/api/admin/offers"), commercialData<typeof users>("/api/admin/users")]);
    setInvoices(rows); setOffers(prices); setUsers(students);
  }, []);
  useEffect(() => { let active = true; void Promise.resolve().then(() => { if (active) return refresh(); }).catch(error => { if (active) setMessage(error.message); }); return () => { active = false; }; }, [refresh]);
  useEffect(() => { void commercialData<{ contact?: { whatsappNumber?: string } }>("/api/admin/settings").then(settings => setWhatsapp(settings.contact?.whatsappNumber ?? "")).catch(() => setWhatsapp("")); }, []);
  const closeDetail = useCallback(() => setSelected(null), []);
  const closeConfirm = useCallback(() => setPending(null), []);
  function program(invoice: CommercialInvoice) { return commercialCode(invoice.program_code || offers.find(offer => offer.program_id === invoice.program_id)?.program.code || ""); }
  async function detail(invoice: CommercialInvoice) {
    try { setSelected(await commercialData<CommercialInvoice>(`/api/admin/invoices/${invoice.id}`)); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Permintaan belum berhasil."); }
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
    <p role="status">{message}</p><AdminSection title="Daftar Invoice"><AdminFilterToolbar><label className="admin-prototype-search"><input aria-label="Cari invoice" placeholder="Cari invoice, nama, atau program" value={search} onChange={event => setSearch(event.target.value)} /></label><label className="admin-field">Status<select value={filter} onChange={event => setFilter(event.target.value)}><option value="">Semua Status</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></AdminFilterToolbar>
      <AdminDataTable caption="Invoice" rows={invoices.filter(invoice => `${invoice.id} ${invoice.user_id} ${program(invoice)}`.toLowerCase().includes(search.toLowerCase()) && (!filter || invoice.status === filter))} rowKey={invoice => String(invoice.id)} columns={[
        { key: "id", header: "Invoice ID", cell: invoice => invoice.id }, { key: "user", header: "Nama Siswa", cell: invoice => `ID ${invoice.user_id}` }, { key: "program", header: "Level / Program", cell: program }, { key: "plan", header: "Membership", cell: invoice => invoice.plan_code === "lms" ? "Belajar Mandiri" : "Kelas bersama Sensei" }, { key: "amount", header: "Total", cell: invoice => money(invoice.total_price) }, { key: "due", header: "Jatuh tempo", cell: invoice => invoice.due_date || "Belum diisi" }, { key: "status", header: "Status", cell: invoice => <AdminStatusBadge status={labels[invoice.status] || invoice.status} /> },
      ]} actions={{ cell: invoice => <div className="admin-page-actions"><button type="button" className="button" onClick={() => void detail(invoice)}>Detail</button>{next[invoice.status] && <button type="button" className="button" disabled={busy} onClick={() => setPending(invoice)}>{labels[next[invoice.status]]}</button>}</div> }} />
    </AdminSection>
    <AdminDialog open={Boolean(creation)} title="Tambah Invoice" close={() => { if (!busy) setCreation(null); }}>{creation && <form className="admin-prototype-form" onSubmit={async event => {
      event.preventDefault(); if (busy) return; setBusy(true); setMessage("");
      try { await commercialWrite("/api/admin/invoices", "POST", { user_id: Number(creation.user_id), program_offer_id: Number(creation.program_offer_id), referral_code: creation.referral_code || null }); setCreation(null); await refresh(); }
      catch (cause) { setMessage(cause instanceof Error ? cause.message : "Permintaan belum berhasil."); }
      finally { setBusy(false); }
    }}><label className="admin-field">Nama Siswa<select required value={creation.user_id} onChange={event => setCreation({ ...creation, user_id: event.target.value })}>{users.map(user => <option value={user.id} key={user.id}>{user.name} — {user.email}</option>)}</select></label><label className="admin-field">Level / Program<select required value={creation.program_offer_id} onChange={event => setCreation({ ...creation, program_offer_id: event.target.value })}>{offers.map(offer => <option value={offer.id} key={offer.id}>{offer.program.name} • {offer.plan_code === "lms" ? "Belajar Mandiri" : "Kelas bersama Sensei"}</option>)}</select></label><label className="admin-field">Kode Referral<input value={creation.referral_code} onChange={event => setCreation({ ...creation, referral_code: event.target.value })} /></label>{message && <p role="alert">{message}</p>}<button type="submit" className="button button-primary" disabled={busy}>Buat Invoice</button></form>}</AdminDialog>
    <AdminDialog open={Boolean(selected)} title="Detail Invoice" close={closeDetail}>{selected && <><dl className="admin-user-detail">{[["Invoice ID", selected.id], ["Nama Siswa", `ID ${selected.user_id}`], ["Level / Program", program(selected)], ["Membership", selected.plan_code], ["Harga dasar", money(selected.base_price)], ["Diskon", money(selected.discount_amount)], ["Total", money(selected.total_price)], ["Status", labels[selected.status]], ["Tanggal mulai", selected.access_grant?.starts_at || "Belum diisi"], ["Tanggal akhir", selected.access_grant?.ends_at || "Belum diisi"], ["Catatan", selected.note || "—"]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><AdminSection title="Riwayat status"><ol>{[["Draft", selected.created_at], ["Menunggu Pembayaran", selected.submitted_at], ["Sudah Bayar", selected.paid_at], ["Diverifikasi", selected.verified_at], ["Aktif", selected.activated_at]].filter(([, at]) => at).map(([label, at]) => <li key={label}>{label} — <time dateTime={at}>{at}</time></li>)}</ol></AdminSection>{commercialWhatsApp(whatsapp, `Invoice ${selected.id}`) ? <a className="button" href={commercialWhatsApp(whatsapp, `Invoice ${selected.id}`)!} target="_blank" rel="noopener noreferrer">Buka WhatsApp</a> : <button className="button" disabled title="OPEN: kontak produksi belum dikonfigurasi">WhatsApp Admin</button>}</>}</AdminDialog>
    <AdminConfirmDialog open={Boolean(pending)} title="Ubah Status Invoice?" close={closeConfirm} actions={<><button type="button" className="button" disabled={busy} onClick={closeConfirm}>Batal</button><button type="button" className="button button-primary" disabled={busy} onClick={() => void confirm()}>Konfirmasi</button></>}>{pending && <><p>{pending.id}: {labels[pending.status]} menjadi {labels[next[pending.status]]}.</p>{pending.status === "verified" && <p>Aktivasi membuat satu record akses berdasarkan Invoice ID. Konfirmasi berulang tidak menggandakan akses.</p>}</>}</AdminConfirmDialog>
  </main></AdminShell>;
}
