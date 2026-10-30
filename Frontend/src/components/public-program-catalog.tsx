"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { LuCheck, LuCompass, LuGraduationCap } from "react-icons/lu";
import "./public-program-catalog.css";
import { useAuth } from "@/components/auth-provider";
import { PublicPage } from "@/components/public-shell";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { ProgramPriceDisplay } from "@/components/program-price-display";
import { LandingPriceCard } from "@/components/landing-price-card";
import { landingOffers } from "@/lib/landing-offers";
import { levelCatalog, plans } from "@/lib/public-mock";
import { commercialCode } from "@/lib/commercial-api";
import { useContent, type PublicOffer, type PublicProgram } from "@/lib/public-content-api";

export function PublicProgramCatalog({ program: detailProgram }: { program?: string }) {
  const programs = useContent<PublicProgram>("/api/public/programs");
  const pricing = useContent<PublicOffer>("/api/public/offers");
  const catalogPrograms = programs.data.filter(item => item.family === "jlpt" && levelCatalog.some(level => level.code.toLowerCase() === item.code.toLowerCase())).sort((a, b) => {
    const rank = (item: PublicProgram) => item.family === "jlpt" ? levelCatalog.findIndex(level => level.code.toLowerCase() === item.code.toLowerCase()) : levelCatalog.length;
    return rank(a) - rank(b);
  });
  const { authenticated, loading: authLoading } = useAuth();
  const search = useSearchParams();
  const [chosenProgram, setChosenProgram] = useState<string | null>(null);
  const [chosenPlan, setChosenPlan] = useState<string | null>(null);
  const requestedProgram = chosenProgram ?? detailProgram ?? search.get("program") ?? search.get("level");
  const selected = requestedProgram !== null && requestedProgram !== undefined
    ? catalogPrograms.find(item => [item.code, item.slug].some(value => commercialCode(value) === commercialCode(requestedProgram)))
    : catalogPrograms[0];
  const availableOffers = selected ? pricing.data.filter(offer => offer.program.code.toLowerCase() === selected.code.toLowerCase()) : [];
  const requestedPlan = chosenPlan ?? search.get("plan");
  const selectedOffer = requestedPlan === "free" && selected
    ? { program: selected, plan_code: "free", base_price: 0, effective_price: 0, currency: "IDR", duration_months: 0, discount_percent: 0 }
    : requestedPlan ? availableOffers.find(offer => offer.plan_code === requestedPlan) : availableOffers.find(offer => offer.plan_code === "lms") ?? availableOffers[0];
  const unavailable = !programs.loading && !programs.error && requestedProgram != null && !selected;
  const ready = !programs.loading && !programs.error && !pricing.loading && !pricing.error;

  function checkoutHref(offer: PublicOffer) {
    const query = new URLSearchParams({ program: offer.program.code, plan: offer.plan_code });
    if (offer.plan_code === "free") return authenticated ? "/dashboard" : `/register?${query}`;
    return `${authenticated ? "/checkout" : "/register"}?${query}`;
  }

  return <PublicPage active="Program"><main className="public-main program-page program-journey">
    {programs.loading && <LoadingSkeleton variant="cards" label="Memuat program…" />}
    {programs.error && <div role="alert">{programs.error} <button type="button" onClick={programs.reload}>Coba lagi</button></div>}
    {unavailable && <section className="public-section"><h1>Program tidak tersedia</h1><p role="status">Program {requestedProgram} belum tersedia atau sedang nonaktif.</p><Link className="button button-secondary" href="/program">Lihat program aktif</Link></section>}
    {!programs.loading && !programs.error && !catalogPrograms.length && <p role="status">Belum ada program tersedia.</p>}

    {selected && !programs.loading && !programs.error && <>
      <section className="public-section level-section">
        <div className="journey-section-heading">
          <h1>Mulai perjalanan bahasa Jepangmu</h1>
          <p>Pilih satu level, lalu tentukan metode belajar yang paling sesuai.</p>
        </div>
        <div className="public-levels">{catalogPrograms.map(item => {
          const level = item.family === "jlpt" ? levelCatalog.find(level => level.code.toLowerCase() === item.code.toLowerCase()) : undefined;
          return <article className={`public-level${item.family !== "jlpt" ? " journey-other-program" : ""}${selected.code === item.code ? " selected" : ""}`} key={item.code}>
            <button type="button" className="journey-card-select" aria-label={`Pilih kartu ${item.name}`} aria-pressed={selected.code === item.code} onClick={() => { setChosenProgram(item.code); setChosenPlan(""); }} />
            <div className="journey-card-label">{selected.code === item.code && <span className="journey-selected"><LuCheck aria-hidden="true" /> Dipilih</span>}</div>
            <h2 className={level ? "journey-level-title" : undefined}>{level ? <><span>{level.code}</span><span className="journey-level-japanese" lang="ja">日本語能力試験</span></> : item.name}</h2>
            {level && <h3>{level.title}</h3>}<p>{item.description}</p>
            {level && <ul className="pricing-features">{level.topics.slice(0, 2).map(topic => <li key={topic}><span className="feature-check" aria-hidden="true"><svg width="14" height="14" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg></span><span>{topic}</span></li>)}</ul>}
            <button type="button" className="button button-secondary" aria-pressed={selected.code === item.code} onClick={() => { setChosenProgram(item.code); setChosenPlan(""); document.getElementById("program-pricing")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" }); }}>Pilih {item.name}</button>
          </article>;
        })}
          {catalogPrograms.filter(item => item.family === "jlpt").length === 5 && <article className="public-level journey-placement">
            <LuCompass className="journey-compass" aria-hidden="true" /><h2>Belum tahu levelmu?</h2>
            <p>Temukan level bahasa Jepang yang sesuai dengan kemampuanmu melalui Placement Test HiruAcademy.</p>
            <Link className="button button-secondary" href="/placement">Tes Level Gratis</Link>
          </article>}
        </div>
      </section>

      <section id="program-pricing" className="public-section program-pricing-section">
        <div className="journey-section-heading"><h2>Pilih metode belajar — {selected.name}</h2><p>{selected.description}</p></div>
        {pricing.loading && <LoadingSkeleton variant="cards" label="Memuat harga…" />}
        {pricing.error && <div role="alert">{pricing.error} <button type="button" onClick={pricing.reload}>Coba lagi</button></div>}
        {ready && !availableOffers.length && <p role="status">Belum ada paket tersedia untuk program ini.</p>}
        {ready && <div className="pricing-grid">{landingOffers.map(offer => {
          const price = availableOffers.find(item => item.plan_code === offer.id);
          const free = offer.id === "free";
          return <LandingPriceCard key={offer.id} offer={{ ...offer, href: free && authenticated ? "/dashboard" : offer.href }} price={free ? 0 : price?.effective_price ?? null} normalPrice={price?.base_price} discountPercent={price?.discount_percent} months={price?.duration_months ?? ""} promotion={price?.promotion} unavailable={!free && !price} selected={chosenPlan === offer.id && selectedOffer?.plan_code === offer.id} onSelect={() => { setChosenPlan(offer.id); document.getElementById("program-summary")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" }); }} />;
        })}</div>}
      </section>

      {ready && <section id="program-summary" className="public-section journey-confirmation">
        <div className="journey-section-heading"><h2>Ringkasan Pilihan</h2></div>
        <aside className="program-summary-card compact-program-summary" aria-label="Ringkasan pilihan program dan paket">
          <div className="summary-card-inner">
            <div className="summary-program-info">
              <div className="summary-header">
                <div className="summary-icon-box" aria-hidden="true"><LuGraduationCap /></div>
                <div className="summary-header-copy">
                  <h3>{selected.name}</h3>
                  <p className="summary-plan-name">{selectedOffer ? plans.find(plan => plan.id === selectedOffer.plan_code)?.title ?? selectedOffer.plan_code : "Paket belum tersedia"}</p>
                </div>
              </div>
              <p className="summary-program-description">{selected.description}</p>
              <dl className="summary-meta-grid">
                <div><dt>PROGRAM TERPILIH</dt><dd>{selected.name}</dd></div>
                <div><dt>DURASI &amp; AKSES</dt><dd>{selectedOffer?.plan_code === "free" ? "Akses gratis" : selectedOffer ? `${selectedOffer.duration_months} bulan` : "Paket belum tersedia"}</dd></div>
              </dl>
            </div>
            <div className="summary-checkout-panel">
              <p className="summary-investment-label">BIAYA INVESTASI</p>
              {selectedOffer?.plan_code === "free" ? <div className="pricing-price-box"><span className="pricing-amount">Rp0</span></div> : selectedOffer ? <ProgramPriceDisplay price={selectedOffer.effective_price} normalPrice={selectedOffer.base_price} discountPercent={selectedOffer.discount_percent} months={selectedOffer.duration_months} /> : <p role="status">Paket belum tersedia</p>}
              <div className="summary-action-box">
                {selectedOffer && !authLoading ? <Link className="button button-primary summary-cta" href={checkoutHref(selectedOffer)}>{authenticated ? selectedOffer.plan_code === "free" ? "Mulai Belajar Gratis" : "Lanjutkan ke Checkout" : "Lanjutkan Pendaftaran"}</Link> : <button type="button" className="button button-secondary summary-cta" disabled>{authLoading ? "Memuat akun?" : "Paket belum tersedia"}</button>}
              </div>
            </div>
          </div>
        </aside>
      </section>}

    </>}
  </main></PublicPage>;
}
