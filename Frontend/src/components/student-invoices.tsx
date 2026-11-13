"use client";

import Link from "next/link";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { useLearningRequest } from "@/components/learning-hooks";
import { commercialData, type CommercialInvoice } from "@/lib/commercial-api";
import { LuCheck, LuReceipt } from "react-icons/lu";
import styles from "./student-invoices.module.css";

export const invoiceStatuses: Record<string, string> = { draft: "Draft", awaiting_payment: "Menunggu Pembayaran", paid: "Menunggu Verifikasi", verified: "Diverifikasi", active: "Sudah Bayar", cancelled: "Dibatalkan" };
export const invoiceMoney = (value: number) => `Rp ${value.toLocaleString("id-ID")}`;
export const invoicePlan = (plan: string) => plan === "sensei" ? "Belajar dengan Sensei" : "Belajar Mandiri";
export const invoiceDate = (value: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" }).format(new Date(value));

async function loadInvoices(signal: AbortSignal) {
  const invoices = await commercialData<CommercialInvoice[]>("/api/student/invoices", signal);
  if (invoices.every(invoice => invoice.program_code?.trim())) return invoices;
  const programs = await commercialData<{ id: number; code: string }[]>("/api/public/programs", signal);
  return invoices.map(invoice => ({ ...invoice, program_code: invoice.program_code?.trim() || programs.find(program => program.id === invoice.program_id)?.code || "" }));
}

export function InvoiceStatus({ status }: { status: string }) {
  return <span className={`${styles.status} ${status === "active" ? styles.active : ""}`}>
    {status === "active" && <><LuCheck aria-hidden="true" /><span className="sr-only">Selesai: </span></>}
    <span>{invoiceStatuses[status] ?? status}</span>
  </span>;
}

export function StudentInvoices() {
  const { data: invoices, error, loading, retry } = useLearningRequest(loadInvoices, "student-invoices");
  return <>
    <header className={styles.header}><p className={styles.kicker}>RIWAYAT PESANAN</p><h1>Pesanan Saya</h1><p>Pantau pembayaran dan akses detail pesanan belajarmu.</p></header>
    {loading ? <LoadingSkeleton variant="article" label="Memuat pesanan..." /> : error ? <section className={styles.panel}><p role="alert">{error}</p><button className="button button-dark" type="button" onClick={retry}>Coba Lagi</button></section> : <>
      <div className={styles.toolbar}><h2>Riwayat Pesanan <span>({invoices?.length ?? 0})</span></h2><button className="button button-dark" type="button" onClick={retry}>Perbarui Pesanan</button></div>
      {!invoices?.length ? <section className={styles.empty}><span className={styles.emptyIcon}><LuReceipt aria-hidden="true" /></span><h2>Belum ada pesanan</h2><p>Pesanan yang kamu buat akan muncul di sini.<br />Temukan program untuk mulai perjalanan belajarmu.</p><Link className="button button-primary" href="/program">Lihat Program</Link></section> : <div className={styles.list}>{invoices.map(invoice => <article className={styles.card} key={invoice.id}>
        <div className={styles.cardHeader}><h2>Invoice #{invoice.id}</h2><InvoiceStatus status={invoice.status} /></div><dl className={styles.facts}>
          <div><dt>Program</dt><dd>{invoicePlan(invoice.plan_code)} · {invoice.program_code ? invoice.program_code.toUpperCase() : "Program tidak tersedia"}</dd></div>
          <div><dt>Tanggal Pesanan</dt><dd>{invoiceDate(invoice.created_at)}</dd></div>
          <div><dt>Durasi</dt><dd>{invoice.duration_months != null ? `${invoice.duration_months} bulan` : "—"}</dd></div>
          <div><dt>Total Pembayaran</dt><dd>{invoiceMoney(invoice.total_price)}</dd></div>
        </dl><div className={styles.cardFooter}><Link className="button button-dark" href={`/invoice?id=${invoice.id}`}>Lihat Invoice #{invoice.id}</Link></div>
      </article>)}</div>}
    </>}
  </>;
}
