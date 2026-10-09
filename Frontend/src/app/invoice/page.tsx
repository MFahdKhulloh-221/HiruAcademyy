"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { PublicPage } from "@/components/public-shell";
import { useBusinessStore, getInvoiceWhatsAppUrl } from "@/lib/business-store";
import { useAdminSettings } from "@/lib/admin-settings-store";

function InvoiceContent() {
  const params = useSearchParams();
  const store = useBusinessStore();
  const settings = useAdminSettings();
  const idParam = params.get("id");
  const invoice = idParam ? store.invoices.find((inv) => inv.id === idParam) : undefined;

  const levelParam = params.get("level");
  const level = invoice?.programCode || (["n1", "n2", "n3", "n4", "n5"].includes(levelParam || "") ? levelParam!.toUpperCase() : "N4");
  const planKey = invoice?.plan || (params.get("plan") === "sensei" ? "sensei" : "lms");
  const plan = planKey === "sensei" ? "Belajar dengan Sensei" : "Belajar Mandiri";
  const referral = invoice?.referralCode ? `Kode ${invoice.referralCode} • diskon diterapkan` : params.get("referral") === "applied" ? "Kode valid • diskon diterapkan" : "Belum diterapkan";
  const invoiceId = invoice?.id || "Dibuat otomatis oleh sistem";
  const amountFormatted = invoice ? `Rp ${invoice.amount.toLocaleString("id-ID")}` : "Sesuai program";
  const statusDisplay = invoice?.status || "Menunggu verifikasi";

  const phone = settings.contact.whatsappNumber.replace(/\D/g, "").replace(/^0/, "62");
  const waUrl = invoice ? getInvoiceWhatsAppUrl(invoice, store.settings) : `https://wa.me/${phone}?text=${encodeURIComponent(`Halo Admin HIRU Academy, saya ingin konfirmasi pembayaran invoice ${level} ${plan}.`)}`;

  return (
    <>
      <section className="invoice-hero">
        <p className="invoice-kicker">INVOICE BERHASIL DIBUAT</p>
        <span className="invoice-status">{statusDisplay}</span>
        <h1>Selesaikan verifikasi melalui WhatsApp Admin</h1>
        <p>Detail rekening dan panduan konfirmasi pembayaran akan dikirim oleh Admin melalui WhatsApp.</p>
      </section>

      <div className="invoice-layout">
        <section className="invoice-detail">
          <h2>Detail Pesanan</h2>
          <dl>
            <div><dt>Invoice ID</dt><dd>{invoiceId}</dd></div>
            <div><dt>Level</dt><dd>{level}</dd></div>
            <div><dt>Program</dt><dd>{plan}</dd></div>
            <div><dt>Harga</dt><dd>{amountFormatted}</dd></div>
            <div><dt>Referral</dt><dd>{referral}</dd></div>
            <div><dt>Total</dt><dd>{amountFormatted}</dd></div>
            <div><dt>Status</dt><dd>{statusDisplay}</dd></div>
          </dl>
        </section>

        <aside className="invoice-handoff">
          <div className="invoice-steps">
            {[
              ["1", "Buka WhatsApp", "Gunakan nomor admin dari sistem."],
              ["2", "Terima instruksi", "Admin mengirim detail pembayaran."],
              ["3", "Verifikasi", "Membership aktif setelah transaksi diverifikasi."],
            ].map(([number, title, description]) => (
              <article key={number}>
                <strong>{number}</strong>
                <div>
                  <h2>{title}</h2>
                  <p>{description}</p>
                </div>
              </article>
            ))}
          </div>
          <a
            className="button button-primary invoice-whatsapp"
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-describedby="whatsapp-notice"
          >
            Buka WhatsApp Admin
          </a>
          <p id="whatsapp-notice" className="invoice-backend-notice">
            Admin kami siap membantu memverifikasi pembayaran dan mengaktifkan akunmu.
          </p>
          <Link className="button button-dark" href="/program">
            Kembali ke Program
          </Link>
        </aside>
      </div>

      <section className="invoice-announcement">
        <strong>Pengumuman</strong>
        <p>Membership dan reward referral belum aktif sampai transaksi diverifikasi oleh Admin.</p>
      </section>
    </>
  );
}

export default function InvoicePage() {
  return (
    <PublicPage active="Program">
      <main className="public-main invoice-page">
        <Suspense fallback={<LoadingSkeleton variant="article" label="Memuat invoice..." />}>
          <InvoiceContent />
        </Suspense>
      </main>
    </PublicPage>
  );
}
