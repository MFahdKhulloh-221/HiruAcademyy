"use client";

import { apiRequest } from "@/lib/api";

export type Offer = { id?: number; program_id?: number; program: { id?: number; code: string; name: string; slug: string }; plan_code: "lms" | "sensei"; base_price: number | null; effective_price: number | null; discount_amount: number; discount_percent: number; duration_months: number; promotion?: { discount_percent: number; starts_at: string | null; ends_at: string | null } | null; status?: string; program_status?: string };
export type CommercialInvoice = { referral_discount?: number; credit_discount?: number; promo_discount?: number; renewal_grant_id?: number | null; id: number; user_id: number; program_id: number; program_code: string; plan_code: "lms" | "sensei"; base_price: number; discount_amount: number; total_price: number; duration_months?: number; status: string; created_at: string; due_date?: string; paid_at?: string; verified_at?: string; activated_at?: string; submitted_at?: string; note?: string; access_grant?: { starts_at: string; ends_at: string } };
export type Identity = { id: number; name: string; email: string; whatsapp: string; role: "student" | "admin"; account_status: string; country?: string; target_jlpt?: string };
export type EffectiveAccess = { learning: Record<string, "preview" | "full" | "none">; replay_levels: string[]; source_grants: { id: number; program_code: string; plan_code: "lms" | "sensei"; starts_at: string; ends_at: string }[] };
export type ApiAffiliate = { id: number; user_id?: number; name: string; code: string; status: string; email?: string; whatsapp?: string; rate?: number | null; created_at: string };
export type ApiCommission = { hold_reason?: string | null; id: number; affiliate_id: number; invoice_id: number; amount: number; status: "pending" | "approved" | "paid" | "cancelled"; created_at: string; paid_at?: string; note?: string };
export function commercialSelection(params: { get: (key: string) => string | null }) {
  const code = commercialCode(params.get("program") ?? params.get("level") ?? "");
  const plan = params.get("plan");
  return { level: plan && !["lms", "sensei"].includes(plan) ? "" : code, plan: (plan === "sensei" ? "sensei" : "lms") as "lms" | "sensei" };
}
export const commercialCode = (code: string) => code.trim().toUpperCase() === "SSW-FOOD" ? "SSW" : code.trim().toUpperCase();
export const commercialId = (id: string | number) => { if (!/^\d+$/.test(String(id))) throw new Error("ID tidak valid."); return String(id); };
async function invoiceProjection<T>(path: string, data: T, signal?: AbortSignal): Promise<T> {
  if (!/^\/api\/student\/invoices(?:\/\d+(?:\/(?:submit|mark-paid))?)?$/.test(path) || !data || Array.isArray(data)) return data;
  const invoice = data as unknown as CommercialInvoice;
  if (!Number.isSafeInteger(invoice.id) || invoice.id < 1 || !Number.isSafeInteger(invoice.program_id) || !["lms", "sensei"].includes(invoice.plan_code)) throw new Error("Data invoice tidak valid. Periksa daftar invoice sebelum mencoba kembali.");
  if (typeof invoice.program_code === "string" && invoice.program_code.trim()) return data;
  const programs = (await apiRequest<{ data: { id: number; code: string }[] }>("/api/public/programs", { signal })).data;
  const program = programs.find(item => item.id === invoice.program_id);
  if (!program || typeof program.code !== "string" || !program.code.trim()) throw new Error("Program invoice tidak ditemukan. Periksa daftar invoice sebelum mencoba kembali.");
  return { ...invoice, program_code: program.code } as T;
}
export async function commercialData<T>(path: string, signal?: AbortSignal): Promise<T> { return invoiceProjection(path, (await apiRequest<{ data: T }>(path, { signal })).data, signal); }
export async function commercialWrite<T>(path: string, method: string, data?: unknown): Promise<T> { return invoiceProjection(path, (await apiRequest<{ data: T }>(path, { method, ...(data === undefined ? {} : { body: JSON.stringify(data) }) }))?.data); }
export class InvoiceCreatedError extends Error {}
export async function createCommercialDraft(order: { level: string; plan: "lms" | "sensei"; referral?: string; useCredit?: boolean; requestKey?: string }) {
  const identity = await commercialData<Identity>("/api/me");
  if (identity.role !== "student") throw new Error("Pembelian hanya tersedia untuk akun siswa.");
  const offers = await commercialData<Offer[]>("/api/public/offers");
  const offer = offers.find(item => commercialCode(item.program.code) === commercialCode(order.level) && item.plan_code === order.plan && item.base_price !== null);
  if (!offer?.id) throw new Error("Program belum tersedia.");
  let programId = offer.program_id ?? offer.program.id;
  if (programId === undefined) {
    const programs = await commercialData<{ id: number; code: string }[]>("/api/public/programs");
    programId = programs.find(program => commercialCode(program.code) === commercialCode(offer.program.code))?.id;
  }
  if (!Number.isSafeInteger(programId) || programId! < 1) throw new Error("Data program belum tersedia. Muat ulang halaman atau hubungi Admin.");
  const invoice = (await apiRequest<{ data: CommercialInvoice }>("/api/student/invoices", { method: "POST", body: JSON.stringify({ program_offer_id: offer.id, use_credit: order.useCredit ?? false, credit_request_key: order.requestKey ?? crypto.randomUUID(), ...(order.referral?.trim() ? { referral_code: order.referral.trim() } : {}) }) })).data;
  try {
    if (invoice?.program_id !== programId || invoice.plan_code !== offer.plan_code) throw new Error("Program invoice tidak sesuai pesanan.");
    return await invoiceProjection("/api/student/invoices", { ...invoice, program_code: offer.program.code });
  } catch {
    throw new InvoiceCreatedError("Invoice sudah diterima server, tetapi datanya tidak sesuai. Jangan membuat invoice ulang; periksa daftar invoice atau hubungi Admin.");
  }
}
export async function createCommercialInvoice(order: { level: string; plan: "lms" | "sensei"; referral?: string; useCredit?: boolean; requestKey?: string }) {
  const invoice = await createCommercialDraft(order);
  return commercialWrite<CommercialInvoice>(`/api/student/invoices/${invoice.id}/submit`, "POST");
}
export function commercialWhatsApp(phone: string, message: string): string | null {
  if (!/^\+?[1-9]\d{7,14}$/.test(phone)) return null;
  return `https://wa.me/${phone.replace(/^\+/, "")}?text=${encodeURIComponent(message)}`;
}
