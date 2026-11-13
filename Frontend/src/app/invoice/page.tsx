"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { useAuth } from "@/components/auth-provider";
import { StudentNavigation } from "@/components/student-navigation";
import { StudentHeaderActions } from "@/components/student-header-actions";
import { StudentBreadcrumb } from "@/components/student-breadcrumb";
import { useLearningCatalog } from "@/components/learning-hooks";
import { learningMembership } from "@/lib/learning-api";
import styles from "@/components/student-invoices.module.css";
import { useCommercialInvoice } from "@/components/commercial-hooks";
import { StudentInvoices, InvoiceStatus, invoiceDate, invoiceMoney, invoicePlan, invoiceStatuses } from "@/components/student-invoices";
import { invoiceWhatsAppUrl } from "@/lib/admin-whatsapp";

const instructions: Record<string, { title: string; text: string }> = {
  draft: { title: "Lanjutkan pesananmu", text: "Periksa detail pesanan, lalu ajukan invoice untuk melanjutkan pembayaran." },
  awaiting_payment: { title: "Selesaikan pembayaran", text: "Hubungi Admin melalui WhatsApp untuk detail rekening dan panduan pembayaran. Kirim bukti transfer melalui WhatsApp. Admin akan mengonfirmasi pembayaran dan mengaktifkan akses." },
  paid: { title: "Pembayaran menunggu verifikasi", text: "Pernyataan pembayaran sudah diterima. Admin perlu memeriksa pembayaran; akses belum aktif." },
  verified: { title: "Pembayaran sudah diverifikasi", text: "Pembayaran telah diverifikasi Admin. Tunggu aktivasi akses, lalu perbarui status invoice." },
  active: { title: "Pesanan sudah aktif", text: "Akses pesanan telah diaktifkan. Buka dashboard untuk melanjutkan belajar." },
  cancelled: { title: "Pesanan dibatalkan", text: "Invoice ini tidak dapat dilanjutkan. Hubungi Admin jika perlu bantuan atau pilih program untuk pesanan baru." },
};

function InvoiceDetail({ id }: { id: string }) {
  const { user } = useAuth();
  const { invoice, error, busy, refresh, submit } = useCommercialInvoice(id);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  async function refreshInvoice() {
    setRefreshing(true); setRefreshError("");
    try { await refresh(); }
    catch (cause) { setRefreshError(cause instanceof Error ? cause.message : "Permintaan belum berhasil. Silakan coba lagi."); }
    finally { setRefreshing(false); }
  }
  const refreshButton = <button className="button button-dark" type="button" disabled={busy || refreshing} onClick={refreshInvoice}>{refreshing ? "Memuat..." : "Perbarui Status"}</button>;
  if (!invoice) return error || refreshError ? <section className={styles.panel}><p role="alert">{refreshError || error}</p>{refreshButton}</section> : <LoadingSkeleton variant="article" label="Memuat invoice..." />;
  const status = invoiceStatuses[invoice.status] ?? invoice.status;
  const instruction = instructions[invoice.status] ?? { title: "Status pesanan", text: "Perbarui status atau hubungi Admin untuk informasi pesanan." };
  return <>
    <Link className={styles.back} href="/invoice">Pesanan Saya</Link>
    <header className={styles.header}>
      <div className={styles.cardHeader}><p className={styles.kicker}>INVOICE #{invoice.id}</p><InvoiceStatus status={invoice.status} /></div>
      <h1>{instruction.title}</h1><p>{instruction.text}</p>
    </header>
    {(error || refreshError) && <p role="alert">{refreshError || error}</p>}
    <div className={styles.layout}>
      <section className={styles.panel}><h2>Detail Pesanan</h2><dl className={styles.details}>
        <div><dt>Invoice ID</dt><dd>{invoice.id}</dd></div>
        <div><dt>Level</dt><dd>{invoice.program_code.toUpperCase()}</dd></div>
        <div><dt>Program</dt><dd>{invoicePlan(invoice.plan_code)}</dd></div>
        {invoice.duration_months != null && <div><dt>Durasi</dt><dd>{invoice.duration_months} bulan</dd></div>}
        {invoice.due_date && <div><dt>Jatuh Tempo</dt><dd>{invoiceDate(invoice.due_date)}</dd></div>}
        <div><dt>Harga</dt><dd>{invoiceMoney(invoice.base_price)}</dd></div>
        <div><dt>Diskon</dt><dd>{invoiceMoney(invoice.discount_amount)}</dd></div>
        <div><dt>Total</dt><dd>{invoiceMoney(invoice.total_price)}</dd></div>
        <div><dt>Status</dt><dd>{status}</dd></div>
      </dl></section>
      <aside className={`${styles.panel} ${styles.actions}`} aria-label="Tindakan pesanan">
        <h2>Kelola Pesanan</h2>
        {invoice.status === "draft" && <button className="button button-primary" type="button" disabled={busy || refreshing} onClick={submit}>{busy ? "Memproses..." : "Ajukan Invoice"}</button>}
        {invoice.status === "active" && <Link className="button button-primary" href="/dashboard">Mulai Belajar</Link>}
        {refreshButton}
        <a className="button button-primary invoice-whatsapp" href={invoiceWhatsAppUrl(invoice, user?.email)} target="_blank" rel="noopener noreferrer" aria-describedby="whatsapp-notice">Hubungi Admin via WhatsApp</a>
        <p id="whatsapp-notice" className="invoice-backend-notice">Membuka WhatsApp tidak memverifikasi pembayaran atau mengaktifkan akses.</p>
        <Link className="button button-dark" href="/program">Kembali ke Program</Link>
      </aside>
    </div>
  </>;
}

function InvoiceContent() {
  const id = useSearchParams().get("id");
  if (id === null) return <StudentInvoices />;
  return /^\d+$/.test(id) ? <InvoiceDetail key={id} id={id} /> : <><p role="alert">ID tidak valid.</p><Link className="button button-dark" href="/invoice">Pesanan Saya</Link></>;
}
export default function InvoicePage() {
  const catalog = useLearningCatalog();
  const membership = catalog.data ? learningMembership(catalog.data.access) : "free";
  return <div className="supporting-shell student-shell"><StudentNavigation membership={membership} /><main className="supporting-main">
    <StudentHeaderActions membership={membership} />
    <div className={styles.content}><StudentBreadcrumb items={[{ label: "Profil", href: "/profile" }, { label: "Pesanan Saya" }]} />
      <Suspense fallback={<LoadingSkeleton variant="article" label="Memuat invoice..." />}><InvoiceContent /></Suspense>
    </div>
  </main></div>;
}
