"use client";

import Image from "next/image";
import Link from "next/link";
import { type SVGProps, useState } from "react";
import { LandingMotion } from "@/components/landing-motion";
import { LearningPath } from "@/components/learning-path";
import { PublicPage } from "@/components/public-shell";
import { SenseiGrid } from "@/components/sensei-grid";
import { usePublishedLanding } from "@/lib/website-store";
import { contentMedia, offerPrice, useContent, type PublicOffer, type ShowcaseContent, type TestimonialContent } from "@/lib/public-content-api";

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

const offers = [
  {
    id: "free",
    badge: "",
    title: "Coba Gratis",
    subTitle: "",
    description: "Cocok untuk kamu yang ingin mencoba sistem belajar Hiru sebelum berlangganan.",
    price: "Rp 0",
    period: "/selamanya",
    popular: false,
    points: [
      "Akses 1 chapter lengkap setiap level",
      "Progres belajar tersimpan otomatis",
      "Akses membaca diskusi komunitas",
    ],
    cta: "Pilih Coba Gratis",
    href: "/program",
    buttonClass: "button-dark",
  },
  {
    id: "sensei",
    badge: "",
    title: "LMS プラス (Plus)",
    subTitle: "Kelas bersama Sensei",
    description: "Cocok untuk kamu yang membutuhkan jadwal rutin, bimbingan dan evaluasi langsung.",
    price: "Mulai Rp 350k",
    period: "/bulan",
    popular: true,
    points: [
      "Semua fasilitas Belajar Mandiri",
      "10x live Zoom ・ 90 menit/bulan",
      "Rekaman kelas dan evaluasi hasil belajar",
    ],
    cta: "Pilih Bersama Sensei",
    href: "/program?plan=sensei",
    buttonClass: "button-primary",
  },
  {
    id: "lms",
    badge: "BELAJAR FLEKSIBEL",
    title: "LMS のみ (Only)",
    subTitle: "Belajar Mandiri",
    description: "Cocok untuk kamu yang ingin belajar menyesuaikan waktu dan kecepatan sendiri.",
    price: "Mulai Rp 99k",
    period: "/6 bulan",
    popular: false,
    points: [
      "Alur belajar dan latihan lengkap",
      "Try Out dan pembahasan jawaban",
      "Akses komunitas serta sertifikat digital",
    ],
    cta: "Pilih Mandiri",
    href: "/program?plan=lms",
    buttonClass: "button-dark",
  },
];

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
  const landing = usePublishedLanding();
  const testimonialContent = useContent<TestimonialContent>("/api/testimonials?landing=true");
  const showcase = useContent<ShowcaseContent>("/api/showcase");
  const pricing = useContent<PublicOffer>("/api/public/offers");
  const [clickedPlan, setClickedPlan] = useState<string | null>(null);

  const hero = landing.hero;
  const heroSupport =
    (hero.support ? hero.support.replace(/learning journey/gi, "pembelajaran") : "") ||
    "Placement test, pembelajaran, flashcard, latihan, try out, komunitas, dan kelas bersama Sensei tersedia dalam satu pengalaman belajar yang konsisten.";
  const currentOffers = offers.map(offer => {
    const available = pricing.data.filter(item => item.program.code !== "N1" && item.plan_code === offer.id).sort((a, b) => a.effective_price - b.effective_price);
    return { ...offer, price: offer.id === "free" ? offer.price : pricing.loading ? "Memuat harga…" : pricing.error ? "Harga gagal dimuat" : offerPrice(available[0]).split("/")[0], period: offer.id === "free" ? offer.period : available[0] ? `/${available[0].duration_months} bulan` : "", buttonClass: clickedPlan === offer.id ? "button-primary" : "button-dark" };
  });
  const previews = showcase.data.map(item => ({ key: item.key, label: item.label, imageSrc: contentMedia(item.image_src) }));
  const displayTestimonials = testimonialContent.data.map(t => ({ name: t.name, quote: t.quote, membership: t.context, avatarSrc: contentMedia(t.image), initials: t.name.slice(0, 2).toUpperCase() }));

  return (
    <PublicPage>
      <main id="top" data-landing-motion>
        <LandingMotion />
        <section className="hero" data-reveal><div className="hero-orb hero-orb-one" /><div className="hero-orb hero-orb-two" /><div className="container hero-grid"><div className="hero-copy"><p className="eyebrow"><Icon name="sparkle" width="17" height="17" /> {hero.eyebrow || "LIVE CLASS + LMS DALAM SATU ALUR BELAJAR"}</p><h1>{hero.heading && hero.heading.includes("Dasar sampai Siap JLPT") ? (<>{hero.heading.split("Dasar sampai Siap JLPT")[0]}<span>Dasar sampai Siap JLPT</span>{hero.heading.split("Dasar sampai Siap JLPT")[1]}</>) : (hero.heading || <>Belajar Bahasa Jepang Terarah dari <span>Dasar sampai Siap JLPT</span></>)}</h1><p className="hero-lead">{heroSupport}</p><div className="hero-actions"><ArrowLink href={hero.primaryCtaPath || "/register"}>{hero.primaryCtaLabel || "Coba Gratis"}</ArrowLink><a className="text-link" href={hero.secondaryCtaPath || "#program"}><Icon name="play" width="21" height="21" /> {hero.secondaryCtaLabel || "Lihat Program"}</a></div></div><div className="hero-visual" aria-label="Ilustrasi perjalanan belajar bahasa Jepang"><div className="sun" aria-hidden="true" /><div className="cloud cloud-one" /><div className="cloud cloud-two" /><div className="learning-card card-kanji"><small>Hari ini</small><strong><ruby>学<rt>まな</rt></ruby>ぶ</strong><span>belajar</span></div><div className="learning-card card-progress"><span className="mini-icon"><Icon name="layers" width="19" height="19" /></span><div><small>Perjalananmu</small><strong>Terus bertumbuh</strong></div><div className="progress"><i /></div></div><div className="torii" aria-hidden="true"><i /><b /><span /><em /></div><div className="hill hill-back" /><div className="hill hill-front" /><div className="floating-note note-one">あ</div><div className="floating-note note-two">夢</div></div></div></section>

        <aside className="proof-strip" aria-label="Pencapaian HIRU Academy" data-reveal><div className="container proof-strip-grid">{proofItems.map((item, index) => <div className="proof-item reveal-item" key={item.value} style={{ "--reveal-index": index } as React.CSSProperties}><span><Icon name={item.icon} width="24" height="24" /></span><p><strong {...(item.label ? { "data-counter": item.value.replace(/\D/g, ""), "data-suffix": item.value.replace(/\d/g, "") } : {})}>{item.value}</strong>{item.label && <small>{item.label}</small>}</p></div>)}</div></aside>

        <section className="section landing-pricing" id="program" data-reveal>
          <div className="container">
            <div className="section-heading">
              <span className="eyebrow" style={{ margin: "0 auto 16px" }}>INVESTASI BELAJAR</span>
              <h2>{landing.pricing?.title || "Pilih cara belajar yang paling sesuai"}</h2>
              <p>{landing.pricing?.support || "Pilih cara belajar yang sesuai dengan kebutuhanmu."}</p>
            </div>
            {pricing.error && <div role="alert">{pricing.error} <button type="button" onClick={pricing.reload}>Coba lagi</button></div>}
            <div className="pricing-grid">
              {currentOffers.map((offer, index) => (
                <article
                  className={`pricing-card reveal-item${offer.popular ? " pricing-card-popular" : ""}`}
                  key={offer.id}
                  style={{ "--reveal-index": index } as React.CSSProperties}
                >
                  {offer.popular && (
                    <div className="pricing-floating-badge" aria-label="Paket paling populer">
                      Paling Populer
                    </div>
                  )}
                  <div className="pricing-card-header">
                    {offer.badge && <span className="pricing-badge-pill">{offer.badge}</span>}
                    <h3 className="pricing-title">{offer.title}</h3>
                    {offer.subTitle && <span className="pricing-subtitle">{offer.subTitle}</span>}
                    <p className="pricing-desc">{offer.description}</p>
                  </div>

                  <div className="pricing-price-box">
                    <span className="pricing-amount">{offer.price}</span>
                    <span className="pricing-period">{offer.period}</span>
                  </div>

                  <ul className="pricing-features" aria-label={`Fitur paket ${offer.title}`}>
                    {offer.points.map((point) => (
                      <li key={point}>
                        <span className="feature-check" aria-hidden="true">
                          <Icon name="check" width="14" height="14" />
                        </span>
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="pricing-card-footer">
                    <Link className={`button ${offer.buttonClass} pricing-cta-btn`} href={offer.href} onClick={() => setClickedPlan(offer.id)}>
                      {offer.cta}
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <LearningPath />

        <section className="section lms-showcase" data-reveal><div className="container section-heading"><h2>Bukan Hanya Belajar Saat Zoom</h2><p>Lanjutkan belajar melalui materi, rekaman, latihan, dan evaluasi yang tersimpan di LMS Hiru Academy.</p></div>{showcase.loading ? <p role="status">Memuat showcase…</p> : showcase.error ? <div role="alert">{showcase.error} <button type="button" onClick={showcase.reload}>Coba lagi</button></div> : !previews.length && <p>Belum ada showcase.</p>}<div className="lms-showcase-viewport"><div className="lms-showcase-track"><div className="lms-showcase-group">{previews.map((preview) => <LmsPreview key={preview.key} preview={preview} />)}</div><div className="lms-showcase-group lms-showcase-copy" aria-hidden="true">{previews.map((preview) => <LmsPreview key={preview.key} preview={preview} />)}</div></div></div></section>

        <section className="section landing-sensei" data-reveal><div className="container"><div className="landing-sensei-heading"><h2>Belajar Bersama Sensei Berpengalaman</h2><p>Temukan mentor sesuai level, target, dan gaya belajarmu.</p></div><SenseiGrid carousel /><div className="landing-sensei-action"><Link className="button button-dark" href="/sensei">Lihat Semua Sensei</Link></div></div></section>

        <section className="section landing-testimonials" data-reveal><div className="container"><div className="section-heading"><p className="kicker">CERITA PEMBELAJAR</p><h2>{landing.testimonial?.heading || "Cerita dari Pembelajar Hiru Academy"}</h2></div>{testimonialContent.loading ? <p role="status">Memuat testimoni…</p> : testimonialContent.error ? <div role="alert">{testimonialContent.error} <button type="button" onClick={testimonialContent.reload}>Coba lagi</button></div> : !displayTestimonials.length && <p>Belum ada testimoni.</p>}<div className="testimonial-grid">{displayTestimonials.map((testimonial, index) => <article className="testimonial-card reveal-item" key={testimonial.name} style={{ "--reveal-index": index } as React.CSSProperties}><div className="testimonial-avatar">{testimonial.avatarSrc ? <Image unoptimized alt={`Foto ${testimonial.name}`} fill sizes="64px" src={testimonial.avatarSrc} /> : <span aria-hidden="true">{testimonial.initials}</span>}</div><blockquote>{testimonial.quote}</blockquote><footer><strong>{testimonial.name}</strong><small>{testimonial.membership}</small></footer></article>)}</div><div className="landing-testimonials-action"><Link className="button button-primary" href="/testimoni">Lihat lebih banyak</Link></div></div></section>

        <section className="final-cta" id="tentang" data-reveal><div className="container"><div className="cta-panel"><div className="cta-pattern" aria-hidden="true">あ <span>日</span> 語</div><h2>{landing.finalCta?.heading || "Belum tahu harus mulai dari level mana?"}</h2><p>{landing.finalCta?.support || "Belum yakin levelmu? Gunakan Placement Test. Sudah punya target? Coba Chapter 1 gratis pada level pilihanmu."}</p><ArrowLink href={landing.finalCta?.ctaPath || "/placement"}>{landing.finalCta?.ctaLabel || "Mulai Sekarang"}</ArrowLink></div></div></section>
      </main>
    </PublicPage>
  );
}
