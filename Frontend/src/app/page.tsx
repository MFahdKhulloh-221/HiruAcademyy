"use client";

import Image from "next/image";
import { LandingPriceCard } from "@/components/landing-price-card";
import { landingOffers as offers } from "@/lib/landing-offers";
import Link from "next/link";
import { type SVGProps } from "react";
import { LandingMotion } from "@/components/landing-motion";
import { HeroBannerSlider } from "@/components/hero-banner-slider";
import { sliderSlides } from "@/lib/hero-slider";
import { LearningPath } from "@/components/learning-path";
import { PublicPage } from "@/components/public-shell";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { SenseiGrid } from "@/components/sensei-grid";
import { TestimonialCard } from "@/components/testimonial-card";
import { usePublishedLandingRequest } from "@/lib/website-store";
import { contentMedia, offerPrice, useContent, type PublicOffer, type PublicProgram, type ShowcaseContent, type TestimonialContent } from "@/lib/public-content-api";

type IconName = "arrow" | "book" | "check" | "compass" | "layers" | "play" | "sparkle" | "target" | "users";

const icons: Record<IconName, React.ReactNode> = {
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z" /><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  compass: <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></>,
  layers: <><path d="m12 3-9 5 9 5 9-5z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
  play: <><circle cx="12" cy="12" r="9" /><path d="m10 8 6 4-6 4z" /></>,
  sparkle: <><path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2z" /><path d="m18 14 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
};

function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" {...props}>{icons[name]}</svg>;
}

const proofItems = [
  { icon: "users" as const, value: "2300+", label: "Alumni" },
  { icon: "check" as const, value: "98%", label: "Kelulusan" },
  { icon: "target" as const, value: "Try Out & Evaluasi Rutin" },
];

function LmsPreview({ preview }: { preview: { key: string; label: string; imageSrc: string } }) {
  return (
    <figure className={`lms-preview lms-preview-${preview.key}`} aria-label={`Tampilan LMS Hiru Academy: ${preview.label}`}>
      <figcaption>{preview.label}</figcaption>
      {preview.imageSrc ? (
        <div className="lms-preview-image-wrap">
          <Image
            unoptimized
            src={preview.imageSrc}
            alt={`Tampilan antarmuka ${preview.label} Hiru Academy`}
            width={860}
            height={480}
            className="lms-preview-img"
          />
        </div>
      ) : (
        <div className="lms-preview-empty" role="img" aria-label={`No image: ${preview.label}`}>No image</div>
      )}
    </figure>
  );
}

function ArrowLink({ href, children, dark = false }: { href: string; children: React.ReactNode; dark?: boolean }) {
  return <Link className={dark ? "button button-dark" : "button button-primary"} href={href}>{children}<Icon name="arrow" width="20" height="20" /></Link>;
}

export default function Home() {
  const { landing, loading: heroLoading, error: heroError, retry: retryHero } = usePublishedLandingRequest();
  const testimonialContent = useContent<TestimonialContent>("/api/testimonials?landing=true");
  const showcase = useContent<ShowcaseContent>("/api/showcase");
  const pricing = useContent<PublicOffer>("/api/public/offers");

  const programs = useContent<PublicProgram>("/api/public/programs");

  const hero = landing.hero;
  const heroSupport =
    (hero.support ? hero.support.replace(/learning journey/gi, "pembelajaran") : "") ||
    "Placement test, pembelajaran, flashcard, latihan, try out, komunitas, dan kelas bersama Sensei tersedia dalam satu pengalaman belajar yang konsisten.";
  const currentOffers = offers.map(offer => {
    const available = pricing.data.filter(item => item.plan_code === offer.id && programs.data.some(program => program.family === "jlpt" && ["n5", "n4", "n3", "n2", "n1"].includes(program.code.toLowerCase()) && program.code.toLowerCase() === item.program.code.toLowerCase())).sort((a, b) => a.effective_price - b.effective_price);
    return { ...offer, href: available[0] ? `/program?level=${encodeURIComponent(available[0].program.code)}&plan=${encodeURIComponent(available[0].plan_code)}` : offer.href, pricing: available[0], price: offer.id === "free" ? offer.price : pricing.loading ? "Memuat harga…" : pricing.error ? "Harga gagal dimuat" : offerPrice(available[0]).split("/")[0], period: offer.id === "free" ? offer.period : available[0] ? `/${available[0].duration_months} bulan` : "" };
  });
  const previews = showcase.data.map(item => ({ key: item.key, label: item.label, imageSrc: contentMedia(item.image_src) }));

  return (
    <PublicPage>
      <main id="top" data-landing-motion>
        {!heroLoading && <LandingMotion />}
        {heroError && <div className="container"><p role="alert">Hero gagal dimuat. Teks awal ditampilkan. {heroError}</p><button type="button" className="button button-secondary" onClick={retryHero}>Coba lagi Hero</button></div>}
        <HeroBannerSlider loading={heroLoading} autoplay={hero.slider?.autoplay} intervalMs={hero.slider?.intervalMs} slides={hero.slider?.slides.some(slide => slide.active) ? sliderSlides(hero.slider) : [{
          id: "hiru-hero-01",
          desktopSrc: "/banners/hiru-hero-desktop.png",
          imageAlt: "Dua pelajar bahasa Jepang dengan latar Gunung Fuji, sakura, dan gerbang torii",
          eyebrow: hero.eyebrow,
          title: hero.heading || "Belajar Bahasa Jepang Terarah dari Dasar sampai Siap JLPT",
          description: heroSupport,
          primaryLabel: hero.primaryCtaLabel || "Coba Gratis",
          primaryHref: hero.primaryCtaPath || "/register",
          secondaryLabel: hero.secondaryCtaLabel || "Lihat Program",
          secondaryHref: hero.secondaryCtaPath || "#program",
        }]} />

        {!heroLoading && <aside className="proof-strip" aria-label="Pencapaian HIRU Academy" data-reveal><div className="container proof-strip-grid">{proofItems.map((item, index) => <div className="proof-item reveal-item" key={item.value} style={{ "--reveal-index": index } as React.CSSProperties}><span><Icon name={item.icon} width="24" height="24" /></span><p><strong {...(item.label ? { "data-counter": item.value.replace(/\D/g, ""), "data-suffix": item.value.replace(/\d/g, "") } : {})}>{item.value}</strong>{item.label && <small>{item.label}</small>}</p></div>)}</div></aside>}

        <section className="section landing-pricing" id="program" data-reveal>
          <div className="container">
            <div className="section-heading landing-section-heading">
              <span className="eyebrow" style={{ margin: "0 auto 16px" }}>INVESTASI BELAJAR</span>
              <h2>{landing.pricing?.title || "Pilih cara belajar yang paling sesuai"}</h2>
              <p>{landing.pricing?.support?.replace("Harga dan akses mengikuti konfigurasi sistem.", "").trim() || "Pilih cara belajar yang sesuai dengan kebutuhanmu."}</p>
            </div>
            {pricing.error && <div role="alert">{pricing.error} <button type="button" onClick={pricing.reload}>Coba lagi</button></div>}
            {programs.error && <div role="alert">{programs.error} <button type="button" onClick={programs.reload}>Coba lagi program</button></div>}
            {pricing.loading || programs.loading ? <LoadingSkeleton variant="cards" label="Memuat harga…" /> : <div className="pricing-grid">
              {currentOffers.map((offer, index) => (
                <LandingPriceCard key={offer.id} offer={offer} price={offer.id === "free" ? 0 : offer.pricing?.effective_price ?? null} normalPrice={offer.pricing?.base_price} promotion={offer.pricing?.promotion} unavailable={offer.id !== "free" && (!offer.pricing || Boolean(pricing.error || programs.error))} discountPercent={offer.pricing?.discount_percent} months={offer.pricing?.duration_months ?? ""} priceText={pricing.error || programs.error ? "Harga gagal dimuat" : undefined} index={index} />
              ))}
            </div>}
          </div>
        </section>

        <LearningPath />

        <section className="section lms-showcase" data-reveal><div className="container section-heading landing-section-heading"><h2>Bukan Hanya Belajar Saat Zoom</h2><p>Lanjutkan belajar melalui materi, rekaman, latihan, dan evaluasi yang tersimpan di LMS Hiru Academy.</p></div>{showcase.loading ? <LoadingSkeleton variant="cards" label="Memuat showcase…" className="container" /> : showcase.error ? <div role="alert">{showcase.error} <button type="button" onClick={showcase.reload}>Coba lagi</button></div> : !previews.length && <p>Belum ada showcase.</p>}<div className="lms-showcase-viewport"><div className="lms-showcase-track"><div className="lms-showcase-group">{previews.map((preview) => <LmsPreview key={preview.key} preview={preview} />)}</div><div className="lms-showcase-group lms-showcase-copy" aria-hidden="true">{previews.map((preview) => <LmsPreview key={preview.key} preview={preview} />)}</div></div></div></section>

        <section className="section landing-sensei" data-reveal><div className="container"><div className="landing-sensei-heading landing-section-heading"><h2>Belajar Bersama Sensei Berpengalaman</h2><p>Temukan mentor sesuai level, target, dan gaya belajarmu.</p></div><SenseiGrid carousel /><div className="landing-sensei-action"><Link className="button button-dark" href="/sensei">Lihat Semua Sensei</Link></div></div></section>

        <section className="section landing-testimonials" data-reveal><div className="container"><div className="section-heading landing-section-heading"><p className="kicker">CERITA PEMBELAJAR</p><h2>{landing.testimonial?.heading || "Cerita dari Pembelajar Hiru Academy"}</h2></div>{testimonialContent.loading ? <LoadingSkeleton variant="cards" label="Memuat testimoni…" /> : testimonialContent.error ? <div role="alert">{testimonialContent.error} <button type="button" onClick={testimonialContent.reload}>Coba lagi</button></div> : !testimonialContent.data.length && <p>Belum ada testimoni.</p>}<div className="testimonial-grid">{testimonialContent.data.filter(testimonial => testimonial.type === "text" && !testimonial.video_url).slice(0, 6).map(testimonial => <TestimonialCard key={testimonial.id} testimonial={testimonial} landing />)}</div><div className="landing-testimonials-action"><Link className="button button-primary" href="/testimoni">Lihat lebih banyak</Link></div></div></section>

        <section className="final-cta" id="tentang" data-reveal><div className="container"><div className="cta-panel"><div className="cta-pattern" aria-hidden="true">あ <span>日</span> 語</div><h2>{landing.finalCta?.heading || "Belum tahu harus mulai dari level mana?"}</h2><p>{landing.finalCta?.support || "Belum yakin levelmu? Gunakan Placement Test. Sudah punya target? Coba Chapter 1 gratis pada level pilihanmu."}</p><ArrowLink href={landing.finalCta?.ctaPath || "/placement"}>{landing.finalCta?.ctaLabel || "Mulai Sekarang"}</ArrowLink></div></div></section>
      </main>
    </PublicPage>
  );
}
