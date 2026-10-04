"use client";

import { apiRequest } from "@/lib/api";

export type Offer = { id?: number; program_id?: number; program: { code: string; name: string; slug: string }; plan_code: "lms" | "sensei"; base_price: number | null; effective_price: number | null; discount_amount: number; discount_percent: number; duration_months: number; status?: string };
export type CommercialInvoice = { id: number; user_id: number; program_id: number; program_code: string; plan_code: "lms" | "sensei"; base_price: number; discount_amount: number; total_price: number; status: string; created_at: string; due_date?: string; paid_at?: string; verified_at?: string; activated_at?: string; submitted_at?: string; note?: string; access_grant?: { starts_at: string; ends_at: string } };
export type Identity = { id: number; name: string; email: string; whatsapp: string; role: "student" | "admin"; account_status: string; country?: string; target_jlpt?: string };
export type EffectiveAccess = { learning: Record<string, "preview" | "full" | "none">; replay_levels: string[]; source_grants: { id: number; program_code: string; plan_code: "lms" | "sensei"; starts_at: string; ends_at: string }[] };
export type ApiAffiliate = { id: number; user_id?: number; name: string; code: string; status: string; email?: string; whatsapp?: string; rate?: number | null; created_at: string };
export type ApiCommission = { id: number; affiliate_id: number; invoice_id: number; amount: number; status: "pending" | "approved" | "paid" | "cancelled"; created_at: string; paid_at?: string; note?: string };
export function commercialSelection(params: { get: (key: string) => string | null }) {
  const code = params.get("level")?.toUpperCase() || "";
  return { level: ["N5", "N4", "N3", "N2", "N1", "SSW", "SSW-FOOD", "INTERVIEW"].includes(code) ? code === "SSW-FOOD" ? "SSW" : code : "", plan: (params.get("plan") === "sensei" ? "sensei" : "lms") as "lms" | "sensei" };
}
export const commercialCode = (code: string) => code === "ssw-food" ? "SSW" : code.toUpperCase();
export const commercialId = (id: string | number) => { if (!/^\d+$/.test(String(id))) throw new Error("ID tidak valid."); return String(id); };
export async function commercialData<T>(path: string): Promise<T> { return (await apiRequest<{ data: T }>(path)).data; }
export async function commercialWrite<T>(path: string, method: string, data?: unknown): Promise<T> { return (await apiRequest<{ data: T }>(path, { method, ...(data === undefined ? {} : { body: JSON.stringify(data) }) }))?.data; }
export async function createCommercialDraft(order: { level: string; plan: "lms" | "sensei"; referral?: string }) {
  const identity = await commercialData<Identity>("/api/me");
  if (identity.role !== "student" || order.level.toUpperCase() === "N1") throw new Error("Program belum tersedia.");
  const offers = await commercialData<Offer[]>("/api/public/offers");
  const offer = offers.find(item => commercialCode(item.program.code) === order.level.toUpperCase() && item.plan_code === order.plan && item.base_price !== null);
  if (!offer?.id) throw new Error("Program belum tersedia.");
  const invoice = await commercialWrite<CommercialInvoice>("/api/student/invoices", "POST", { program_offer_id: offer.id, ...(order.referral?.trim() ? { referral_code: order.referral.trim() } : {}) });
  return invoice;
}
export async function createCommercialInvoice(order: { level: string; plan: "lms" | "sensei"; referral?: string }) {
  const invoice = await createCommercialDraft(order);
  return commercialWrite<CommercialInvoice>(`/api/student/invoices/${invoice.id}/submit`, "POST");
}
export function commercialWhatsApp(phone: string, message: string): string | null {
  if (!/^\+?[1-9]\d{7,14}$/.test(phone)) return null;
  return `https://wa.me/${phone.replace(/^\+/, "")}?text=${encodeURIComponent(message)}`;
}
