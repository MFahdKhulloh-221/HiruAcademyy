"use client";

import Link from "next/link";
import "./checkout.css";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { AdminDialog } from "@/components/admin-primitives";
import { useAuth } from "@/components/auth-provider";
import { PublicPage } from "@/components/public-shell";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { useCommercialOrder } from "@/components/commercial-hooks";
import { commercialWrite, commercialSelection } from "@/lib/commercial-api";
import { invoiceWhatsAppUrl } from "@/lib/admin-whatsapp";
import { writeRegistrationIntent } from "@/lib/registration-intent";

function CheckoutContent() {
  const params = useSearchParams();
  return <CheckoutSelection key={params.toString()} />;
}

function CheckoutSelection() {
  const params = useSearchParams();
  const { authenticated, user } = useAuth();
  const [modal, setModal] = useState<"success" | "error" | null>(null);
  const submitButton = useRef<HTMLButtonElement>(null);
  const closeModal = useCallback(() => { setModal(null); requestAnimationFrame(() => submitButton.current?.focus()); }, []);
  const { level, plan: planKey } = commercialSelection(params);
  const order = useCommercialOrder(level, planKey, true);
  const plan = planKey === "sensei" ? "Belajar dengan Sensei" : "Belajar Mandiri";
  const [referral, setReferral] = useState(params.get("referral") ?? "");
  const [useCredit, setUseCredit] = useState(false);
  const [quote, setQuote] = useState<{ base_price: number; referral_discount: number; credit_discount: number; promo_discount: number; total_price: number; available_credit: number } | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const requestKey = useRef<string | null>(null);
  const [applied, setApplied] = useState(false);
  const [referralBusy, setReferralBusy] = useState(false);
  const quoteKey = `${order.offer?.id}:${applied ? referral.trim() : ""}:${useCredit}`;
  const [quotedKey, setQuotedKey] = useState("");
  const quoteReady = quote !== null && quotedKey === quoteKey;
  const [referralError, setReferralError] = useState("");
  const referralRequest = useRef(0);
  async function applyReferral() {
    if (referralBusy) return;
    const request = ++referralRequest.current;
    setReferralBusy(true); setReferralError(""); setApplied(false);
    try {
      await commercialWrite("/api/student/affiliate/validate", "POST", { code: referral.trim() });
      if (request === referralRequest.current) setApplied(true);
    } catch (cause) { if (request === referralRequest.current) setReferralError(cause instanceof Error ? cause.message : "Kode belum bisa divalidasi."); }
    finally { if (request === referralRequest.current) setReferralBusy(false); }
  }

  useEffect(() => {
    if (!authenticated || !order.offer || order.invoice) return;
    let active = true;
    void commercialWrite<NonNullable<typeof quote>>("/api/student/referral-quote", "POST", { program_offer_id: order.offer.id, use_credit: useCredit, ...(applied ? { referral_code: referral.trim() } : {}) }).then(value => { if (active) { setQuote(value); setQuotedKey(quoteKey); setQuoteError(""); } }).catch(cause => { if (active) { setQuote(null); setQuoteError(cause instanceof Error ? cause.message : "Tagihan belum tersedia."); } });
    return () => { active = false; };
  }, [authenticated, order.offer, order.invoice, applied, referral, useCredit, quoteKey]);

  const referralAttempted = useRef(false);
  useEffect(() => {
    if (!authenticated || referralAttempted.current || !params.get("referral")) return;
    referralAttempted.current = true;
    void applyReferral();
  });

  async function createInvoice() {
    setModal(null);
    const storageKey = `hiru.invoice-request:${user?.id}:${level}:${planKey}:${applied ? referral.trim() : ""}:${useCredit}`;
    try { requestKey.current = sessionStorage.getItem(storageKey) ?? requestKey.current; } catch { /* Storage is optional. */ }
    requestKey.current ??= crypto.randomUUID();
    try { sessionStorage.setItem(storageKey, requestKey.current); } catch { /* Retry key still survives within this page. */ }
    const inv = await order.create(applied ? referral : undefined, useCredit, requestKey.current);
    if (inv) {
      try { sessionStorage.removeItem(storageKey); } catch { /* Storage is optional. */ }
      if (user) writeRegistrationIntent(user.id, `/invoice?${new URLSearchParams({ id: String(inv.id) })}`);
      setModal("success");
    } else setModal("error");
  }

  const programName = order.offer?.program.name ?? "Program belum tersedia";
  const basePrice = order.invoice?.base_price ?? order.offer?.base_price;
  const duration = order.invoice ? order.invoice.duration_months : order.offer?.duration_months;
  const registerQuery = new URLSearchParams({ program: level, plan: planKey });
  if (referral.trim()) registerQuery.set("referral", referral.trim());
  const editQuery = new URLSearchParams(registerQuery);
  editQuery.set("edit", "selection");
  const total = order.invoice?.total_price ?? (quoteReady ? quote?.total_price : undefined);
  const validTotal = typeof total === "number" && Number.isFinite(total) && total >= 0;
  const money = (value: number) => `Rp ${value.toLocaleString("id-ID")}`;

  if (order.loading) return <LoadingSkeleton variant="form" label="Memuat ringkasan..." />;
  return <div className="checkout-layout">
    <div className="checkout-main">
      <h1 className="sr-only">Checkout</h1>
      <section className={`checkout-referral${applied ? " applied" : ""}`} aria-labelledby="referral-heading">
        <h2 id="referral-heading">Kode referral <span>(opsional)</span></h2>
        <p>Teman baru mendapat diskon pembelian LMS pertama yang memenuhi syarat. Pengundang mendapat Kredit Diskon Belajar setelah pembayaran diverifikasi.</p>
        <label htmlFor="checkout-referral-code">Kode Referral</label>
        <div className="checkout-referral-controls"><input id="checkout-referral-code" value={referral} onChange={(event) => { setReferral(event.target.value); setApplied(false); setReferralError(""); requestKey.current = null; }} disabled={!!order.invoice || order.busy || referralBusy} placeholder="Masukkan kode jika ada" /><button className="button button-dark" type="button" disabled={!authenticated || !referral.trim() || !!order.invoice || order.busy || referralBusy} onClick={() => void applyReferral()}>{referralBusy ? "Memeriksa?" : applied ? "Diterapkan" : "Terapkan"}</button></div>
        {applied && <small role="status">Kode referral valid. Server akan memeriksa ulang saat invoice dibuat.</small>}
        {referralError && <p role="alert">{referralError}</p>}{!authenticated && <small>Daftar atau masuk untuk memvalidasi kode referral.</small>}
      </section>
      {authenticated && <section className="checkout-credit" aria-labelledby="credit-heading">
        <div className="checkout-credit-value"><span className="checkout-credit-tag">KUPON KREDIT DISKON</span><h2 id="credit-heading">Kredit Diskon Tersedia</h2><strong>{quote ? money(quote.available_credit) : "Memuat..."}</strong><p id="credit-description">Kredit hanya untuk LMS, upgrade, dan perpanjangan. Sisa kredit tidak hangus.</p></div>
        <div className="checkout-credit-action"><button type="button" className="button button-primary" aria-label="Gunakan Kredit Diskon Saya" aria-pressed={useCredit} aria-describedby="credit-description" disabled={!!order.invoice || order.busy || !quote || (!useCredit && quote.available_credit <= 0)} onClick={() => { setUseCredit(value => !value); requestKey.current = null; }}>{useCredit ? "Batalkan" : "Gunakan"}</button>{useCredit && <small role="status">Kredit dipilih</small>}</div>
        {quoteError && <p className="checkout-credit-error" role="alert">{quoteError}</p>}
      </section>}
      <section className="checkout-before"><h2>Sebelum membuat invoice</h2><ol><li>Pastikan program dan paket pembelajaran yang Anda pilih sudah sesuai.</li><li>Periksa kembali harga dan masa berlaku paket sebelum melanjutkan pembayaran.</li><li>Akses paket pembelajaran akan diaktifkan setelah pembayaran dikonfirmasi oleh Admin HiruAcademy.</li><li>Harap membaca Syarat dan Ketentuan serta <Link href="/kebijakan-privasi" className="underline underline-offset-2">Kebijakan Privasi</Link> sebelum menyelesaikan pembelian.</li></ol></section>
    </div>
    <aside className="checkout-summary" aria-labelledby="checkout-summary-heading">
      <header className="checkout-summary-header"><span aria-hidden="true">&#27880;</span><div><h2 id="checkout-summary-heading">Ringkasan pesanan</h2><p><strong>{programName}</strong><span>{plan}</span></p></div></header>
      {!order.offer && <p role="alert">{order.error || "Program atau paket belum tersedia."} <Link href="/program">Pilih program lain</Link> <button className="button button-secondary" type="button" onClick={order.reload}>Muat ulang penawaran</button></p>}
      <dl><div><dt>Program</dt><dd>{programName}</dd></div><div><dt>Plan</dt><dd>{plan}</dd></div><div><dt>Periode</dt><dd>{duration != null ? `${duration} bulan` : "Belum tersedia"}</dd></div><div><dt>Harga</dt><dd>{basePrice != null ? money(basePrice) : "Belum tersedia"}</dd></div><div><dt>Referral</dt><dd>{applied ? order.invoice ? "Tercatat" : "Kode valid" : "Belum diterapkan"}</dd></div>

        <div><dt>Diskon referral teman baru</dt><dd>{money(order.invoice?.referral_discount ?? quote?.referral_discount ?? 0)}</dd></div>
        <div><dt>Promo lain</dt><dd>{money(order.invoice?.promo_discount ?? quote?.promo_discount ?? 0)}</dd></div>
        <div><dt>Kredit diskon digunakan</dt><dd>{money(order.invoice?.credit_discount ?? quote?.credit_discount ?? 0)}</dd></div>
        <div className="checkout-total"><dt>Total Tagihan</dt><dd aria-live="polite">{validTotal ? money(total) : applied ? "Menunggu perhitungan server" : "Belum tersedia"}</dd></div>
      </dl>
      <p className="checkout-payment-note">Pembayaran diverifikasi Admin, lalu akses diaktifkan. Membuka WhatsApp tidak mengaktifkan akses.</p>
      {authenticated ? <button ref={submitButton} className="button button-primary checkout-submit" disabled={order.busy || referralBusy || !order.offer || (authenticated && !order.invoice && (!quoteReady || !!quoteError))} onClick={() => void createInvoice()}>{order.busy ? "Memproses..." : "Buat Invoice"}</button> : order.offer && <Link className="button button-primary checkout-submit" href={`/register?${registerQuery}`}>Daftar untuk melanjutkan</Link>}
      {authenticated && !order.invoice && !order.busy && <Link className="button button-secondary checkout-submit" href={`/register?${editQuery}`}>Kembali ke Pilihan Belajar</Link>}
    </aside>
    <AdminDialog open={modal !== null} title={modal === "success" ? "Invoice berhasil dibuat" : "Invoice belum selesai diproses"} close={closeModal} actions={<button className="button button-secondary" type="button" onClick={closeModal}>Tutup</button>}>
      {modal === "success" && order.invoice ? <div className="checkout-success">
        <p className="checkout-success-status">Menunggu Pembayaran</p>
        <h3>Invoice #{order.invoice.id}</h3>
        <p>{programName} · {plan}</p>
        <strong className="checkout-success-total">{money(order.invoice.total_price)}</strong>
        <p>Hubungi Admin untuk pembayaran manual. Akun baru tetap Free sampai Admin mengonfirmasi pembayaran. Akses paket yang sudah aktif tetap berlaku.</p>
        <div className="button-group"><a className="button button-primary" href={invoiceWhatsAppUrl(order.invoice, user?.email)} target="_blank" rel="noopener noreferrer">Hubungi Admin via WhatsApp</a><Link className="button button-dark" href="/dashboard">Lanjut ke Dashboard</Link></div>
        <p>Invoice tersimpan di <Link className="text-link" href="/invoice">Profil · Pesanan Saya</Link>.</p>
      </div> : <><p role="alert">{order.error || "Permintaan belum berhasil."}</p><div className="button-group"><button className="button button-primary" type="button" disabled={order.busy} onClick={() => void createInvoice()}>Coba Lagi</button><Link className="text-link" href="/invoice">Periksa Pesanan Saya</Link></div></>}
    </AdminDialog></div>;
}

export default function CheckoutPage() {
  return <PublicPage active="Program"><main className="public-main checkout-page"><Suspense fallback={<LoadingSkeleton variant="form" label="Memuat ringkasan..." />}><CheckoutContent /></Suspense></main></PublicPage>;
}
