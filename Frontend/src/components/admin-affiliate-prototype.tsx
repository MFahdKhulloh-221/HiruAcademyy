"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { AdminConfirmDialog, AdminDataTable, AdminDialog, AdminFilterToolbar, AdminMetricCard, AdminPageHeader, AdminSection, AdminShell, AdminStatusBadge, AdminTabs } from "@/components/admin-primitives";
import { commercialData, commercialWrite, type ApiAffiliate, type ApiCommission, type CommercialInvoice } from "@/lib/commercial-api";

type Draft = { id?: number; name: string; code: string; email: string; whatsapp: string; rate: string; status: string };
const money = (amount: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
const labels = { pending: "Pending", approved: "Approved", paid: "Paid", cancelled: "Dibatalkan" };
export function AdminAffiliatePrototype() {
  const [affiliates, setAffiliates] = useState<ApiAffiliate[]>([]);
  const [commissions, setCommissions] = useState<ApiCommission[]>([]);
  const [invoices, setInvoices] = useState<CommercialInvoice[]>([]);
  const [tab, setTab] = useState("Affiliate");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selected, setSelected] = useState<ApiAffiliate | null>(null);
  const [pending, setPending] = useState<{ kind: "delete" | "pay"; id: number } | null>(null);
  const [paidAt, setPaidAt] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [affiliateId, setAffiliateId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const closeDraft = useCallback(() => setDraft(null), []);
  const closeDetail = useCallback(() => setSelected(null), []);
  const closeConfirm = useCallback(() => setPending(null), []);
  const refresh = useCallback(async () => {
    const [accounts, records, orders] = await Promise.all([commercialData<ApiAffiliate[]>("/api/admin/affiliates"), commercialData<ApiCommission[]>("/api/admin/commissions"), commercialData<CommercialInvoice[]>("/api/admin/invoices")]);
    setAffiliates(accounts); setCommissions(records); setInvoices(orders);
  }, []);
  useEffect(() => { let active = true; void Promise.resolve().then(() => { if (active) return refresh(); }).catch(error => { if (active) setMessage(error.message); }); return () => { active = false; }; }, [refresh]);
  async function mutate(action: () => Promise<unknown>, close?: () => void) {
    if (busy) return; setBusy(true);
    try { await action(); await refresh(); close?.(); setMessage(""); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Permintaan belum berhasil."); }
    finally { setBusy(false); }
  }
  function edit(account?: ApiAffiliate) { setDraft({ id: account?.id, name: account?.name || "", code: account?.code || "", email: account?.email || "", whatsapp: account?.whatsapp || "", rate: account?.rate == null ? "" : String(account.rate), status: account?.status || "active" }); }
  function save(event: FormEvent) {
    event.preventDefault(); if (!draft) return;
    if (!draft.name.trim() || !/^[A-Z0-9_-]+$/i.test(draft.code.trim()) || (draft.rate && (!Number.isFinite(Number(draft.rate)) || Number(draft.rate) < 0 || Number(draft.rate) > 100))) { setMessage("Kode dan komisi wajib valid."); return; }
    void mutate(() => commercialWrite(`/api/admin/affiliates${draft.id ? `/${draft.id}` : ""}`, draft.id ? "PATCH" : "POST", { name: draft.name.trim(), code: draft.code.trim().toUpperCase(), email: draft.email || null, whatsapp: draft.whatsapp || null, rate: draft.rate ? Number(draft.rate) : null, status: draft.status }), closeDraft);
  }
  function associate(event: FormEvent) {
    event.preventDefault(); if (!invoiceId || !affiliateId) return;
    void mutate(async () => {
      await commercialWrite(`/api/admin/invoices/${invoiceId}/affiliate-attribution`, "POST", { affiliate_id: Number(affiliateId) });
      await commercialWrite("/api/admin/commissions", "POST", { invoice_id: Number(invoiceId), affiliate_id: Number(affiliateId) });
    });
  }
  function confirm() {
    if (!pending) return;
    if (pending.kind === "pay" && !/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) { setMessage("Isi tanggal pembayaran yang valid."); return; }
    void mutate(() => commercialWrite(pending.kind === "pay" ? `/api/admin/commissions/${pending.id}/status` : `/api/admin/affiliates/${pending.id}`, pending.kind === "pay" ? "PATCH" : "DELETE", pending.kind === "pay" ? { status: "paid", paid_at: paidAt } : undefined), closeConfirm);
  }
  const totals = (status?: string, affiliate?: number) => commissions.filter(record => record.status !== "cancelled" && (!status || record.status === status) && (!affiliate || record.affiliate_id === affiliate)).reduce((sum, record) => sum + Number(record.amount), 0);
  const query = search.toLowerCase();
  return <AdminShell current="/admin/affiliate-komisi"><main className="admin-public-prototype">
    <AdminPageHeader title="Affiliate & Komisi" description="Affiliate bukan role autentikasi. Status tidak memindahkan uang." actions={<button className="button button-primary" disabled={busy} onClick={() => edit()}>Tambah Affiliate</button>} /><p role="status">{message}</p>
    <AdminTabs tabs={["Affiliate", "Komisi"]} active={tab} onChange={setTab} label="Affiliate & Komisi"><AdminFilterToolbar><label className="admin-prototype-search"><input aria-label="Cari affiliate atau komisi" placeholder="Cari nama, kode, email, atau invoice" value={search} onChange={event => setSearch(event.target.value)} /></label></AdminFilterToolbar>
      {tab === "Affiliate" ? <AdminSection title="Affiliate"><AdminDataTable caption="Affiliate" rows={affiliates.filter(account => `${account.name} ${account.code} ${account.email || ""}`.toLowerCase().includes(query))} rowKey={account => String(account.id)} columns={[
        { key: "name", header: "Nama", cell: account => account.name }, { key: "code", header: "Kode Affiliate", cell: account => account.code }, { key: "rate", header: "Komisi (%)", cell: account => account.rate ?? "OPEN" }, { key: "status", header: "Status", cell: account => <AdminStatusBadge status={account.status === "active" ? "Aktif" : "Nonaktif"} /> }, { key: "total", header: "Total Komisi", cell: account => money(totals(undefined, account.id)) },
      ]} actions={{ cell: account => <div className="admin-page-actions"><button className="button" onClick={() => setSelected(account)}>Detail</button><button className="button" disabled={busy} onClick={() => edit(account)}>Edit</button><button className="button" disabled={busy} onClick={() => void mutate(() => commercialWrite(`/api/admin/affiliates/${account.id}`, "PATCH", { status: account.status === "active" ? "inactive" : "active" }))}>{account.status === "active" ? "Nonaktifkan" : "Aktifkan"}</button><button className="button" disabled={busy} onClick={() => setPending({ kind: "delete", id: account.id })}>Hapus</button></div> }} /></AdminSection> : <>
        <AdminSection title="Komisi" description="Nilai komisi berasal dari snapshot server."><div className="admin-page-actions"><AdminMetricCard label="Total Komisi" value={money(totals())} />{["pending", "approved", "paid"].map(status => <AdminMetricCard key={status} label={labels[status as keyof typeof labels]} value={money(totals(status))} />)}</div><AdminDataTable caption="Komisi invoice eligible" rows={commissions.filter(record => `${record.invoice_id} ${affiliates.find(account => account.id === record.affiliate_id)?.code || ""} ${labels[record.status]}`.toLowerCase().includes(query))} rowKey={record => String(record.id)} columns={[
          { key: "invoice", header: "Invoice", cell: record => record.invoice_id }, { key: "affiliate", header: "Affiliate", cell: record => affiliates.find(account => account.id === record.affiliate_id)?.code || `ID ${record.affiliate_id}` }, { key: "amount", header: "Komisi", cell: record => money(Number(record.amount)) }, { key: "status", header: "Status", cell: record => <AdminStatusBadge status={labels[record.status]} /> }, { key: "note", header: "Catatan", cell: record => record.note || "—" },
        ]} actions={{ cell: record => <div className="admin-page-actions">{record.status === "pending" && <button className="button" disabled={busy} onClick={() => void mutate(() => commercialWrite(`/api/admin/commissions/${record.id}/status`, "PATCH", { status: "approved" }))}>Approved</button>}{record.status === "approved" && <Link className="button" href="/admin/pencairan-komisi">Paid</Link>}</div> }} /></AdminSection>
        <AdminSection title="Relasi Invoice & Affiliate"><form className="admin-prototype-form" onSubmit={associate}><label className="admin-field">Invoice<select required value={invoiceId} onChange={event => setInvoiceId(event.target.value)}><option value="">Pilih invoice</option>{invoices.filter(invoice => ["verified", "active"].includes(invoice.status) && !commissions.some(record => record.invoice_id === invoice.id)).map(invoice => <option key={invoice.id} value={invoice.id}>{invoice.id}</option>)}</select></label><label className="admin-field">Affiliate<select required value={affiliateId} onChange={event => setAffiliateId(event.target.value)}><option value="">Pilih affiliate</option>{affiliates.filter(account => account.status === "active").map(account => <option key={account.id} value={account.id}>{account.code}</option>)}</select></label><button className="button" disabled={busy}>Simpan Relasi</button></form></AdminSection>
      </>}
    </AdminTabs>
    <AdminDialog open={Boolean(selected)} title="Detail Affiliate" close={closeDetail}>{selected && <dl className="admin-user-detail">{[["Nama", selected.name], ["Kode Affiliate", selected.code], ["Email", selected.email || "OPEN"], ["WhatsApp", selected.whatsapp || "OPEN"], ["Komisi (%)", selected.rate ?? "OPEN"], ["Total Komisi", money(totals(undefined, selected.id))], ["Pending", money(totals("pending", selected.id))], ["Approved", money(totals("approved", selected.id))], ["Paid", money(totals("paid", selected.id))]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}</AdminDialog>
    <AdminDialog open={Boolean(draft)} title={draft?.id ? "Edit Affiliate" : "Tambah Affiliate"} close={closeDraft}>{draft && <form className="admin-prototype-form" onSubmit={save}>{(["name", "code", "email", "whatsapp", "rate"] as const).map(field => <label className="admin-field" key={field}>{{ name: "Nama", code: "Kode Affiliate", email: "Email", whatsapp: "WhatsApp", rate: "Komisi (%)" }[field]}<input required={field === "name" || field === "code"} type={field === "rate" ? "number" : field === "email" ? "email" : "text"} min={field === "rate" ? 0 : undefined} max={field === "rate" ? 100 : undefined} step="any" value={draft[field]} onChange={event => setDraft({ ...draft, [field]: event.target.value })} /></label>)}<button className="button button-primary" disabled={busy}>Simpan</button></form>}</AdminDialog>
    <AdminConfirmDialog open={Boolean(pending)} title={pending?.kind === "pay" ? "Konfirmasi Paid?" : "Hapus Affiliate?"} close={closeConfirm} actions={<><button className="button" disabled={busy} onClick={closeConfirm}>Batal</button><button className="button button-primary" disabled={busy} onClick={confirm}>Konfirmasi</button></>}><p>{pending?.kind === "pay" ? "Konfirmasi mencatat status Paid. Tidak mengirim uang." : "Affiliate dengan relasi invoice atau komisi tidak dapat dihapus."}</p>{pending?.kind === "pay" && <label className="admin-field">Tanggal pembayaran<input type="date" required value={paidAt} onChange={event => setPaidAt(event.target.value)} /></label>}</AdminConfirmDialog>
  </main></AdminShell>;
}
