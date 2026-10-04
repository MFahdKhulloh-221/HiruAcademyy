"use client";

import { createCommercialInvoice, commercialData, commercialWhatsApp, type Identity } from "@/lib/commercial-api";
import { loadBusinessStore, mapBusinessInvoice, readBusinessAccess, refreshBusinessStore, useBusinessAdminStore, type BusinessSettings, type BusinessUser, type Invoice } from "@/lib/admin-business-store";
export type { BusinessSettings, BusinessStoreData, BusinessUser, Commission, CommissionStatus, Invoice, InvoiceStatus, InvoiceTimelineItem, Payout, PayoutStatus, UserMembership, UserStatus } from "@/lib/admin-business-store";
export const readBusinessStore = loadBusinessStore;
export const useBusinessStore = useBusinessAdminStore;
export type PublicOrder = { level: string; plan: "lms" | "sensei"; name?: string; email?: string; whatsapp?: string; referral?: string };
export function createPublicInvoice(_order: PublicOrder): Invoice { void _order; throw new Error("Gunakan createPublicInvoiceAsync; invoice memerlukan konfirmasi server."); }
export async function createPublicInvoiceAsync(order: PublicOrder): Promise<Invoice> {
  const row = await createCommercialInvoice(order);
  const user = await commercialData<Identity>("/api/me");
  await refreshBusinessStore();
  return { ...mapBusinessInvoice(row, user), programCode: order.level.toUpperCase() };
}
export function getInvoiceWhatsAppUrl(invoice: Invoice, settings?: BusinessSettings): string {
  const phone = settings?.adminWhatsAppNumber || "";
  const template = settings?.invoiceWhatsAppTemplate || "";
  if (!template) return "";
  const message = template.replaceAll("{invoice_id}", invoice.id).replaceAll("{name}", invoice.userName).replaceAll("{program}", invoice.programCode).replaceAll("{level}", invoice.programCode).replaceAll("{plan}", invoice.plan === "sensei" ? "Belajar dengan Sensei" : "Belajar Mandiri (LMS)").replaceAll("{amount}", invoice.amount.toLocaleString("id-ID")).replaceAll("{target}", invoice.targetJLPT || "-");
  return commercialWhatsApp(phone, message) || "";
}
export function getCurrentDemoUser(): BusinessUser {
  return loadBusinessStore().users[0] || { id: "", name: "", email: "", whatsapp: "", membership: "free", status: "Nonaktif", invoiceIds: [] };
}
export function getEffectiveMembership(_queryMembership?: string): "free" | "lms" | "sensei" {
  void _queryMembership;
  const access = readBusinessAccess();
  return access?.source_grants.some(grant => grant.plan_code === "sensei") ? "sensei" : access?.source_grants.length ? "lms" : "free";
}
