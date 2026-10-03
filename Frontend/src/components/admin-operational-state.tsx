"use client";

import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

export const adminPrograms = ["DASAR", "N5", "N4", "N3", "N2", "N1", "SSW", "INTERVIEW"] as const;
export type AdminProgram = (typeof adminPrograms)[number];
export type AdminPlan = "free" | "lms" | "sensei";
export type AdminAccess = { id: string; program: AdminProgram; plan: Exclude<AdminPlan, "free">; start: string; end: string; status: "Aktif" | "Nonaktif"; invoiceId?: string };
export type AdminOperationalUser = { id: string; name: string; email: string; whatsapp: string; country?: string; targetJLPT?: string; role: "admin" | "student"; status: "Aktif" | "Nonaktif"; accesses: AdminAccess[] };
export const adminInvoiceStatuses = ["Draft", "Menunggu Pembayaran", "Sudah Bayar", "Diverifikasi", "Aktif"] as const;
export type AdminOperationalInvoice = { id: string; userId: string; program: AdminProgram; plan: "lms" | "sensei"; amount: number; basePrice?: number; discount?: number; dueDate?: string; status: (typeof adminInvoiceStatuses)[number]; start: string; end: string; affiliateId?: string; createdAt: string; paidAt?: string; verifiedAt?: string; activatedAt?: string; note: string; timeline: { status: string; at: string }[] };
export type AdminOperationalAffiliate = { id: string; userId?: string; name: string; code: string; status: "Aktif" | "Nonaktif"; clicks: number; registrations: number; purchases: number; totalCommission: number; unpaidCommission: number; paidCommission: number; createdAt: string };
export type AdminCommissionState = { id: string; affiliateId: string; affiliateCode: string; invoiceId: string; amount: number; status: "Menunggu Validasi" | "Tersedia" | "Sudah Dicairkan" | "Dibatalkan"; eligibleAt: string; createdAt: string; paidAt?: string; payoutId?: string };
export const adminOperationalPrices: Record<AdminProgram, { lms: number | null; sensei: number | null }> = {
  DASAR: { lms: 99000, sensei: 350000 }, N5: { lms: 99000, sensei: 350000 }, N4: { lms: 99000, sensei: 350000 }, N3: { lms: 199000, sensei: 450000 }, N2: { lms: 249000, sensei: 550000 }, N1: { lms: null, sensei: null }, SSW: { lms: 299000, sensei: null }, INTERVIEW: { lms: 199000, sensei: null },
};
export function adminDateValid(date: string) { return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date; }
export function adminAccessError(access: Pick<AdminAccess, "program" | "plan" | "start" | "end">) {
  if (!adminPrograms.includes(access.program) || !["lms", "sensei"].includes(access.plan)) return "Pilih program dan cara belajar yang valid.";
  if (["SSW", "INTERVIEW"].includes(access.program) && access.plan !== "lms") return "SSW dan Interview hanya tersedia untuk Belajar Mandiri.";
  if (!adminDateValid(access.start) || !adminDateValid(access.end)) return "Tanggal mulai dan tanggal akhir wajib diisi dengan tanggal yang valid.";
  if (access.end < access.start) return "Tanggal akhir tidak boleh sebelum tanggal mulai.";
  return "";
}
export function adminProfileError(user: Pick<AdminOperationalUser, "name" | "email" | "whatsapp">) {
  if (!user.name.trim()) return "Nama wajib diisi.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email.trim())) return "Isi alamat email yang valid.";
  if (!/^\+?[\d\s()-]+$/.test(user.whatsapp.trim()) || !/^\d{8,15}$/.test(user.whatsapp.replace(/\D/g, ""))) return "Isi nomor WhatsApp dengan 8–15 digit.";
  return "";
}
export function adminToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
export function adminAccessStatus(access: AdminAccess, today = adminToday()) { return access.end < today ? "Expired" : access.status === "Nonaktif" ? "Tidak Aktif" : access.start > today ? "Belum Aktif" : "Aktif"; }
export function adminEffectiveAccess(user: AdminOperationalUser, today = adminToday()) {
  const active = user.status === "Aktif" ? user.accesses.filter((access) => access.status === "Aktif" && access.start <= today && access.end >= today) : [];
  return adminPrograms.map((program, index) => {
    const lms = active.some((access) => access.program === program || (index <= 5 && adminPrograms.indexOf(access.program) <= 5 && adminPrograms.indexOf(access.program) >= index));
    const replay = index >= 1 && index <= 5 && active.some((access) => access.plan === "sensei" && adminPrograms.indexOf(access.program) <= 5 && adminPrograms.indexOf(access.program) >= index);
    return { program, material: user.status !== "Aktif" ? "Tidak Aktif" : lms ? "Akses penuh" : index <= 5 ? "Preview Chapter 1" : "Terkunci", replay: replay ? "Akses Replay" : "Pratinjau Replay" };
  });
}

export function checkAdminOperationalRules() {
  const user: AdminOperationalUser = { id: "check", name: "Check", email: "check@example.com", whatsapp: "081234567890", role: "student", status: "Aktif", accesses: [{ id: "check-access", program: "N4", plan: "sensei", start: "2026-01-01", end: "2026-12-31", status: "Aktif" }] };
  const rows = adminEffectiveAccess(user, "2026-06-01");
  if (adminDateValid("2026-02-30") || !adminAccessError({ program: "SSW", plan: "sensei", start: "2026-01-01", end: "2026-12-31" }) || rows[0].material !== "Akses penuh" || rows[1].replay !== "Akses Replay" || rows[3].material !== "Preview Chapter 1" || rows[6].material !== "Terkunci" || adminEffectiveAccess({ ...user, accesses: [] }, "2026-06-01").slice(0, 6).some((row) => row.material !== "Preview Chapter 1") || adminEffectiveAccess({ ...user, accesses: [] }, "2026-06-01")[7].material !== "Terkunci" || adminAccessStatus(user.accesses[0], "2027-01-01") !== "Expired") throw new Error("Admin operational rules check failed");
  return true;
}

type OperationsState = { users: AdminOperationalUser[]; invoices: AdminOperationalInvoice[]; affiliates: AdminOperationalAffiliate[]; commissionStates: AdminCommissionState[] };
export type AdminOperationsContext = OperationsState & { setUsers: Dispatch<SetStateAction<AdminOperationalUser[]>>; setInvoices: Dispatch<SetStateAction<AdminOperationalInvoice[]>>; setAffiliates: Dispatch<SetStateAction<AdminOperationalAffiliate[]>>; setCommissionStates: Dispatch<SetStateAction<AdminCommissionState[]>>; advanceInvoice: (id: string, expectedStatus: AdminOperationalInvoice["status"]) => void };
function initialState(): OperationsState {
  const users: AdminOperationalUser[] = [
    { id: "USR-001", name: "Hilmi Farhan", email: "hilmi@example.com", whatsapp: "081234567801", country: "Indonesia", targetJLPT: "N4 Juli 2026", role: "student", status: "Aktif", accesses: [{ id: "access-hilmi", program: "N4", plan: "lms", start: "2026-01-01", end: "2027-01-01", status: "Aktif" }] },
    { id: "USR-002", name: "Ayu Pratama", email: "ayu@example.com", whatsapp: "081234567802", country: "Indonesia", targetJLPT: "N5 Juli 2026", role: "student", status: "Aktif", accesses: [] },
    { id: "USR-003", name: "Budi Santoso", email: "budi@example.com", whatsapp: "081234567803", country: "Indonesia", targetJLPT: "N3 Desember 2026", role: "student", status: "Aktif", accesses: [{ id: "access-budi", program: "N3", plan: "lms", start: "2026-02-14", end: "2027-02-14", status: "Aktif" }] },
    { id: "USR-004", name: "Rina Wulandari", email: "rina@example.com", whatsapp: "081234567804", country: "Indonesia", targetJLPT: "N4 Juli 2026", role: "student", status: "Aktif", accesses: [{ id: "access-rina", program: "N4", plan: "sensei", start: "2026-01-01", end: "2027-01-01", status: "Aktif", invoiceId: "INV-2026-004" }] },
    { id: "USR-005", name: "Dimas Nugroho", email: "dimas@example.com", whatsapp: "081234567805", country: "Indonesia", targetJLPT: "", role: "student", status: "Nonaktif", accesses: [] },
  ];
  const invoices: AdminOperationalInvoice[] = [
    { id: "INV-2026-001", userId: "USR-001", program: "N4", plan: "lms", amount: 99000, status: "Menunggu Pembayaran", affiliateId: "AFF-002", start: "", end: "", createdAt: "2026-02-15T09:00:00.000Z", note: "", timeline: [] },
    { id: "INV-2026-002", userId: "USR-002", program: "N5", plan: "sensei", amount: 350000, status: "Sudah Bayar", start: "", end: "", createdAt: "2026-02-16T08:30:00.000Z", paidAt: "2026-02-16T10:15:00.000Z", note: "Transfer BCA atas nama Ayu Pratama", timeline: [] },
    { id: "INV-2026-003", userId: "USR-003", program: "N3", plan: "lms", amount: 199000, status: "Diverifikasi", affiliateId: "AFF-001", start: "", end: "", createdAt: "2026-02-14T11:00:00.000Z", paidAt: "2026-02-14T11:30:00.000Z", verifiedAt: "2026-02-14T13:00:00.000Z", note: "Transfer Mandiri", timeline: [] },
    { id: "INV-2026-004", userId: "USR-004", program: "N4", plan: "sensei", amount: 350000, status: "Aktif", affiliateId: "AFF-001", start: "2026-01-01", end: "2027-01-01", createdAt: "2026-02-10T08:15:00.000Z", activatedAt: "2026-02-10T09:05:00.000Z", note: "Transfer BNI", timeline: [] },
  ];
  return { users, invoices: invoices.map((invoice) => ({ ...invoice, basePrice: invoice.amount, discount: 0, dueDate: "" })), affiliates: [
    { id: "AFF-001", userId: "USR-001", name: "Hilmi Farhan", code: "HIRU-HILMI25", status: "Aktif", clicks: 142, registrations: 28, purchases: 6, totalCommission: 540000, unpaidCommission: 240000, paidCommission: 300000, createdAt: "2026-01-10T00:00:00.000Z" },
    { id: "AFF-002", userId: "USR-004", name: "Rina Wulandari", code: "HIRU-RINA", status: "Aktif", clicks: 65, registrations: 12, purchases: 2, totalCommission: 160000, unpaidCommission: 160000, paidCommission: 0, createdAt: "2026-01-20T00:00:00.000Z" },
  ], commissionStates: [
    { id: "COM-2026-001", affiliateId: "AFF-001", affiliateCode: "HIRU-HILMI25", invoiceId: "INV-2026-004", amount: 84900, status: "Sudah Dicairkan", eligibleAt: "2026-02-10T09:00:00.000Z", createdAt: "2026-02-10T09:00:00.000Z", paidAt: "2026-02-12T10:00:00.000Z", payoutId: "PAY-2026-002" },
    { id: "COM-2026-002", affiliateId: "AFF-001", affiliateCode: "HIRU-HILMI25", invoiceId: "INV-2026-003", amount: 39900, status: "Tersedia", eligibleAt: "2026-02-14T13:00:00.000Z", createdAt: "2026-02-14T13:00:00.000Z" },
  ] };
}
const Context = createContext<AdminOperationsContext | null>(null);
export function AdminOperationalProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(initialState);
  function setter<K extends keyof OperationsState>(key: K): Dispatch<SetStateAction<OperationsState[K]>> { return (update) => setState((current) => ({ ...current, [key]: typeof update === "function" ? (update as (value: OperationsState[K]) => OperationsState[K])(current[key]) : update })); }
  function advanceInvoice(id: string, expectedStatus: AdminOperationalInvoice["status"]) {
    setState((current) => {
      const invoice = current.invoices.find((item) => item.id === id);
      if (!invoice || invoice.status !== expectedStatus || invoice.status === "Aktif") return current;
      const user = current.users.find((item) => item.id === invoice.userId);
      const price = adminOperationalPrices[invoice.program]?.[invoice.plan];
      if (!user || user.role !== "student" || user.status !== "Aktif" || price === null || price === undefined || !Number.isSafeInteger(invoice.amount) || invoice.amount < 0 || (invoice.affiliateId && !current.affiliates.some((item) => item.id === invoice.affiliateId))) return current;
      const status = adminInvoiceStatuses[adminInvoiceStatuses.indexOf(invoice.status) + 1];
      if (!status || (status === "Aktif" && adminAccessError(invoice))) return current;
      const at = new Date().toISOString();
      const next = { ...invoice, status, timeline: [...invoice.timeline, { status, at }], ...(status === "Sudah Bayar" ? { paidAt: at } : status === "Diverifikasi" ? { verifiedAt: at } : status === "Aktif" ? { activatedAt: at } : {}) };
      return { ...current, invoices: current.invoices.map((item) => item.id === id ? next : item), users: status !== "Aktif" ? current.users : current.users.map((item) => item.id !== user.id ? item : { ...item, accesses: [...item.accesses.filter((access) => access.invoiceId !== id), { id: `invoice-access-${id}`, invoiceId: id, program: invoice.program, plan: invoice.plan, start: invoice.start, end: invoice.end, status: "Aktif" as const }] }) };
    });
  }
  return <Context.Provider value={{ ...state, setUsers: setter("users"), setInvoices: setter("invoices"), setAffiliates: setter("affiliates"), setCommissionStates: setter("commissionStates"), advanceInvoice }}>{children}</Context.Provider>;
}
export function useAdminOperations() { const context = useContext(Context); if (!context) throw new Error("useAdminOperations requires AdminOperationalProvider"); return context; }
