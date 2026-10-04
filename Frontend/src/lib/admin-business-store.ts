"use client";

import { useSyncExternalStore } from "react";
import { AUTH_EXPIRED_EVENT } from "@/lib/api";
import { commercialCode, commercialData, commercialId, commercialWrite, type CommercialInvoice, type EffectiveAccess, type Identity, type Offer } from "@/lib/commercial-api";

export const BUSINESS_STORAGE_KEY = "hiru-admin-business:v1";
export const BUSINESS_CHANGE_EVENT = "hiru:business-change";
export type InvoiceStatus = "Draft" | "Menunggu pembayaran" | "Sudah bayar" | "Diverifikasi" | "Aktif";
export type InvoiceTimelineItem = { title: string; at: string; note?: string };
export type Invoice = { id: string; createdAt: string; userName: string; userEmail: string; userWhatsApp: string; programCode: string; plan: "lms" | "sensei"; amount: number; status: InvoiceStatus; referralCode?: string; affiliateId?: string; targetJLPT?: string; paymentNote?: string; transferReference?: string; paidAt?: string; verifiedAt?: string; activatedAt?: string; timeline: InvoiceTimelineItem[] };
export type UserStatus = "Aktif" | "Nonaktif";
export type UserMembership = "free" | "lms" | "sensei";
export type BusinessUser = { id: string; name: string; email: string; whatsapp: string; membership: UserMembership; purchasedLevel?: string; status: UserStatus; activeSince?: string; activeUntil?: string; targetJLPT?: string; country?: string; referredByCode?: string; invoiceIds: string[] };
export type AffiliateAccount = { id: string; userId?: string; name: string; code: string; status: "Aktif" | "Nonaktif"; clicks: number; registrations: number; purchases: number; totalCommission: number; unpaidCommission: number; paidCommission: number; createdAt: string };
export type CommissionStatus = "Menunggu Validasi" | "Tersedia" | "Sudah Dicairkan" | "Dibatalkan";
export type Commission = { id: string; affiliateId: string; affiliateCode: string; invoiceId: string; amount: number; status: CommissionStatus; eligibleAt: string; createdAt: string; paidAt?: string; payoutId?: string };
export type PayoutStatus = "Menunggu" | "Diproses" | "Sudah Dicairkan" | "Ditolak";
export type Payout = { id: string; affiliateId: string; affiliateName: string; amount: number; commissionIds: string[]; createdAt: string; status: PayoutStatus; paidAt?: string; notes?: string };
export type BusinessSettings = { adminWhatsAppNumber: string; invoiceWhatsAppTemplate: string; affiliateEnabled: boolean; commissionMode: "Percentage" | "Nominal"; commissionValue: number; validationPeriodDays: number };
export type BusinessActivity = { id: string; title: string; detail: string; at: string; status?: string };
export type BusinessStoreData = { version: 1; invoices: Invoice[]; users: BusinessUser[]; affiliates: AffiliateAccount[]; commissions: Commission[]; payouts: Payout[]; settings: BusinessSettings; activities: BusinessActivity[]; loading?: boolean; error?: string };
export const initialBusinessSettings: BusinessSettings = { adminWhatsAppNumber: "", invoiceWhatsAppTemplate: "", affiliateEnabled: false, commissionMode: "Percentage", commissionValue: 0, validationPeriodDays: 0 };
export const initialBusinessInvoices: Invoice[] = [];
export const initialBusinessUsers: BusinessUser[] = [];
export const initialBusinessAffiliates: AffiliateAccount[] = [];
export const initialBusinessCommissions: Commission[] = [];
export const initialBusinessPayouts: Payout[] = [];
export const initialBusinessActivities: BusinessActivity[] = [];
export const createInitialBusinessStore = (): BusinessStoreData => ({ version: 1, invoices: [], users: [], affiliates: [], commissions: [], payouts: [], settings: initialBusinessSettings, activities: [] });
export const initialBusinessStore = createInitialBusinessStore();
let snapshot = initialBusinessStore;
let identity: Identity | null = null;
let access: EffectiveAccess | null = null;
let request: Promise<void> | null = null;
let generation = 0;
const listeners = new Set<() => void>();
const statusLabels: Record<string, InvoiceStatus> = { draft: "Draft", awaiting_payment: "Menunggu pembayaran", paid: "Sudah bayar", verified: "Diverifikasi", active: "Aktif" };
function announce() { listeners.forEach(listener => listener()); }
export function mapBusinessInvoice(row: CommercialInvoice, user?: Identity, offers: Offer[] = []): Invoice {
  return { id: String(row.id), createdAt: row.created_at, userName: user?.id === row.user_id ? user.name : `ID ${row.user_id}`, userEmail: user?.id === row.user_id ? user.email : "", userWhatsApp: user?.id === row.user_id ? user.whatsapp : "", programCode: commercialCode(row.program_code || offers.find(offer => offer.program_id === row.program_id)?.program.code || ""), plan: row.plan_code, amount: row.total_price, status: statusLabels[row.status], paidAt: row.paid_at, verifiedAt: row.verified_at, activatedAt: row.activated_at, paymentNote: row.note, timeline: [["Draft", row.created_at], ["Menunggu pembayaran", row.submitted_at], ["Sudah bayar", row.paid_at], ["Diverifikasi", row.verified_at], ["Aktif", row.activated_at]].filter((item): item is [string, string] => Boolean(item[1])).map(([title, at]) => ({ title, at })) };
}
export async function refreshBusinessStore() {
  if (request) return request;
  const version = generation;
  request = (async () => {
    try {
      const user = await commercialData<Identity>("/api/me");
      const [rows, offers, entitlement] = await Promise.all([commercialData<CommercialInvoice[]>(`/api/${user.role === "admin" ? "admin" : "student"}/invoices`), commercialData<Offer[]>(`/api/${user.role === "admin" ? "admin" : "public"}/offers`), user.role === "student" ? commercialData<EffectiveAccess>("/api/student/access") : Promise.resolve(null)]);
      if (version !== generation) return;
      identity = user; access = entitlement;
      snapshot = { ...createInitialBusinessStore(), invoices: rows.map(row => mapBusinessInvoice(row, user, offers)), users: user.role === "student" ? [{ id: String(user.id), name: user.name, email: user.email, whatsapp: user.whatsapp, country: user.country, targetJLPT: user.target_jlpt, status: user.account_status === "active" ? "Aktif" : "Nonaktif", membership: entitlement?.source_grants.some(grant => grant.plan_code === "sensei") ? "sensei" : entitlement?.source_grants.length ? "lms" : "free", invoiceIds: rows.map(row => String(row.id)) }] : [] };
    } catch (error) { if (version === generation) { identity = null; access = null; snapshot = { ...createInitialBusinessStore(), error: error instanceof Error ? error.message : "Permintaan belum berhasil." }; } }
    finally { if (version === generation) { request = null; announce(); } }
  })();
  return request;
}
export const loadBusinessStore = (storage?: unknown) => { void storage; return snapshot; };
export const readBusinessIdentity = () => identity;
export const readBusinessAccess = () => access;
export const normalizeBusinessStore = (value?: unknown): BusinessStoreData => { void value; return createInitialBusinessStore(); };
function unavailable(...args: unknown[]): never { void args; throw new Error("OPEN: endpoint belum tersedia. Perubahan tidak disimpan."); }
export const saveBusinessStore = unavailable;
export const createInvoice: (data: Omit<Invoice, "id" | "createdAt" | "timeline">) => Invoice = unavailable;
export const createPayout: (affiliateId: string, amount: number, notes?: string) => Payout = unavailable;
export const markPayoutPaid: (id: string) => BusinessStoreData = unavailable;
export const createAffiliate: (data: Partial<AffiliateAccount>) => AffiliateAccount = unavailable;
export const toggleAffiliateStatus: (id: string) => BusinessStoreData = unavailable;
export const updateUser: (id: string, data: Partial<BusinessUser>) => BusinessStoreData = unavailable;
export const toggleUserStatus: (id: string) => BusinessStoreData = unavailable;
export const extendUserAccess: (id: string, months: number) => BusinessStoreData = unavailable;
export const updateBusinessSettings: (settings: Partial<BusinessSettings>) => BusinessStoreData = unavailable;
export async function updateInvoiceStatus(id: string, status: InvoiceStatus, _note?: string) {
  void _note;
  const user = await commercialData<Identity>("/api/me");
  const code = Object.entries(statusLabels).find(([, label]) => label === status)?.[0];
  if (!code || (user.role === "student" && !["Menunggu pembayaran", "Sudah bayar"].includes(status))) throw new Error("Perubahan status tidak diizinkan.");
  await commercialWrite(`/api/${user.role === "admin" ? "admin" : "student"}/invoices/${commercialId(id)}/${user.role === "admin" ? "transition" : status === "Sudah bayar" ? "mark-paid" : "submit"}`, "POST", user.role === "admin" ? { status: code } : undefined);
  await refreshBusinessStore(); return snapshot;
}
export const activateUserMembershipForInvoice = (id: string) => updateInvoiceStatus(id, "Aktif");
export const generateCommissionForInvoice: (id: string) => BusinessStoreData = unavailable;
function subscribe(listener: () => void) {
  listeners.add(listener); void refreshBusinessStore();
  const clear = () => { generation += 1; request = null; identity = null; access = null; snapshot = createInitialBusinessStore(); announce(); };
  window.addEventListener(AUTH_EXPIRED_EVENT, clear);
  return () => { listeners.delete(listener); window.removeEventListener(AUTH_EXPIRED_EVENT, clear); if (!listeners.size) { generation += 1; request = null; identity = null; access = null; snapshot = createInitialBusinessStore(); } };
}
export function useBusinessAdminStore(): BusinessStoreData { return useSyncExternalStore(subscribe, loadBusinessStore, () => initialBusinessStore); }
