"use client";

import Link from "next/link";
import "./checkout.css";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { AdminDialog } from "@/components/admin-primitives";
import { useAuth } from "@/components/auth-provider";
import { invoiceWhatsAppUrl } from "@/lib/admin-whatsapp";
import { PublicPage } from "@/components/public-shell";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { useCommercialOrder } from "@/components/commercial-hooks";
import { commercialData, commercialSelection, type EffectiveAccess } from "@/lib/commercial-api";

function CheckoutContent() {
  const params = useSearchParams();
  const { authenticated, user } = useAuth();
  const [access, setAccess] = useState<{ userId: number | string; paid: boolean } | null>(null);
  useEffect(() => {
    if (!user || user.role !== "student") return;
    let active = true;
    void commercialData<EffectiveAccess>("/api/student/access").then(data => {
      if (active) setAccess({ userId: user.id, paid: data.source_grants.length > 0 });
    }).catch(() => undefined);
    return () => { active = false; };
  }, [user]);
  const [modal, setModal] = useState<"success" | "error" | null>(null);
  const submitButton = useRef<HTMLButtonElement>(null);
  const closeModal = useCallback(() => { setModal(null); requestAnimationFrame(() => submitButton.current?.focus()); }, []);
  const { level, plan: planKey } = commercialSelection(params);
  const order = useCommercialOrder(level, planKey);
  const plan = planKey === "sensei" ? "Belajar dengan Sensei" : "Belajar Mandiri";
  const [referral, setReferral] = useState("");
  const [applied, setApplied] = useState(false);

  async function createInvoice() {
    setModal(null);
    const inv = await order.create(applied ? referral : undefined);
    setModal(inv ? "success" : "error");
  }

  if (order.loading) return <LoadingSkeleton variant="form" label="Memuat ringkasan..." />;
  return <div className="checkout-layout"><div className="checkout-main"><nav className="checkout-breadcrumb" aria-label="Breadcrumb"><Link href="/program">Program &amp; Level</Link><span>→</span><b>Order Summary</b></nav><header className="checkout-heading"><h1>Periksa pilihan sebelum membuat invoice</h1><p>Harga, periode, benefit, dan entitlement berasal dari konfigurasi admin setelah level dan plan dipilih.</p></header><section className={`checkout-referral${applied ? " applied" : ""}`}><h2>{applied ? "Kode referral diterapkan" : "Kode referral untuk diskon (opsional)"}</h2><p>{applied ? "Kode valid memberi diskon pada pembelian ini. Pemilik kode menerima reward setelah invoice diverifikasi." : "Pengguna baru mendapat diskon. Reward pemilik kode aktif setelah pembayaran diverifikasi Admin."}</p><label>Kode Referral<div><input value={referral} onChange={(event) => setReferral(event.target.value)} placeholder="Masukkan kode jika ada" /><button className="button button-dark" type="button" disabled={!referral.trim()} onClick={() => setApplied(true)}>{applied ? "Diterapkan" : "Terapkan"}</button></div></label>{applied && <small>Menunggu validasi server</small>}</section><section className="checkout-before"><p className="kicker">SEBELUM MEMBUAT INVOICE</p><ol><li>Pastikan level JLPT dan paket pembelajaran yang Anda pilih sudah sesuai.</li><li>Periksa kembali harga dan masa berlaku paket sebelum melanjutkan pembayaran.</li><li>Akses paket pembelajaran akan diaktifkan setelah pembayaran dikonfirmasi oleh Admin HiruAcademy.</li><li>Harap membaca Syarat dan Ketentuan serta Kebijakan Privasi sebelum menyelesaikan pembelian.</li></ol></section></div><aside className="checkout-summary"><div className="checkout-illustration" aria-hidden="true"><strong>請</strong><span>注文</span></div><h2>Ringkasan pesanan</h2>{order.error && !modal && !order.offer && <p role="alert">{order.error}</p>}<dl><div><dt>Program</dt><dd>JLPT {level}</dd></div><div><dt>Plan</dt><dd>{plan}</dd></div><div><dt>Periode</dt><dd>{order.offer ? `${order.offer.duration_months} bulan` : "Belum tersedia"}</dd></div><div><dt>Harga</dt><dd>{order.offer?.base_price != null ? `Rp ${order.offer.base_price.toLocaleString("id-ID")}` : "Belum tersedia"}</dd></div><div><dt>Referral</dt><dd>{applied ? "Menunggu validasi server" : "Belum diterapkan"}</dd></div><div className="checkout-total"><dt>TOTAL</dt><dd>Konfirmasi via WhatsApp</dd></div></dl>{applied && <small>Detail pembayaran via WhatsApp Admin</small>}<button ref={submitButton} className="button button-primary checkout-submit" disabled={order.busy || !order.offer} onClick={() => void createInvoice()}>{order.busy ? "Memproses…" : "Buat Invoice"}</button><div className="checkout-announcement"><strong>Pengumuman</strong><p>{applied ? "Reward pemilik kode aktif setelah pembayaran invoice ini diverifikasi Admin." : "Invoice dibuat sebagai pencatatan backend, lalu pembayaran dilanjutkan melalui WhatsApp Admin."}</p></div></aside><AdminDialog open={modal !== null} title={modal === "success" ? "INVOICE BERHASIL DIBUAT" : "Invoice gagal dibuat"} close={closeModal} actions={<><button className="button button-secondary" type="button" onClick={closeModal}>Tutup</button>{modal === "error" && <button className="button button-primary" type="button" disabled={order.busy} onClick={() => void createInvoice()}>Coba Lagi</button>}</>}>
      {modal === "success" && order.invoice ? <><span className="invoice-success-icon" aria-hidden="true">✓</span><p>Invoice Anda berhasil dibuat. Silakan hubungi Admin HiruAcademy melalui WhatsApp untuk melakukan konfirmasi pembayaran.</p><dl><div><dt>Nomor Invoice</dt><dd>{order.invoice.id}</dd></div><div><dt>Level</dt><dd>{order.invoice.program_code.toUpperCase()}</dd></div><div><dt>Program</dt><dd>{order.invoice.plan_code === "sensei" ? "Belajar dengan Sensei" : "Belajar Mandiri"}</dd></div></dl><p>{user && access?.userId === user.id && !access.paid ? "Akses akun Anda tetap sebagai Free Member hingga pembayaran dikonfirmasi oleh Admin." : "Akses paket yang dipesan akan diaktifkan setelah pembayaran dikonfirmasi oleh Admin. Akses paket lain yang sudah aktif tetap berlaku."}</p><div className="button-group"><a className="button button-primary" href={invoiceWhatsAppUrl(order.invoice)} target="_blank" rel="noopener noreferrer">Hubungi Admin via WhatsApp</a><Link className="button button-dark" href={authenticated ? "/dashboard" : "/login"}>{authenticated ? "Masuk Dashboard" : "Lanjut Login"}</Link><Link className="button button-secondary" href={`/invoice?id=${order.invoice.id}`}>Detail Pesanan</Link></div></> : <p role="alert">{order.error || "Permintaan belum berhasil."}</p>}
    </AdminDialog></div>;
}

export default function CheckoutPage() {
  return <PublicPage active="Program"><main className="public-main checkout-page"><Suspense fallback={<LoadingSkeleton variant="form" label="Memuat ringkasan..." />}><CheckoutContent /></Suspense></main></PublicPage>;
}
