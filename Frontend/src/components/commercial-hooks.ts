"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLearningRequest } from "@/components/learning-hooks";
import { commercialCode, commercialData, commercialId, commercialWrite, createCommercialDraft, InvoiceCreatedError, type CommercialInvoice, type Offer } from "@/lib/commercial-api";

export type StudentAffiliateProjection = { affiliate: { id: number; name: string; code: string; status: string; rate: number | null } | null; code: string | null; totals: { pending: number; approved: number; paid: number } };
export function useCommercialAffiliate() {
  const load = useCallback(() => commercialData<StudentAffiliateProjection>("/api/student/affiliate"), []);
  return useLearningRequest(load, "student-affiliate");
}

export function useCommercialOrder(level: string, plan: "lms" | "sensei") {
  const inFlight = useRef(false);
  const creationBlocked = useRef(new Set<string>());
  const selection = `${commercialCode(level)}:${plan}`;
  const [offers, setOffers] = useState<Offer[]>([]);
  const [created, setCreated] = useState<{ selection: string; invoice: CommercialInvoice } | null>(null);
  const invoice = created?.selection === selection ? created.invoice : null;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reloadVersion, setReloadVersion] = useState(0);
  useEffect(() => { let active = true; void Promise.resolve().then(() => { if (!active) return; setLoading(true); setError(""); return commercialData<Offer[]>("/api/public/offers").then(rows => { if (active) setOffers(rows); }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setLoading(false); }); }); return () => { active = false; }; }, [reloadVersion]);
  const offer = offers.find(row => commercialCode(row.program.code) === commercialCode(level) && row.plan_code === plan && row.base_price !== null);
  async function create(referral?: string) {
    if (invoice) return invoice;
    if (inFlight.current || creationBlocked.current.has(selection)) return null;
    if (!offer) { setError("Program atau paket belum tersedia. Pilih program lain."); return null; }
    inFlight.current = true; setBusy(true); setError("");
    try { const row = await createCommercialDraft({ level, plan, referral }); setCreated({ selection, invoice: row }); return row; }
    catch (error) { if (error instanceof InvoiceCreatedError) creationBlocked.current.add(selection); setError(error instanceof Error ? error.message : "Permintaan belum berhasil."); return null; }
    finally { inFlight.current = false; setBusy(false); }
  }
  return { offer, offers, invoice, error, busy, loading, create, reload: () => setReloadVersion(value => value + 1) };
}
export function useCommercialInvoice(id: string) {
  const version = useRef(0);
  const [invoice, setInvoice] = useState<CommercialInvoice | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const current = ++version.current;
    const row = await commercialData<CommercialInvoice>(`/api/student/invoices/${commercialId(id)}`);
    if (current === version.current) setInvoice(row);
  }, [id]);
  useEffect(() => { let active = true; void Promise.resolve().then(() => { if (active) return refresh(); }).catch(error => { if (active) setError(error.message); }); return () => { active = false; version.current += 1; }; }, [refresh]);
  async function transition(action: "submit" | "mark-paid") {
    if (busy || !invoice || (action === "submit" ? invoice.status !== "draft" : invoice.status !== "awaiting_payment")) return;
    setBusy(true); setError("");
    try { const row = await commercialWrite<CommercialInvoice>(`/api/student/invoices/${commercialId(id)}/${action}`, "POST"); setInvoice(row); }
    catch (error) { setError(error instanceof Error ? error.message : "Permintaan belum berhasil."); }
    finally { setBusy(false); }
  }
  return { invoice, error, busy, refresh, submit: () => transition("submit"), markPaid: () => transition("mark-paid") };
}
