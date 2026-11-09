import { commercialWhatsApp, type CommercialInvoice } from "@/lib/commercial-api";

export const ADMIN_WHATSAPP_URL = "https://wa.me/6285194564214";
export function invoiceWhatsAppUrl(invoice: Pick<CommercialInvoice, "id" | "program_code" | "plan_code">): string {
  const plan = invoice.plan_code === "sensei" ? "Belajar dengan Sensei" : "Belajar Mandiri";
  return `${ADMIN_WHATSAPP_URL}?text=${encodeURIComponent(`Halo Admin HiruAcademy, saya ingin konfirmasi pembayaran invoice ${invoice.id}, paket ${plan}, level ${invoice.program_code.toUpperCase()}. Mohon panduan konfirmasi pembayaran.`)}`;
}

export function studentWhatsAppUrl(phone?: string | null): string | null {
  const value = phone?.trim() || "";
  if (!/^\+?[0-9][0-9 ()-]*$/.test(value)) return null;
  const digits = value.replace(/[^0-9]/g, "");
  const normalized = value.startsWith("0") ? `62${digits.slice(1)}` : digits;
  return commercialWhatsApp(normalized, "");
}
