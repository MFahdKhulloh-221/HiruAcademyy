"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { PublicPage } from "@/components/public-shell";
import { useCommercialOrder } from "@/components/commercial-hooks";
import { commercialSelection } from "@/lib/commercial-api";

function CheckoutContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { level, plan: planKey } = commercialSelection(params);
  const order = useCommercialOrder(level, planKey);
  const plan = planKey === "sensei" ? "Belajar dengan Sensei" : "Belajar Mandiri";
  const [referral, setReferral] = useState("");
  const [applied, setApplied] = useState(false);

  async function createInvoice() {
    const inv = await order.create(applied ? referral : undefined);
    if (inv) router.push(`/invoice?id=${inv.id}`);
  }

  return <div className="checkout-layout"><div className="checkout-main"><nav className="checkout-breadcrumb" aria-label="Breadcrumb"><Link href="/program">Program &amp; Level</Link><span>→</span><b>Order Summary</b></nav><header className="checkout-heading"><h1>Periksa pilihan sebelum membuat invoice</h1><p>Harga, periode, benefit, dan entitlement berasal dari konfigurasi admin setelah level dan plan dipilih.</p></header><section className={`checkout-referral${applied ? " applied" : ""}`}><h2>{applied ? "Kode referral diterapkan" : "Kode referral untuk diskon (opsional)"}</h2><p>{applied ? "Kode valid memberi diskon pada pembelian ini. Pemilik kode menerima reward setelah invoice diverifikasi." : "Pengguna baru mendapat diskon. Reward pemilik kode aktif setelah pembayaran diverifikasi Admin."}</p><label>Kode Referral<div><input value={referral} onChange={(event) => setReferral(event.target.value)} placeholder="Masukkan kode jika ada" /><button className="button button-dark" type="button" disabled={!referral.trim()} onClick={() => setApplied(true)}>{applied ? "Diterapkan" : "Terapkan"}</button></div></label>{applied && <small>Menunggu validasi server</small>}</section><section className="checkout-before"><p className="kicker">SEBELUM MEMBUAT INVOICE</p><ul><li>Pilihan level dan plan sudah benar</li><li>Harga dan periode mengikuti konfigurasi aktif</li><li>Membership aktif setelah invoice diverifikasi admin</li><li>Ketentuan pembelian dan privacy telah dibaca</li></ul></section></div><aside className="checkout-summary"><div className="checkout-illustration" aria-hidden="true"><strong>請</strong><span>注文</span></div><h2>Ringkasan pesanan</h2>{order.error && <p role="alert">{order.error}</p>}<dl><div><dt>Program</dt><dd>JLPT {level}</dd></div><div><dt>Plan</dt><dd>{plan}</dd></div><div><dt>Periode</dt><dd>{order.offer ? `${order.offer.duration_months} bulan` : "Belum tersedia"}</dd></div><div><dt>Harga</dt><dd>{order.offer?.base_price != null ? `Rp ${order.offer.base_price.toLocaleString("id-ID")}` : "Belum tersedia"}</dd></div><div><dt>Referral</dt><dd>{applied ? "Menunggu validasi server" : "Belum diterapkan"}</dd></div><div className="checkout-total"><dt>TOTAL</dt><dd>Konfirmasi via WhatsApp</dd></div></dl>{applied && <small>Detail pembayaran via WhatsApp Admin</small>}<button className="button button-primary checkout-submit" disabled={order.busy || !order.offer} onClick={() => void createInvoice()}>{applied ? "Buat Invoice" : "Buat Invoice & Buka WhatsApp"}</button><div className="checkout-announcement"><strong>Pengumuman</strong><p>{applied ? "Reward pemilik kode aktif setelah pembayaran invoice ini diverifikasi Admin." : "Invoice dibuat sebagai pencatatan backend, lalu pembayaran dilanjutkan melalui WhatsApp Admin."}</p></div></aside></div>;
}

export default function CheckoutPage() {
  return <PublicPage active="Program"><main className="public-main checkout-page"><Suspense fallback={<p className="checkout-loading">Memuat ringkasan...</p>}><CheckoutContent /></Suspense></main></PublicPage>;
}
