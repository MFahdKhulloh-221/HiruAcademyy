"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { LuSparkles } from "react-icons/lu";
import { useAuth } from "@/components/auth-provider";
import { PublicPage } from "@/components/public-shell";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { ProgramPriceDisplay } from "@/components/program-price-display";
import { ProgramPriceCardContent } from "@/components/program-price-card-content";
import { levelCatalog, plans, programFacilities } from "@/lib/public-mock";
import { commercialCode } from "@/lib/commercial-api";
import { useContent, type PublicOffer, type PublicProgram } from "@/lib/public-content-api";

export function PublicProgramCatalog({ program: detailProgram }: { program?: string }) {
  const programs = useContent<PublicProgram>("/api/public/programs");
  const pricing = useContent<PublicOffer>("/api/public/offers");
  const { authenticated, loading: authLoading } = useAuth();
  const search = useSearchParams();
  const [chosenProgram, setChosenProgram] = useState<string | null>(null);
  const [chosenPlan, setChosenPlan] = useState<string | null>(null);
  const requestedProgram = detailProgram ?? chosenProgram ?? search.get("program") ?? search.get("level");
  const selected = requestedProgram !== null && requestedProgram !== undefined
    ? programs.data.find(item => [item.code, item.slug].some(value => commercialCode(value) === commercialCode(requestedProgram)))
    : programs.data[0];
  const enrichment = selected?.family === "jlpt" ? levelCatalog.find(item => item.code.toLowerCase() === selected.code.toLowerCase()) : undefined;
  const availableOffers = selected ? pricing.data.filter(offer => offer.program.code.toLowerCase() === selected.code.toLowerCase()) : [];
  const requestedPlan = chosenPlan ?? search.get("plan");
  const selectedOffer = requestedPlan ? availableOffers.find(offer => offer.plan_code === requestedPlan) : availableOffers.find(offer => offer.plan_code === "lms") ?? availableOffers[0];
  const unavailable = !programs.loading && !programs.error && requestedProgram != null && !selected;
  const ready = !programs.loading && !programs.error && !pricing.loading && !pricing.error;

  function checkoutHref(offer: PublicOffer) {
    const query = new URLSearchParams({ program: offer.program.code, plan: offer.plan_code });
    return `${authenticated ? "/checkout" : "/register"}?${query}`;
  }

  return <PublicPage active="Program"><main className={`public-main ${detailProgram ? "program-detail-page" : "program-page"}`}>
    {programs.loading && <LoadingSkeleton variant="cards" label="Memuat program…" />}
    {programs.error && <div role="alert">{programs.error} <button type="button" onClick={programs.reload}>Coba lagi</button></div>}
    {unavailable && <section className="public-section"><h1>Program tidak tersedia</h1><p role="status">Program {requestedProgram} belum tersedia atau sedang nonaktif.</p><Link className="button button-secondary" href="/program">Lihat program aktif</Link></section>}
    {!programs.loading && !programs.error && !programs.data.length && <p role="status">Belum ada program tersedia.</p>}

    {selected && !programs.loading && !programs.error && <>
      {detailProgram && <section className="program-detail-hero"><div className="program-detail-copy">
        <p className="kicker">PROGRAM • {selected.family.toUpperCase()}</p><h1>{selected.name}</h1><p>{selected.description}</p>
        {enrichment && <div className="program-detail-pills"><span>{enrichment.title}</span>{enrichment.topics.map(topic => <span key={topic}>{topic}</span>)}</div>}
        <div className="result-actions"><Link className="button button-secondary" href="/program">Semua program</Link>{enrichment && <Link className="button button-dark" href="/placement">Coba Placement</Link>}</div>
      </div></section>}

      {!detailProgram && <section className="public-section level-section">
        <div className="public-section-head level-section-head"><div className="program-section-title"><div>
          <h1>Pilih program belajarmu</h1><p>Sesuaikan dengan kemampuan dan target belajarmu.</p>
          <p className="level-placement-helper">Belum yakin dengan level JLPT? <Link href="/placement">Cek level gratis</Link></p>
        </div></div></div>
        <div className="public-levels">{programs.data.map(item => {
          const level = item.family === "jlpt" ? levelCatalog.find(level => level.code.toLowerCase() === item.code.toLowerCase()) : undefined;
          return <article className={`public-level${selected.code === item.code ? " selected" : ""}`} key={item.code}>
            <div className="public-level-top"><strong>{item.name}</strong></div>
            {level && <h3>{level.title}</h3>}<p>{item.description}</p>
            {level && <ul>{level.topics.map(topic => <li key={topic}>{topic}</li>)}</ul>}
            <button type="button" className="button button-secondary" aria-pressed={selected.code === item.code} onClick={() => setChosenProgram(item.code)}>Pilih {item.name}</button>
            <Link className="button button-secondary" href={`/program/${encodeURIComponent(item.slug)}`}>Detail {item.name}</Link>
          </article>;
        })}</div>
      </section>}

      <section className="public-section program-pricing-section">
        <div className="public-section-head program-section-title"><div><h2>Pilih metode belajar — {selected.name}</h2><p>{detailProgram ? "Sesuaikan dengan waktu dan kebutuhan bimbinganmu." : selected.description}</p></div></div>
        {pricing.loading && <LoadingSkeleton variant="cards" label="Memuat harga…" />}
        {pricing.error && <div role="alert">{pricing.error} <button type="button" onClick={pricing.reload}>Coba lagi</button></div>}
        {ready && !availableOffers.length && <p role="status">Belum ada paket tersedia untuk program ini.</p>}
        {ready && <div className="pricing-grid">{availableOffers.map(offer => {
          const plan = plans.find(item => item.id === offer.plan_code);
          const title = plan?.title ?? offer.plan_code;
          const isSelected = selectedOffer?.plan_code === offer.plan_code;
          return <article key={offer.plan_code} className={`pricing-card${offer.plan_code === "sensei" ? " pricing-card-popular" : ""}${isSelected ? " selected-pricing-card" : ""}`}>
            {plan && <span className="pricing-badge-pill">{plan.badge}</span>}
            <ProgramPriceCardContent title={title} description={plan?.description ?? selected.name} price={offer.effective_price} normalPrice={offer.base_price} discountPercent={offer.discount_percent} months={offer.duration_months} />
            {offer.promotion && (offer.promotion.starts_at || offer.promotion.ends_at) && <p>Periode promo: {offer.promotion.starts_at ?? "Tanpa tanggal mulai"} sampai {offer.promotion.ends_at ?? "Tanpa tanggal akhir"}</p>}
            {enrichment && plan && <ul className="pricing-features" aria-label={`Fitur paket ${title}`}>{plan.points.map(point => <li key={point}><span className="feature-check" aria-hidden="true">✓</span><span>{point}</span></li>)}</ul>}
            <div className="pricing-card-footer"><button type="button" className={`button ${isSelected ? "button-primary" : "button-secondary"} pricing-cta-btn`} aria-pressed={isSelected} onClick={() => setChosenPlan(offer.plan_code)}>Pilih {title}</button></div>
          </article>;
        })}</div>}
      </section>

      {ready && <aside className="program-summary-card" aria-label="Ringkasan pilihan program dan paket"><div className="summary-card-inner">
        <div className="summary-header"><div className="summary-icon-box" aria-hidden="true"><LuSparkles /></div><div className="summary-header-copy"><div className="summary-tag">RINGKASAN PILIHAN</div><h2>{selected.name} • {selectedOffer ? plans.find(plan => plan.id === selectedOffer.plan_code)?.title ?? selectedOffer.plan_code : "Paket belum tersedia"}</h2><p>{selected.description}</p></div></div>
        {selectedOffer && <div className="summary-meta-grid">
          <div className="summary-meta-card price-highlight"><span className="meta-label">BIAYA INVESTASI</span><ProgramPriceDisplay price={selectedOffer.effective_price} normalPrice={selectedOffer.base_price} discountPercent={selectedOffer.discount_percent} months={selectedOffer.duration_months} /></div>
          <div className="summary-meta-card period-highlight"><span className="meta-label">DURASI &amp; AKSES</span><strong className="meta-value">{selectedOffer.duration_months} bulan</strong>{selectedOffer.promotion && (selectedOffer.promotion.starts_at || selectedOffer.promotion.ends_at) && <small className="meta-note">Periode promo: {selectedOffer.promotion.starts_at ?? "Tanpa tanggal mulai"} sampai {selectedOffer.promotion.ends_at ?? "Tanpa tanggal akhir"}</small>}</div>
          <div className="summary-meta-card level-highlight"><span className="meta-label">PROGRAM TERPILIH</span><strong className="meta-value">{selected.name}</strong><small className="meta-note">{enrichment?.title ?? selected.family.toUpperCase()}</small></div>
        </div>}
        <div className="summary-action-box" style={{ display: "flex", justifyContent: "center", margin: "20px auto 0" }}>
          {selectedOffer && !authLoading ? <Link className="button button-primary summary-cta" href={checkoutHref(selectedOffer)}>{authenticated ? "Lanjutkan ke Checkout" : "Lanjutkan Pendaftaran"}</Link> : <button type="button" className="button button-secondary summary-cta" disabled>{authLoading ? "Memuat akun…" : "Paket belum tersedia"}</button>}
        </div>
      </div></aside>}

      {detailProgram && enrichment && <section className="public-section facilities-section"><div className="public-section-head"><h2>Fasilitas belajar lengkap</h2><p>Setiap chapter menggabungkan pemahaman materi, latihan aktif, dan evaluasi.</p></div><div className="facility-grid">{programFacilities.map((facility, index) => <article className={index > 3 ? "facility-card wide" : "facility-card"} key={facility.title}><span aria-hidden="true">{facility.icon}</span><div><h3>{facility.title}</h3><p>{facility.description}</p></div></article>)}</div></section>}
    </>}
  </main></PublicPage>;
}
