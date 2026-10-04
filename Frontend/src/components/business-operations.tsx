"use client";

import { useEffect, useState } from "react";
import { AdminAffiliatePrototype } from "@/components/admin-affiliate-prototype";
import { AdminInvoicePrototype } from "@/components/admin-invoice-prototype";
import { AdminUsersPrototype } from "@/components/admin-users-prototype";
import { AdminDataTable, AdminDialog, AdminPageHeader, AdminSection, AdminShell } from "@/components/admin-primitives";
import { commercialData, commercialWrite } from "@/lib/commercial-api";

export const InvoiceOperations = AdminInvoicePrototype;
export const UserMembershipOperations = AdminUsersPrototype;
export function AffiliateOperations({ initialTab = "Affiliate" }: { initialTab?: string }) {
  return initialTab === "Pencairan" ? <PayoutOperations /> : <AdminAffiliatePrototype />;
}

function PayoutOperations() {
  const [rows, setRows] = useState<{ id: number; affiliate_id: number; amount: number; paid_at: string }[]>([]);
  const [commissions, setCommissions] = useState<{ id: number; affiliate_id: number; amount: number; status: string }[]>([]);
  const [draft, setDraft] = useState<{ request_key: string; affiliate_id: string; commission_ids: number[]; paid_at: string }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function refresh() {
    const [payouts, available] = await Promise.all([commercialData<typeof rows>("/api/admin/payouts"), commercialData<typeof commissions>("/api/admin/commissions")]);
    setRows(payouts); setCommissions(available);
  }
  useEffect(() => {
    let alive = true;
    void Promise.all([commercialData<{ id: number; affiliate_id: number; amount: number; paid_at: string }[]>("/api/admin/payouts"), commercialData<{ id: number; affiliate_id: number; amount: number; status: string }[]>("/api/admin/commissions")]).then(([payouts, available]) => { if (alive) { setRows(payouts); setCommissions(available); } }).catch(cause => { if (alive) setError(cause.message); });
    return () => { alive = false; };
  }, []);
  const approved = commissions.filter(row => row.status === "approved");
  return <AdminShell current="/admin/pencairan-komisi"><main className="admin-page business-operations-page"><AdminPageHeader title="Pencairan Komisi" actions={<button type="button" className="button button-primary" disabled={busy} onClick={() => setDraft({ request_key: crypto.randomUUID(), affiliate_id: "", commission_ids: [], paid_at: "" })}>Tambah Pencairan</button>} />{error && <p role="alert">{error}<button type="button" className="button" onClick={() => { setError(""); void refresh().catch(cause => setError(cause.message)); }}>Coba Lagi</button></p>}<AdminSection title="Pencairan"><AdminDataTable caption="Pencairan Komisi" rows={rows} rowKey={row => String(row.id)} columns={[{ key: "id", header: "Payout ID", cell: row => row.id }, { key: "affiliate", header: "Affiliate", cell: row => row.affiliate_id }, { key: "amount", header: "Jumlah", cell: row => row.amount.toLocaleString("id-ID") }, { key: "date", header: "Tanggal", cell: row => row.paid_at }, { key: "status", header: "Status", cell: () => "Sudah Dicairkan" }]} /></AdminSection><AdminDialog open={Boolean(draft)} title="Pencairan Komisi" close={() => { if (!busy) setDraft(undefined); }}>{draft && <form className="admin-prototype-form" onSubmit={async event => {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    try { await commercialWrite("/api/admin/payouts", "POST", { ...draft, affiliate_id: Number(draft.affiliate_id) }); setDraft(undefined); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Permintaan belum berhasil."); }
    finally { setBusy(false); }
  }}><label className="admin-field">Affiliate<select required value={draft.affiliate_id} onChange={event => setDraft({ ...draft, affiliate_id: event.target.value, commission_ids: [] })}><option value="">Pilih affiliate</option>{[...new Set(approved.map(row => row.affiliate_id))].map(id => <option value={id} key={id}>{id}</option>)}</select></label><fieldset><legend>Komisi</legend>{approved.filter(row => String(row.affiliate_id) === draft.affiliate_id).map(row => <label className="admin-field" key={row.id}><input type="checkbox" checked={draft.commission_ids.includes(row.id)} onChange={event => setDraft({ ...draft, commission_ids: event.target.checked ? [...draft.commission_ids, row.id] : draft.commission_ids.filter(id => id !== row.id) })} />{row.id} — {row.amount.toLocaleString("id-ID")}</label>)}</fieldset><label className="admin-field">Tanggal<input type="date" required value={draft.paid_at} onChange={event => setDraft({ ...draft, paid_at: event.target.value })} /></label>{error && <p role="alert">{error}</p>}<button type="submit" className="button button-primary" disabled={busy || !draft.commission_ids.length}>Tandai Sudah Dicairkan</button></form>}</AdminDialog></main></AdminShell>;
}
