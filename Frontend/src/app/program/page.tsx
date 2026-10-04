"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { LuSparkles } from "react-icons/lu";
import { PublicPage } from "@/components/public-shell";
import { levelCatalog, plans } from "@/lib/public-mock";
import { offerPrice, useContent, type PublicOffer, type PublicProgram } from "@/lib/public-content-api";

function ProgramContent() {
  const programs = useContent<PublicProgram>("/api/public/programs");
  const pricing = useContent<PublicOffer>("/api/public/offers");
  const planParam = useSearchParams().get("plan");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(planParam === "sensei" || planParam === "lms" || planParam === "free" ? planParam : null);
  const [selectedLevel, setSelectedLevel] = useState(levelCatalog[1]);
  const [clickedPlanId, setClickedPlanId] = useState<string | null>(null);

  const currentPlans = ["free", "sensei", "lms"].map(id => plans.find(plan => plan.id === id)).filter((plan): plan is (typeof plans)[number] => Boolean(plan)).map(plan => {
    const offer = selectedLevel.code === "N1" ? undefined : pricing.data.find(item => item.program.code.toLowerCase() === selectedLevel.code.toLowerCase() && item.plan_code === plan.id);
    return { ...plan, price: plan.id === "free" ? plan.price : pricing.loading ? "Memuat harga…" : pricing.error ? "Harga gagal dimuat" : offerPrice(offer), period: plan.id === "free" ? plan.period : offer ? `${offer.duration_months} bulan` : "", available: plan.id === "free" ? selectedLevel.code !== "N1" : Boolean(offer) };
  });
  const levels = levelCatalog.filter(level => level.code === "N1" || programs.data.some(program => program.code.toLowerCase() === level.code.toLowerCase()));

  const selectedPlan = currentPlans.find((plan) => plan.id === selectedPlanId);
  const summaryPlan = selectedPlan ?? currentPlans[0];

  function handleButtonClick(planId: string) {
    setSelectedPlanId(planId);
    setClickedPlanId(planId);
    document.querySelector(".level-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <PublicPage active="Program">
      <main className="public-main program-page">
        <section className="public-section program-pricing-section">
          <div className="public-section-head program-section-title">
            <div>
              <h2>Pilih metode belajar</h2>
              <p>Sesuaikan dengan waktu dan kebutuhan bimbinganmu.</p>
            </div>
          </div>
          <div className="pricing-grid">
            {currentPlans.map((plan) => {
              const isSelected = selectedPlan?.id === plan.id;
              const isPopular = plan.id === "sensei";
              const displayPrice = plan.price.replace(/99\.000/g, "99k").replace(/350\.000/g, "350k");
              const [amount, period] = displayPrice.includes("/")
                ? displayPrice.split("/")
                : [displayPrice, ""];

              return (
                <article
                  key={plan.id}
                  className={`pricing-card${isPopular ? " pricing-card-popular" : ""}${isSelected ? " selected-pricing-card" : ""}`}
                  onClick={() => { setSelectedPlanId(plan.id); setClickedPlanId(plan.id); }}
                  style={{ cursor: "pointer" }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedPlanId(plan.id);
                      setClickedPlanId(plan.id);
                    }
                  }}
                  aria-pressed={isSelected}
                >
                  {isPopular && (
                    <div className="pricing-floating-badge" aria-label="Paket paling populer">
                      Paling Populer
                    </div>
                  )}

                  <div className="pricing-card-header">
                    {!isPopular && plan.id !== "free" && <span className="pricing-badge-pill">{plan.badge}</span>}
                    {(isPopular || plan.id === "free") && <span className="pricing-badge-pill" style={{ visibility: "hidden" }}>&nbsp;</span>}
                    <h3 className="pricing-title">{plan.title}</h3>
                    <p className="pricing-desc">{plan.description}</p>
                  </div>

                  <div className="pricing-price-box">
                    <span className="pricing-amount">{amount}</span>
                    {period && <span className="pricing-period">/{period}</span>}
                  </div>

                  <ul className="pricing-features" aria-label={`Fitur paket ${plan.title}`}>
                    {plan.points.map((point) => (
                      <li key={point}>
                        <span className="feature-check" aria-hidden="true">
                          <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" viewBox="0 0 24 24" width="14" height="14">
                            <path d="m5 12 4 4L19 6" />
                          </svg>
                        </span>
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="pricing-card-footer">
                    <button
                      type="button"
                      className={`button ${clickedPlanId === plan.id ? "button-primary" : "button-secondary"} pricing-cta-btn`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleButtonClick(plan.id);
                      }}
                    >
                      {plan.id === "free"
                        ? "Pilih Coba Gratis"
                        : plan.id === "lms"
                          ? "Pilih Mandiri"
                          : "Pilih Bersama Sensei"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="public-section level-section">
          <div className="public-section-head level-section-head">
            <div className="program-section-title">
              <div>
                <h2>Pilih level sesuai kemampuanmu.</h2>
                <p>Tidak harus memulai dari level N5, pilih level berdasarkan kemampuan dan target belajarmu.</p>
                <p className="level-placement-helper">
                  Belum yakin dengan levelmu? <Link href="/placement">Cek level gratis</Link>
                </p>
              </div>
            </div>
          </div>
          {programs.loading && <p role="status">Memuat program…</p>}{programs.error && <div role="alert">{programs.error} <button type="button" onClick={programs.reload}>Coba lagi</button></div>}{!programs.loading && !programs.error && !programs.data.length && <p>Belum ada program tersedia.</p>}
          <div className="public-levels">
            {levels.map((level) => (
              <button
                type="button"
                className={`public-level${selectedLevel.code === level.code ? " selected" : ""}`}
                onClick={() => setSelectedLevel(level)}
                aria-pressed={selectedLevel.code === level.code}
                key={level.code}
              >
                <div className="public-level-top">
                  <strong>{level.name}</strong>
                </div>
                <h3>{level.title}</h3>
                <p>{level.description}</p>
                <ul>
                  {level.topics.map((topic) => (
                    <li key={topic}>{topic}</li>
                  ))}
                </ul>
              </button>
            ))}
          </div>
        </section>

        <aside className="program-summary-card" aria-label="Ringkasan pilihan program dan level">
          <div className="summary-card-inner">
            <div className="summary-header">
              <div className="summary-icon-box" aria-hidden="true">
                <LuSparkles />
              </div>
              <div className="summary-header-copy">
                <div className="summary-tag">RINGKASAN PILIHAN</div>
                <h2>{selectedLevel.name} • {summaryPlan.title}</h2>
                <p>Paket belajar pilihanmu siap didaftarkan.</p>
              </div>
            </div>

            <div className="summary-meta-grid">
              <div className="summary-meta-card price-highlight">
                <span className="meta-label">BIAYA INVESTASI</span>
                <strong className="meta-value">{summaryPlan.price.replace(/99\.000/g, "99k").replace(/350\.000/g, "350k")}</strong>
                <small className="meta-note">{summaryPlan.id === "free" ? "Akses Chapter 1 Gratis" : "Investasi pendidikan terarah"}</small>
              </div>
              {summaryPlan.period && (
                <div className="summary-meta-card period-highlight">
                  <span className="meta-label">DURASI &amp; AKSES</span>
                  <strong className="meta-value">{summaryPlan.period}</strong>
                  <small className="meta-note">Masa aktif bimbingan materi</small>
                </div>
              )}
              <div className="summary-meta-card level-highlight">
                <span className="meta-label">LEVEL TERPILIH</span>
                <strong className="meta-value">{selectedLevel.code} — {selectedLevel.title}</strong>
                <small className="meta-note">Kurikulum JLPT terstruktur</small>
              </div>
            </div>

            <div className="summary-action-box" style={{ width: "100%", display: "flex", justifyContent: "center", margin: "20px auto 0" }}>
              {summaryPlan.available ? <Link className="button button-primary summary-cta" href={`/register?placement=${selectedLevel.code}&plan=${summaryPlan.id}`} style={{ margin: "0 auto" }}>Lanjutkan Pendaftaran</Link> : <button type="button" className="button button-secondary summary-cta" disabled>Belum tersedia</button>}
            </div>
          </div>
        </aside>
      </main>
    </PublicPage>
  );
}

export default function ProgramPage() {
  return (
    <Suspense fallback={null}>
      <ProgramContent />
    </Suspense>
  );
}
