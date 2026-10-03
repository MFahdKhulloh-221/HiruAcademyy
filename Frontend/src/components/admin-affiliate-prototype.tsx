"use client";

import { useCallback, useState, type FormEvent } from "react";
import { LuSearch } from "react-icons/lu";
import { AdminConfirmDialog, AdminDataTable, AdminDialog, AdminFilterToolbar, AdminMetricCard, AdminPageHeader, AdminSection, AdminShell, AdminStatusBadge, AdminTabs } from "@/components/admin-primitives";
import { adminProfileError, useAdminOperations, type AdminCommissionState, type AdminOperationalAffiliate, type AdminOperationalInvoice } from "@/components/admin-operational-state";

type Affiliate = AdminOperationalAffiliate & { email?: string; whatsapp?: string; rate?: number };
type Commission = AdminCommissionState & { note?: string };
type Draft = { id: string; name: string; code: string; email: string; whatsapp: string; rate: string };
const money = (amount: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
const eligible = (invoice: AdminOperationalInvoice) => ["Diverifikasi", "Aktif"].includes(invoice.status) && Number.isSafeInteger(invoice.amount) && invoice.amount >= 0;
const rateValid = (rate: number | undefined): rate is number => rate !== undefined && Number.isFinite(rate) && rate >= 0 && rate <= 100;
const statusLabel = (state?: AdminCommissionState) => !state || state.status === "Menunggu Validasi" ? "Pending" : state.status === "Tersedia" ? "Approved" : state.status === "Sudah Dicairkan" ? "Paid" : "Dibatalkan";
export function adminCommissionAmount(invoice: AdminOperationalInvoice, rate?: number) { return eligible(invoice) && rateValid(rate) ? Math.round(invoice.amount * rate / 100) : null; }
export function checkAdminAffiliateRules() {
  const invoice = { amount: 10000, status: "Diverifikasi" } as AdminOperationalInvoice;
  if (adminCommissionAmount(invoice, 25) !== 2500 || adminCommissionAmount(invoice, 0) !== 0 || adminCommissionAmount(invoice, 101) !== null || adminCommissionAmount(invoice) !== null || adminCommissionAmount({ ...invoice, status: "Sudah Bayar" }, 25) !== null) throw new Error("Admin affiliate rules check failed");
  return true;
}

export function AdminAffiliatePrototype() {
  const { affiliates: source, invoices, users, commissionStates: states, setAffiliates, setInvoices, setCommissionStates } = useAdminOperations();
  const affiliates: Affiliate[] = source;
  const commissionStates: Commission[] = states;
  const [tab, setTab] = useState("Affiliate");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ kind: "delete" | "pay"; id: string } | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [affiliateId, setAffiliateId] = useState("");
  const [noteDraft, setNoteDraft] = useState<{ invoiceId: string; note: string } | null>(null);
  const selected = affiliates.find((item) => item.id === selectedId);
  const closeDraft = useCallback(() => { setDraft(null); setError(""); }, []);
  const closeDetail = useCallback(() => setSelectedId(null), []);
  const closeConfirm = useCallback(() => setPending(null), []);
  const closeNote = useCallback(() => setNoteDraft(null), []);
  const rows = invoices.filter(eligible).flatMap((invoice) => {
    const affiliate = affiliates.find((item) => item.id === invoice.affiliateId);
    if (!affiliate) return [];
    const state = commissionStates.find((item) => item.invoiceId === invoice.id && item.affiliateId === affiliate.id);
    return [{ invoice, affiliate, state, amount: adminCommissionAmount(invoice, affiliate.rate), status: statusLabel(state) }];
  });
  function edit(affiliate?: Affiliate) {
    const user = users.find((item) => item.id === affiliate?.userId);
    setError("");
    setDraft({ id: affiliate?.id || "", name: affiliate?.name || "", code: affiliate?.code || "", email: affiliate?.email ?? user?.email ?? "", whatsapp: affiliate?.whatsapp ?? user?.whatsapp ?? "", rate: affiliate?.rate === undefined ? "" : String(affiliate.rate) });
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const invalid = adminProfileError(draft);
    const rate = Number(draft.rate);
    const code = draft.code.trim().toUpperCase();
    if (invalid || !/^[A-Z0-9_-]+$/.test(code) || !draft.rate.trim() || !rateValid(rate)) { setError(invalid || "Kode wajib berisi huruf, angka, tanda hubung atau underscore. Komisi wajib 0–100%."); return; }
    if (affiliates.some((item) => item.id !== draft.id && item.code.toUpperCase() === code)) { setError("Kode affiliate sudah digunakan."); return; }
    if (affiliates.some((item) => item.id !== draft.id && (item.email ?? users.find((user) => user.id === item.userId)?.email)?.toLowerCase() === draft.email.trim().toLowerCase())) { setError("Email affiliate sudah digunakan."); return; }
    const existing = affiliates.find((item) => item.id === draft.id);
    if (draft.id && !existing) { setError("Affiliate tidak ditemukan."); return; }
    if (existing?.rate !== undefined && commissionStates.some((item) => item.affiliateId === draft.id && item.status === "Sudah Dicairkan") && existing.rate !== rate) { setError("Rate affiliate dengan komisi Paid tidak dapat diubah."); return; }
    const id = draft.id || crypto.randomUUID();
    const profile = { name: draft.name.trim(), code, email: draft.email.trim(), whatsapp: draft.whatsapp.trim(), rate };
    setAffiliates((current) => {
      if (current.some((item) => item.id !== id && item.code.toUpperCase() === code)) return current;
      return draft.id ? current.map((item) => item.id === id ? { ...item, ...profile } : item) : [...current, { id, ...profile, status: "Aktif", clicks: 0, registrations: 0, purchases: 0, totalCommission: 0, unpaidCommission: 0, paidCommission: 0, createdAt: new Date().toISOString() }];
    });
    setMessage("Affiliate disimpan untuk sesi ini; role pengguna tidak berubah."); closeDraft();
  }
  function transition(id: string, target: "Tersedia" | "Sudah Dicairkan", note?: string) {
    const row = rows.find((item) => item.invoice.id === id);
    if (!row || row.amount === null || row.status === "Paid" || row.status === "Dibatalkan" || (target === "Sudah Dicairkan" && row.status !== "Approved")) { setMessage("Komisi tidak memenuhi syarat perubahan status."); return; }
    const at = new Date().toISOString();
    const record: Commission = { id: row.state?.id || crypto.randomUUID(), affiliateId: row.affiliate.id, affiliateCode: row.affiliate.code, invoiceId: id, amount: row.amount, status: target, eligibleAt: row.invoice.verifiedAt || row.invoice.activatedAt || row.invoice.createdAt, createdAt: row.state?.createdAt || at, note: note ?? row.state?.note ?? "", ...(target === "Sudah Dicairkan" ? { paidAt: at } : {}) };
    setCommissionStates((current) => {
      const previous = current.find((item) => item.invoiceId === id);
      if (previous && (previous.affiliateId !== row.affiliate.id || previous.status === "Sudah Dicairkan" || previous.status === "Dibatalkan" || (target === "Sudah Dicairkan" && previous.status !== "Tersedia"))) return current;
      return previous ? current.map((item) => item.id === previous.id ? { ...item, ...record, id: item.id } : item) : target === "Tersedia" ? [...current, record] : current;
    });
    setMessage(target === "Sudah Dicairkan" ? "Paid dicatat untuk sesi ini. Tidak ada transfer uang." : "Komisi Approved untuk sesi ini.");
  }
  function associate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const invoice = invoices.find((item) => item.id === invoiceId);
    const affiliate = affiliates.find((item) => item.id === affiliateId && item.status === "Aktif");
    if (!invoice || !eligible(invoice) || !affiliate || commissionStates.some((item) => item.invoiceId === invoiceId)) { setMessage("Pilih invoice eligible tanpa catatan komisi dan affiliate aktif."); return; }
    setInvoices((current) => current.map((item) => item.id === invoiceId && eligible(item) && item.affiliateId === invoice.affiliateId ? { ...item, affiliateId } : item));
    setMessage("Relasi invoice dan affiliate diperbarui untuk sesi ini.");
  }
  function confirm() {
    if (!pending) return;
    if (pending.kind === "pay") transition(pending.id, "Sudah Dicairkan");
    else if (invoices.some((item) => item.affiliateId === pending.id) || commissionStates.some((item) => item.affiliateId === pending.id)) setMessage("Affiliate terhubung dengan invoice atau komisi. Nonaktifkan; penghapusan diblokir.");
    else { setAffiliates((current) => current.filter((item) => item.id !== pending.id)); setSelectedId(null); setMessage("Affiliate dihapus dari sesi ini."); }
    closeConfirm();
  }
  const query = search.trim().toLowerCase();
  const visibleAffiliates = affiliates.filter((item) => `${item.name} ${item.code} ${item.email ?? users.find((user) => user.id === item.userId)?.email ?? ""}`.toLowerCase().includes(query));
  const visibleRows = rows.filter((row) => `${row.invoice.id} ${row.affiliate.name} ${row.affiliate.code} ${users.find((user) => user.id === row.invoice.userId)?.name ?? ""} ${row.status}`.toLowerCase().includes(query));
  const totals = (status?: string, id?: string) => rows.filter((row) => row.status !== "Dibatalkan" && (!status || row.status === status) && (!id || row.affiliate.id === id)).reduce((sum, row) => sum + (row.amount ?? 0), 0);
  return <AdminShell current="/admin/affiliate-komisi"><main className="admin-public-prototype">
    <AdminPageHeader title="Affiliate & Komisi" description="Runtime React saja; refresh mengembalikan data contoh. Affiliate bukan role autentikasi. Rate belum diisi: OPEN, tidak dihitung dalam total." actions={<button type="button" className="button button-primary" onClick={() => edit()}>Tambah Affiliate</button>} />
    <p role="status">{message}</p>
    <AdminTabs tabs={["Affiliate", "Komisi"]} active={tab} onChange={setTab} label="Affiliate & Komisi">
      <AdminFilterToolbar><label className="admin-prototype-search"><LuSearch aria-hidden="true" /><input aria-label="Cari affiliate atau komisi" placeholder="Cari nama, kode, email, atau invoice" value={search} onChange={(event) => setSearch(event.target.value)} /></label></AdminFilterToolbar>
      {tab === "Affiliate" ? <AdminSection title="Affiliate"><AdminDataTable caption="Affiliate — data runtime" rows={visibleAffiliates} rowKey={(item) => item.id} columns={[
        { key: "name", header: "Nama", cell: (item) => item.name }, { key: "code", header: "Kode Affiliate", cell: (item) => item.code }, { key: "rate", header: "Komisi (%)", cell: (item) => item.rate ?? "OPEN" }, { key: "status", header: "Status", cell: (item) => <AdminStatusBadge status={item.status} /> }, { key: "total", header: "Total Komisi", cell: (item) => money(totals(undefined, item.id)) },
      ]} actions={{ cell: (item) => <div className="admin-page-actions"><button type="button" className="button" onClick={() => setSelectedId(item.id)} aria-label={`Detail ${item.name}`}>Detail</button><button type="button" className="button" onClick={() => edit(item)} aria-label={`Edit ${item.name}`}>Edit</button><button type="button" className="button" onClick={() => setAffiliates((current) => current.map((record) => record.id === item.id ? { ...record, status: record.status === "Aktif" ? "Nonaktif" : "Aktif" } : record))}>{item.status === "Aktif" ? "Nonaktifkan" : "Aktifkan"}</button><button type="button" className="button" onClick={() => setPending({ kind: "delete", id: item.id })} aria-label={`Hapus ${item.name}`}>Hapus</button></div> }} /></AdminSection> : <>
        <AdminSection title="Komisi" description="Hanya invoice Diverifikasi / Aktif × rate. Invoice belum dibayar tidak menghasilkan komisi. Status tidak memindahkan uang."><div className="admin-page-actions"><AdminMetricCard label="Total Komisi" value={money(totals())} />{["Pending", "Approved", "Paid"].map((status) => <AdminMetricCard key={status} label={status} value={money(totals(status))} />)}</div>
          <AdminDataTable caption="Komisi invoice eligible" rows={visibleRows} rowKey={(row) => row.invoice.id} columns={[
            { key: "invoice", header: "Invoice", cell: (row) => row.invoice.id }, { key: "user", header: "Nama Siswa", cell: (row) => users.find((user) => user.id === row.invoice.userId)?.name || "—" }, { key: "affiliate", header: "Affiliate", cell: (row) => row.affiliate.code }, { key: "amount", header: "Komisi", cell: (row) => row.amount === null ? "OPEN: rate belum diisi" : money(row.amount) }, { key: "status", header: "Status", cell: (row) => <AdminStatusBadge status={row.status} /> }, { key: "note", header: "Catatan", cell: (row) => row.state?.note || "—" },
          ]} actions={{ cell: (row) => <div className="admin-page-actions"><button type="button" className="button" disabled={row.amount === null || row.status === "Paid" || row.status === "Dibatalkan"} onClick={() => setNoteDraft({ invoiceId: row.invoice.id, note: row.state?.note || "" })}>Catatan</button>{row.status === "Pending" && <button type="button" className="button" disabled={row.amount === null} onClick={() => transition(row.invoice.id, "Tersedia")}>Approved</button>}{row.status === "Approved" && <button type="button" className="button" disabled={row.amount === null} onClick={() => setPending({ kind: "pay", id: row.invoice.id })}>Paid</button>}</div> }} />
        </AdminSection>
        <AdminSection title="Relasi Invoice & Affiliate"><form className="admin-prototype-form" onSubmit={associate}><label className="admin-field">Invoice<select required value={invoiceId} onChange={(event) => setInvoiceId(event.target.value)}><option value="">Pilih invoice</option>{invoices.filter((item) => eligible(item) && !commissionStates.some((state) => state.invoiceId === item.id)).map((item) => <option key={item.id} value={item.id}>{item.id} — {item.affiliateId || "Tanpa affiliate"}</option>)}</select></label><label className="admin-field">Affiliate<select required value={affiliateId} onChange={(event) => setAffiliateId(event.target.value)}><option value="">Pilih affiliate</option>{affiliates.filter((item) => item.status === "Aktif").map((item) => <option key={item.id} value={item.id}>{item.code}</option>)}</select></label><button type="submit" className="button">Simpan Relasi</button></form></AdminSection>
      </>}
    </AdminTabs>
    <AdminDialog open={Boolean(selected)} title="Detail Affiliate" close={closeDetail}>{selected && <dl className="admin-user-detail">{[["Nama", selected.name], ["Kode Affiliate", selected.code], ["Email", selected.email ?? users.find((user) => user.id === selected.userId)?.email ?? "OPEN"], ["WhatsApp", selected.whatsapp ?? users.find((user) => user.id === selected.userId)?.whatsapp ?? "OPEN"], ["Komisi (%)", selected.rate ?? "OPEN"], ["Status", selected.status], ["Total Komisi", money(totals(undefined, selected.id))], ["Pending", money(totals("Pending", selected.id))], ["Approved", money(totals("Approved", selected.id))], ["Paid", money(totals("Paid", selected.id))]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}</AdminDialog>
    <AdminDialog open={Boolean(draft)} title={draft?.id ? "Edit Affiliate" : "Tambah Affiliate"} close={closeDraft}>{draft && <form className="admin-prototype-form" onSubmit={save} noValidate>{(["name", "code", "email", "whatsapp", "rate"] as const).map((field) => <label className="admin-field" key={field}>{{ name: "Nama", code: "Kode Affiliate", email: "Email", whatsapp: "WhatsApp", rate: "Komisi (%)" }[field]}<input required type={field === "rate" ? "number" : field === "email" ? "email" : field === "whatsapp" ? "tel" : "text"} min={field === "rate" ? 0 : undefined} max={field === "rate" ? 100 : undefined} step={field === "rate" ? "any" : undefined} value={draft[field]} onChange={(event) => setDraft({ ...draft, [field]: event.target.value })} /></label>)}{error && <p role="alert">{error}</p>}<div className="admin-page-actions"><button type="button" className="button" onClick={closeDraft}>Batal</button><button type="submit" className="button button-primary">Simpan</button></div></form>}</AdminDialog>
    <AdminDialog open={Boolean(noteDraft)} title="Catatan Komisi" close={closeNote}>{noteDraft && <form className="admin-prototype-form" onSubmit={(event) => { event.preventDefault(); const row = rows.find((item) => item.invoice.id === noteDraft.invoiceId); if (!row || row.amount === null || row.status === "Paid" || row.status === "Dibatalkan") return; if (row.status === "Approved") transition(row.invoice.id, "Tersedia", noteDraft.note.trim()); else { const at = new Date().toISOString(); const record: Commission = { id: row.state?.id || crypto.randomUUID(), affiliateId: row.affiliate.id, affiliateCode: row.affiliate.code, invoiceId: row.invoice.id, amount: row.amount, status: "Menunggu Validasi", eligibleAt: row.invoice.verifiedAt || row.invoice.activatedAt || row.invoice.createdAt, createdAt: row.state?.createdAt || at, note: noteDraft.note.trim() }; setCommissionStates((current) => current.some((item) => item.invoiceId === row.invoice.id) ? current.map((item) => item.invoiceId === row.invoice.id && item.status === "Menunggu Validasi" && item.affiliateId === row.affiliate.id ? { ...item, note: record.note } : item) : [...current, record]); } closeNote(); }}><label className="admin-field">Catatan<textarea value={noteDraft.note} onChange={(event) => setNoteDraft({ ...noteDraft, note: event.target.value })} /></label><button type="submit" className="button button-primary">Simpan</button></form>}</AdminDialog>
    <AdminConfirmDialog open={Boolean(pending)} title={pending?.kind === "pay" ? "Konfirmasi Paid?" : "Hapus Affiliate?"} close={closeConfirm} actions={<><button type="button" className="button" onClick={closeConfirm}>Batal</button><button type="button" className="button button-primary" onClick={confirm}>Konfirmasi</button></>}><p>{pending?.kind === "pay" ? "Status Paid hanya catatan runtime. Konfirmasi tidak mengirim uang atau menghubungkan layanan pembayaran." : "Affiliate akan dihapus dari sesi ini. Affiliate dengan relasi invoice atau komisi tidak dapat dihapus."}</p></AdminConfirmDialog>
  </main></AdminShell>;
}
