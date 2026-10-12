"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { PublicPage } from "@/components/public-shell";
import { useCommercialInvoice } from "@/components/commercial-hooks";
import { invoiceWhatsAppUrl } from "@/lib/admin-whatsapp";

function InvoiceDetail({ id }: { id: string }) {
  const { invoice, error } = useCommercialInvoice(id);
  if (error) return <p role="alert">{error}</p>;
  if (!invoice) return <LoadingSkeleton variant="article" label="Memuat invoice..." />;
  const plan = invoice.plan_code === "sensei" ? "Belajar dengan Sensei" : "Belajar Mandiri";
  const money = (value: number) => `Rp ${value.toLocaleString("id-ID")}`;
  const statuses: Record<string, string> = { draft: "Draft", awaiting_payment: "Menunggu Pembayaran", paid: "Sudah Bayar", verified: "Diverifikasi", active: "Aktif", cancelled: "Dibatalkan" };
  const status = statuses[invoice.status] ?? invoice.status;
  return <>
    <section className="invoice-hero">
      <p className="invoice-kicker">INVOICE BERHASIL DIBUAT</p>
      <span className="invoice-status">{status}</span>
      <h1>Selesaikan verifikasi melalui WhatsApp Admin</h1>
      <p>Detail rekening dan panduan konfirmasi pembayaran akan dikirim oleh Admin melalui WhatsApp.</p>
    </section>
    <div className="invoice-layout">
      <section className="invoice-detail"><h2>Detail Pesanan</h2><dl>
        <div><dt>Invoice ID</dt><dd>{invoice.id}</dd></div>
        <div><dt>Level</dt><dd>{invoice.program_code.toUpperCase()}</dd></div>
        <div><dt>Program</dt><dd>{plan}</dd></div>
        <div><dt>Harga</dt><dd>{money(invoice.base_price)}</dd></div>
        <div><dt>Diskon</dt><dd>{money(invoice.discount_amount)}</dd></div>
        <div><dt>Total</dt><dd>{money(invoice.total_price)}</dd></div>
        <div><dt>Status</dt><dd>{status}</dd></div>
      </dl></section>
      <aside className="invoice-handoff"><div className="invoice-steps">
        {[["1", "Buka WhatsApp", "Gunakan nomor admin dari sistem."], ["2", "Terima instruksi", "Admin mengirim detail pembayaran."], ["3", "Verifikasi", "Membership aktif setelah transaksi diverifikasi."]].map(([number, title, description]) => <article key={number}><strong>{number}</strong><div><h2>{title}</h2><p>{description}</p></div></article>)}
      </div><a className="button button-primary invoice-whatsapp" href={invoiceWhatsAppUrl(invoice)} target="_blank" rel="noopener noreferrer" aria-describedby="whatsapp-notice">Hubungi Admin via WhatsApp</a><p id="whatsapp-notice" className="invoice-backend-notice">Admin kami siap membantu memverifikasi pembayaran dan mengaktifkan akunmu.</p><Link className="button button-dark" href="/program">Kembali ke Program</Link></aside>
    </div>
    <section className="invoice-announcement"><strong>Pengumuman</strong><p>Membership dan reward referral belum aktif sampai transaksi diverifikasi oleh Admin.</p></section>
  </>;
}

function InvoiceContent() {
  const id = useSearchParams().get("id");
  return id && /^\d+$/.test(id) ? <InvoiceDetail id={id} /> : <p role="alert">ID tidak valid.</p>;
}
export default function InvoicePage() {
  return <PublicPage active="Program"><main className="public-main invoice-page"><Suspense fallback={<LoadingSkeleton variant="article" label="Memuat invoice..." />}><InvoiceContent /></Suspense></main></PublicPage>;
}
