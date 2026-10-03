"use client";

import { useCallback, useState, type FormEvent } from "react";
import { LuSearch } from "react-icons/lu";
import { AdminConfirmDialog, AdminDataTable, AdminDialog, AdminFilterToolbar, AdminPageHeader, AdminSection, AdminShell, AdminStatusBadge } from "@/components/admin-primitives";
import { adminAccessError, adminDateValid, adminInvoiceStatuses, adminOperationalPrices, adminPrograms, useAdminOperations, type AdminOperationalInvoice, type AdminProgram } from "@/components/admin-operational-state";

const rupiah = (value: number) => `Rp${value.toLocaleString("id-ID")}`;
const statusAction = { Draft: "Menunggu Pembayaran", "Menunggu Pembayaran": "Sudah Bayar", "Sudah Bayar": "Diverifikasi", Diverifikasi: "Aktif", Aktif: "" };
export function AdminInvoicePrototype() {
  const { users, invoices, setInvoices, affiliates, commissionStates, advanceInvoice } = useAdminOperations();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [draft, setDraft] = useState<AdminOperationalInvoice | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = invoices.find((invoice) => invoice.id === selectedId);
  const [pending, setPending] = useState<{ invoice: AdminOperationalInvoice; action: "delete" | "advance" } | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const closeEditor = useCallback(() => { setDraft(null); setError(""); }, []);
  const closeDetail = useCallback(() => setSelectedId(null), []);
  const closeConfirm = useCallback(() => setPending(null), []);
  function edit(invoice?: AdminOperationalInvoice) {
    setError("");
    setDraft(invoice ? { ...invoice } : { id: "", userId: users.find((user) => user.role === "student" && user.status === "Aktif")?.id || "", program: "N5", plan: "lms", amount: 99000, basePrice: 99000, discount: 0, dueDate: "", status: "Draft", start: "", end: "", createdAt: "", note: "", timeline: [] });
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const current = invoices.find((invoice) => invoice.id === draft.id);
    if (current?.status === "Aktif") { setError("Invoice aktif bersifat read-only."); return; }
    const user = users.find((item) => item.id === draft.userId);
    if (!user || user.role !== "student" || user.status !== "Aktif") { setError("Pilih student aktif."); return; }
    const price = adminOperationalPrices[draft.program]?.[draft.plan];
    if (price === null || price === undefined || !Number.isSafeInteger(draft.amount) || draft.amount < 0) { setError("Harga belum tersedia. N1 OPEN; SSW dan Interview hanya Belajar Mandiri."); return; }
    const basePrice = draft.basePrice ?? draft.amount;
    const discount = draft.discount ?? 0;
    if (!Number.isSafeInteger(basePrice) || basePrice < 0 || !Number.isSafeInteger(discount) || discount < 0 || discount > basePrice || draft.amount !== basePrice - discount) { setError("Diskon harus berupa angka bulat rupiah antara 0 dan harga dasar; total harus sama dengan harga dasar dikurangi diskon."); return; }
    if (draft.dueDate && !adminDateValid(draft.dueDate)) { setError("Isi tanggal jatuh tempo yang valid."); return; }
    if (draft.affiliateId && !affiliates.some((affiliate) => affiliate.id === draft.affiliateId)) { setError("Affiliate tidak ditemukan."); return; }
    if ((draft.start && !adminDateValid(draft.start)) || (draft.end && !adminDateValid(draft.end)) || (draft.start && draft.end && draft.end < draft.start)) { setError("Isi tanggal valid; tanggal akhir tidak boleh sebelum tanggal mulai."); return; }
    if (current && current.status !== "Draft" && (draft.userId !== current.userId || draft.program !== current.program || draft.plan !== current.plan || draft.affiliateId !== current.affiliateId || draft.amount !== current.amount || draft.basePrice !== current.basePrice || draft.discount !== current.discount || draft.dueDate !== current.dueDate)) { setError("Data pesanan hanya dapat diubah saat Draft."); return; }
    const at = new Date().toISOString();
    const invoice = { ...draft, id: draft.id || `INV-${crypto.randomUUID()}`, status: current?.status || "Draft", createdAt: current?.createdAt || at, timeline: current?.timeline || [{ status: "Draft", at }] };
    setInvoices((items) => current ? items.map((item) => item.id === invoice.id && item.status === current.status ? invoice : item) : [...items, invoice]);
    setMessage("Invoice disimpan untuk sesi ini."); closeEditor();
  }
  function requestAdvance(invoice: AdminOperationalInvoice) {
    const user = users.find((item) => item.id === invoice.userId);
    if (!user || user.role !== "student" || user.status !== "Aktif") { setMessage("Invoice memerlukan student aktif sebelum status diubah."); return; }
    if (adminOperationalPrices[invoice.program][invoice.plan] === null) { setMessage("Harga program belum tersedia."); return; }
    if (invoice.status === "Diverifikasi") { const invalid = adminAccessError(invoice); if (invalid) { setMessage(`${invalid} Edit tanggal akses sebelum aktivasi.`); return; } }
    setPending({ invoice, action: "advance" });
  }
  function confirm() {
    if (!pending) return;
    const current = invoices.find((invoice) => invoice.id === pending.invoice.id);
    if (!current || current.status !== pending.invoice.status) { setMessage("Invoice sudah berubah. Tinjau kembali sebelum melanjutkan."); closeConfirm(); return; }
    if (pending.action === "delete") {
      if (current.status === "Aktif" || commissionStates.some((commission) => commission.invoiceId === current.id)) { setMessage("Invoice aktif atau terhubung dengan komisi tidak dapat dihapus."); closeConfirm(); return; }
      setInvoices((items) => items.filter((item) => item.id !== current.id)); setSelectedId(null); setMessage("Invoice dihapus dari sesi ini.");
    } else {
      advanceInvoice(current.id, current.status);
      setMessage(current.status === "Diverifikasi" ? "Aktivasi diproses. Tinjau status Aktif dan akses pengguna; satu record akses per invoice." : "Perubahan status diproses. Tinjau status invoice.");
    }
    closeConfirm();
  }
  const visible = invoices.filter((invoice) => `${invoice.id} ${users.find((user) => user.id === invoice.userId)?.name || ""} ${invoice.program}`.toLowerCase().includes(search.trim().toLowerCase()) && (!filter || invoice.status === filter));
  const draftOrderEditable = draft?.status === "Draft";
  return <AdminShell current="/admin/invoice"><main className="admin-public-prototype">
    <AdminPageHeader title="Invoice" description="Data runtime React saja. WhatsApp tidak mengaktifkan akses. Tidak ada payment gateway atau penyimpanan server." actions={<button type="button" className="button button-primary" onClick={() => edit()}>Tambah Invoice</button>} />
    <p role="status">{message}</p><AdminSection title="Daftar Invoice"><AdminFilterToolbar><label className="admin-prototype-search"><LuSearch aria-hidden="true" /><input aria-label="Cari invoice" placeholder="Cari invoice, nama, atau program" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label className="admin-field">Status<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="">Semua Status</option>{adminInvoiceStatuses.map((status) => <option key={status}>{status}</option>)}</select></label></AdminFilterToolbar>
      <AdminDataTable caption="Invoice — data prototype" rows={visible} rowKey={(invoice) => invoice.id} columns={[
        { key: "id", header: "Invoice ID", cell: (invoice) => invoice.id }, { key: "user", header: "Nama Siswa", cell: (invoice) => users.find((user) => user.id === invoice.userId)?.name || "Pengguna tidak ditemukan" }, { key: "program", header: "Level / Program", cell: (invoice) => invoice.program }, { key: "plan", header: "Membership", cell: (invoice) => invoice.plan === "lms" ? "Belajar Mandiri" : "Kelas bersama Sensei" }, { key: "amount", header: "Total", cell: (invoice) => rupiah(invoice.amount) }, { key: "due", header: "Jatuh tempo", cell: (invoice) => invoice.dueDate || "Belum diisi" }, { key: "dates", header: "Tanggal akses", cell: (invoice) => `${invoice.start || "Belum diisi"} — ${invoice.end || "Belum diisi"}` }, { key: "affiliate", header: "Affiliate", cell: (invoice) => affiliates.find((affiliate) => affiliate.id === invoice.affiliateId)?.code || "—" }, { key: "status", header: "Status", cell: (invoice) => <AdminStatusBadge status={invoice.status} /> },
      ]} actions={{ cell: (invoice) => <div className="admin-page-actions"><button type="button" className="button" onClick={() => setSelectedId(invoice.id)} aria-label={`Detail ${invoice.id}`}>Detail</button><button type="button" className="button" disabled={invoice.status === "Aktif"} onClick={() => edit(invoice)} aria-label={`Edit ${invoice.id}`}>Edit</button>{invoice.status !== "Aktif" && <button type="button" className="button" onClick={() => requestAdvance(invoice)} aria-label={`${statusAction[invoice.status]} ${invoice.id}`}>{statusAction[invoice.status]}</button>}<button type="button" className="button" disabled={invoice.status === "Aktif" || commissionStates.some((commission) => commission.invoiceId === invoice.id)} onClick={() => setPending({ invoice, action: "delete" })} aria-label={`Hapus ${invoice.id}`}>Hapus</button></div> }} />
    </AdminSection>
    <AdminDialog open={Boolean(selected)} title="Detail Invoice" close={closeDetail}>{selected && <>
      <dl className="admin-user-detail">{[["Invoice ID", selected.id], ["Nama Siswa", users.find((user) => user.id === selected.userId)?.name || "—"], ["Level / Program", selected.program], ["Membership", selected.plan], ["Harga dasar", rupiah(selected.basePrice ?? selected.amount)], ["Diskon", rupiah(selected.discount ?? 0)], ["Total", rupiah(selected.amount)], ["Jatuh tempo", selected.dueDate || "Belum diisi"], ["Status", selected.status], ["Tanggal mulai", selected.start || "Belum diisi"], ["Tanggal akhir", selected.end || "Belum diisi"], ["Dibuat", selected.createdAt], ["Sudah Bayar", selected.paidAt || "—"], ["Diverifikasi", selected.verifiedAt || "—"], ["Aktivasi", selected.activatedAt || "—"], ["Affiliate ID", selected.affiliateId || "—"], ["Catatan", selected.note || "—"]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <AdminSection title="Riwayat status"><ol>{selected.timeline.map((item, index) => <li key={`${item.at}-${index}`}>{item.status} — <time dateTime={item.at}>{item.at}</time></li>)}</ol></AdminSection>
      <a className="button" href={`https://wa.me/6281234567890?text=${encodeURIComponent(`Halo Admin Hiru Academy, saya ingin konfirmasi pembayaran untuk Invoice ${selected.id}.\nNama: ${users.find((user) => user.id === selected.userId)?.name || ""}\nProgram: ${selected.program}\nPaket: ${selected.plan}\nTotal: ${rupiah(selected.amount)}`)}`} target="_blank" rel="noopener noreferrer">WhatsApp Admin</a><p>Nomor contoh dari fixture. Kontak produksi OPEN. Klik WhatsApp tidak mengubah status invoice.</p>
    </>}</AdminDialog>
    <AdminDialog open={Boolean(draft)} title={draft?.id ? "Edit Invoice" : "Tambah Invoice"} close={closeEditor}>{draft && <form className="admin-prototype-form" onSubmit={save} noValidate>
      <p>Status: {draft.status}. Data pesanan terkunci setelah Draft; tanggal akses dan catatan dapat diisi sebelum Aktif.</p>
      <label className="admin-field">Nama Siswa<select disabled={!draftOrderEditable} value={draft.userId} onChange={(event) => setDraft({ ...draft, userId: event.target.value })}><option value="">Pilih student</option>{users.filter((user) => user.role === "student").map((user) => <option key={user.id} value={user.id}>{user.name} — {user.email} — {user.status}</option>)}</select></label>
      <label className="admin-field">Level / Program<select disabled={!draftOrderEditable} value={draft.program} onChange={(event) => { const program = event.target.value as AdminProgram; const plan = ["SSW", "INTERVIEW"].includes(program) ? "lms" : draft.plan; setDraft({ ...draft, program, plan, basePrice: adminOperationalPrices[program][plan] ?? 0, discount: 0, amount: adminOperationalPrices[program][plan] ?? 0 }); }}>{adminPrograms.map((program) => <option key={program} value={program}>{program}{program === "N1" ? " — OPEN" : ""}</option>)}</select></label>
      <label className="admin-field">Membership<select disabled={!draftOrderEditable} value={draft.plan} onChange={(event) => { const plan = event.target.value as AdminOperationalInvoice["plan"]; setDraft({ ...draft, plan, basePrice: adminOperationalPrices[draft.program][plan] ?? 0, discount: 0, amount: adminOperationalPrices[draft.program][plan] ?? 0 }); }}><option value="lms">Belajar Mandiri</option>{!["SSW", "INTERVIEW"].includes(draft.program) && <option value="sensei">Kelas bersama Sensei</option>}</select></label>
      <p>Harga: {adminOperationalPrices[draft.program][draft.plan] === null ? "OPEN" : rupiah(draft.amount)}. Harga fixture; tidak tersinkron dengan editor Harga & Promo.</p>
      <p>Harga dasar: {adminOperationalPrices[draft.program][draft.plan] === null ? "OPEN" : rupiah(draft.basePrice ?? draft.amount)}</p><label className="admin-field">Diskon (Rp)<input type="number" min="0" max={draft.basePrice ?? draft.amount} step="1" disabled={!draftOrderEditable} value={draft.discount ?? 0} onChange={(event) => { const discount = Number(event.target.value); setDraft({ ...draft, discount, amount: (draft.basePrice ?? draft.amount) - discount }); }} /></label><label className="admin-field">Jatuh tempo<input type="date" disabled={!draftOrderEditable} value={draft.dueDate || ""} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} /></label>
      <label className="admin-field">Affiliate (opsional)<select disabled={!draftOrderEditable} value={draft.affiliateId || ""} onChange={(event) => setDraft({ ...draft, affiliateId: event.target.value || undefined })}><option value="">Tidak ada</option>{affiliates.map((affiliate) => <option key={affiliate.id} value={affiliate.id}>{affiliate.name} — {affiliate.code}</option>)}</select></label>
      <label className="admin-field">Tanggal mulai<input type="date" value={draft.start} onChange={(event) => setDraft({ ...draft, start: event.target.value })} /></label><label className="admin-field">Tanggal akhir<input type="date" min={draft.start || undefined} value={draft.end} onChange={(event) => setDraft({ ...draft, end: event.target.value })} /></label><p>Kedua tanggal wajib valid sebelum aktivasi. Tanggal tidak dihitung otomatis.</p><label className="admin-field">Catatan<textarea value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} /></label>
      {error && <p role="alert">{error}</p>}<div className="admin-page-actions"><button type="button" className="button" onClick={closeEditor}>Batal</button><button type="submit" className="button button-primary">Simpan</button></div>
    </form>}</AdminDialog>
    <AdminConfirmDialog open={Boolean(pending)} title={pending?.action === "delete" ? "Hapus Invoice?" : "Ubah Status Invoice?"} close={closeConfirm} actions={<><button type="button" className="button" onClick={closeConfirm}>Batal</button><button type="button" className="button button-primary" onClick={confirm}>Konfirmasi</button></>}>
      {pending && <><p>{pending.invoice.id} — {users.find((user) => user.id === pending.invoice.userId)?.name} — {pending.invoice.program} — {pending.invoice.plan} — {rupiah(pending.invoice.amount)}</p><p>{pending.action === "delete" ? "Invoice akan dihapus dari sesi ini." : `${pending.invoice.status} menjadi ${statusAction[pending.invoice.status]}.`}</p><p>Tanggal mulai: {pending.invoice.start || "Belum diisi"}</p><p>Tanggal akhir: {pending.invoice.end || "Belum diisi"}</p>{pending.invoice.status === "Diverifikasi" && pending.action === "advance" && <p>Aktivasi membuat satu record akses berdasarkan Invoice ID. Konfirmasi berulang tidak menggandakan akses.</p>}</>}
    </AdminConfirmDialog>
  </main></AdminShell>;
}
