"use client";

import { useCallback, useEffect, useState } from "react";
import { commercialData } from "@/lib/commercial-api";
import styles from "./student-affiliate.module.css";

export const affiliateStatus: Record<string, string> = { pending: "Menunggu validasi", verified: "Tervalidasi", available: "Tersedia", reserved: "Sedang digunakan", used: "Digunakan", released: "Dilepaskan", held: "Ditahan", reversed: "Dibatalkan", cancelled: "Dibatalkan" };
export const creditMoney = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
export type CreditPolicy = { enabled: boolean; inviter_reward: number; friend_discount: number; minimum_purchase: number; credit_limit: number | null; expiry_days: number | null; combine_promo: boolean; program_ids: number[] };
export type ReferralCreditData = {
  affiliate: { id: number; code: string; status: string }; policy: CreditPolicy;
  totals: { available: number; pending: number; reserved: number; used: number };
  history: { id: number; invoice_id: number; created_at: string; reward: number; status: string; program: string; payment_status: string }[];
  usage: { invoice_id: number; credit_id: number; amount: number; status: string; created_at: string; reference: string; program: string }[];
};
const date = (value: string) => new Date(value).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" });
export function StudentAffiliateScreen() {
  const [data, setData] = useState<ReferralCreditData | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async () => { try { setError(""); setData(await commercialData<ReferralCreditData>("/api/student/affiliate")); } catch (cause) { setError(cause instanceof Error ? cause.message : "Data belum tersedia."); } }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const code = data?.affiliate.status === "active" && data.policy.enabled ? data.affiliate.code : null;
  const link = code ? `https://hiruacademy.id/register?referral=${encodeURIComponent(code)}` : "";
  async function copy(value: string) { try { await navigator.clipboard.writeText(value); setMessage("Berhasil disalin."); } catch { setMessage("Salin kode atau link secara manual."); } }
  return <div className={styles.page}>
    <header className={styles.hero}><p>Ajak Teman &amp; Hemat Belajar</p><h1>Ajak Teman, Kalian Berdua Hemat!</h1><p>Bagikan kode referralmu. Teman mendapat diskon pembelian pertama, dan kamu mendapatkan kredit untuk belajar selanjutnya.</p></header>
    {error && <p role="alert">{error} <button className="button" onClick={() => void load()}>Coba Lagi</button></p>}{message && <p role="status">{message}</p>}
    {!data && !error && <p role="status">Memuat kredit diskon...</p>}
    {data && <>
      <section className={styles.card}><h2>Kode Referral Saya</h2>{code ? <><code className={styles.code}>{code}</code><p className={styles.link}>{link}</p><div className={styles.actions}><button className="button button-primary" onClick={() => void copy(code)}>Salin Kode</button><button className="button button-secondary" onClick={() => void copy(link)}>Salin Link</button><a className="button button-secondary" href={`https://wa.me/?text=${encodeURIComponent(`Ayo belajar di HiruAcademy: ${link}`)}`} target="_blank" rel="noopener noreferrer">Bagikan WhatsApp</a></div><p>Kamu mendapat {creditMoney(data.policy.inviter_reward)} kredit setelah pembelian pertama teman diverifikasi. Teman mendapat diskon hingga {creditMoney(data.policy.friend_discount)}, sesuai kelayakan program.</p></> : <p>Program atau kode referral sedang tidak aktif.</p>}</section>
      <section aria-label="Kredit Diskon Saya" className={styles.stats}>{([['available', 'Kredit tersedia'], ['pending', 'Menunggu validasi'], ['reserved', 'Sedang digunakan'], ['used', 'Total kredit dipakai']] as const).map(([key, title]) => <div className={styles.card} key={key}><p>{title}</p><strong>{creditMoney(data.totals[key])}</strong></div>)}</section>
      <section className={styles.card}><h2>Riwayat Referral</h2><div className={styles.table}><table><thead><tr><th>Tanggal</th><th>Program</th><th>Status referral</th><th>Kredit</th><th>Validasi</th></tr></thead><tbody>{data.history.map(row => <tr key={row.id}><td>{date(row.created_at)}</td><td>{row.program}</td><td>{affiliateStatus[row.status] ?? row.status}</td><td>{creditMoney(row.reward)}</td><td>{['verified', 'active'].includes(row.payment_status) ? 'Pembayaran terverifikasi' : 'Belum terverifikasi'}</td></tr>)}</tbody></table></div>{!data.history.length && <p>Belum ada riwayat referral.</p>}</section>
      <section className={styles.card}><h2>Riwayat Penggunaan Kredit</h2><p>Sisa kredit tersedia: {creditMoney(data.totals.available)}</p><div className={styles.table}><table><thead><tr><th>Tanggal</th><th>Program LMS</th><th>Potongan</th><th>Invoice</th><th>Status</th></tr></thead><tbody>{data.usage.map(row => <tr key={`${row.invoice_id}-${row.credit_id}`}><td>{date(row.created_at)}</td><td>{row.program}</td><td>{creditMoney(row.amount)}</td><td className={styles.link}>{row.reference}</td><td>{affiliateStatus[row.status] ?? row.status}</td></tr>)}</tbody></table></div>{!data.usage.length && <p>Belum ada penggunaan kredit.</p>}</section>
      <section className={styles.card}><h2>Cara Kerja Referral</h2><ol><li>Bagikan kode kepada teman yang belum membeli LMS.</li><li>Teman menggunakan kode saat membeli program eligible.</li><li>Pembayaran diverifikasi; kredit masuk ke akunmu.</li><li>Pilih Gunakan Kredit Diskon Saya saat checkout pembelian, upgrade level, atau perpanjangan LMS.</li></ol><p>Kredit Diskon Belajar bukan uang, tidak dapat dipindahtangankan, dan hanya berlaku untuk pembelian LMS HiruAcademy. Refund otomatis belum tersedia; hubungi Admin jika transaksi bermasalah.</p></section>
    </>}
  </div>;
}
