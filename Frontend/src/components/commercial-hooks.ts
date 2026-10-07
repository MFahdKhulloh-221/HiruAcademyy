"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { commercialData, commercialId, commercialWrite, createCommercialDraft, type CommercialInvoice, type Offer } from "@/lib/commercial-api";

export type StudentAffiliateProjection = { affiliate: { id: number; name: string; code: string; status: string; rate: number | null } | null; code: string | null; totals: { pending: number; approved: number; paid: number } };
export function useCommercialAffiliate() {
  const [data, setData] = useState<StudentAffiliateProjection | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { let active = true; void commercialData<StudentAffiliateProjection>("/api/student/affiliate").then(projection => { if (active) setData(projection); }).catch(error => { if (active) setError(error.message); }); return () => { active = false; }; }, []);
  return { data, error };
}

export function useCommercialOrder(level: string, plan: "lms" | "sensei") {
  const inFlight = useRef(false);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [invoice, setInvoice] = useState<CommercialInvoice | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; void commercialData<Offer[]>("/api/public/offers").then(rows => { if (active) setOffers(rows); }).catch(error => { if (active) setError(error.message); }); return () => { active = false; }; }, []);
  const offer = offers.find(row => row.program.code.toUpperCase() === level.toUpperCase() && row.plan_code === plan && row.base_price !== null && row.program.code !== "n1");
  async function create(referral?: string) {
    if (inFlight.current || !offer) return null;
    inFlight.current = true; setBusy(true); setError("");
    try { const row = await createCommercialDraft({ level, plan, referral }); setInvoice(row); return row; }
    catch (error) { setError(error instanceof Error ? error.message : "Permintaan belum berhasil."); return null; }
    finally { inFlight.current = false; setBusy(false); }
  }
  return { offer, offers, invoice, error, busy, create };
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
