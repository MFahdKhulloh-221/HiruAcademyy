import { commercialWhatsApp, type CommercialInvoice } from "@/lib/commercial-api";

export const ADMIN_WHATSAPP_URL = "https://wa.me/6285194564214";
export function invoiceWhatsAppUrl(invoice: Pick<CommercialInvoice, "id" | "plan_code"> & { program_code?: string | null }, email?: string): string {
  const plan = invoice.plan_code === "sensei" ? "Belajar dengan Sensei" : "Belajar Mandiri";
  const level = invoice.program_code?.trim().toUpperCase();
  return `${ADMIN_WHATSAPP_URL}?text=${encodeURIComponent(`Halo Admin HiruAcademy, saya ingin konfirmasi pembayaran invoice ${invoice.id}${email?.trim() ? `, email akun ${email.trim()}` : ""}, paket ${plan}${level ? `, level ${level}` : ""}. Mohon panduan konfirmasi pembayaran.`)}`;
}

export function studentWhatsAppUrl(phone?: string | null): string | null {
  const value = phone?.trim() || "";
  if (!/^\+?[0-9][0-9 ()-]*$/.test(value)) return null;
  const digits = value.replace(/[^0-9]/g, "");
  const normalized = value.startsWith("0") ? `62${digits.slice(1)}` : digits;
  return commercialWhatsApp(normalized, "");
}
