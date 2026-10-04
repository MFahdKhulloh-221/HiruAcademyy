"use client";

import Image from "next/image";
import Link from "next/link";
import { contentMedia, useContent, type TestimonialContent } from "@/lib/public-content-api";
import { PublicPage } from "@/components/public-shell";


export default function TestimonialsPage() {
  const content = useContent<TestimonialContent>("/api/testimonials");
  const mergedTestimonials = content.data.map(item => ({ name: item.name, membership: item.context, quote: item.quote, avatarSrc: contentMedia(item.image), initials: item.name.slice(0, 2).toUpperCase() }));
  const testimonialVideos = content.data.filter(item => item.video_url).map(item => ({ name: item.name, membership: item.context, videoSrc: item.video_url ?? "", posterSrc: contentMedia(item.image) }));

  return (
    <PublicPage active="Testimoni">
      <main className="public-main testimonials-page">
        <section className="testimonials-hero">
          <p className="kicker">CERITA SISWA HIRU</p>
          <h1>Cerita Nyata dari Siswa Hiru Academy</h1>
          <p>
            Setiap siswa memiliki perjalanan berbeda. Inilah pengalaman mereka belajar, berkembang, dan mencapai target bersama Hiru.
          </p>
        </section>
        <section className="testimonial-kpis" aria-label="Indikator pengalaman">
          <article>
            <span>Alumni</span>
            <strong>2.300+</strong>
          </article>
          <article>
            <span>Merasa lebih terarah</span>
            <strong>92%</strong>
          </article>
          <article>
            <span>Rating pengalaman</span>
            <strong>4,9 / 5</strong>
          </article>
        </section>
        <section className="public-section testimonial-section">
          {content.loading ? <p role="status">Memuat testimoni…</p> : content.error ? <div role="alert">{content.error} <button type="button" onClick={content.reload}>Coba lagi</button></div> : !content.data.length && <p>Belum ada testimoni.</p>}
          <div className="testimonial-grid">
            {mergedTestimonials.map((testimonial) => (
              <article className="testimonial-card" key={testimonial.name}>
                <div className="testimonial-avatar">
                  {testimonial.avatarSrc ? (
                    <Image unoptimized alt={`Foto ${testimonial.name}`} fill sizes="64px" src={testimonial.avatarSrc} />
                  ) : (
                    <span aria-hidden="true">{testimonial.initials || testimonial.name.slice(0, 2).toUpperCase()}</span>
                  )}
                </div>
                <blockquote>{testimonial.quote}</blockquote>
                <footer>
                  <strong>{testimonial.name}</strong>
                  <small>{testimonial.membership}</small>
                </footer>
              </article>
            ))}
          </div>
        </section>
        <section className="public-section testimonial-video-section">
          <div className="public-section-head">
            <p className="kicker">VIDEO TESTIMONI</p>
            <h2>Dengarkan Cerita Siswa Hiru</h2>
          </div>
          <div className="testimonial-video-grid">
            {testimonialVideos.map((testimonial) => (
              <article key={testimonial.name}>
                <div className="testimonial-video-frame">
                  {testimonial.videoSrc ? (
                    <video controls poster={testimonial.posterSrc || undefined} src={testimonial.videoSrc} />
                  ) : (
                    <>
                      <button type="button" aria-label={`Putar video testimoni ${testimonial.name}`} disabled>
                        <span aria-hidden="true">▶</span>
                      </button>
                      <strong>Video Testimoni</strong>
                    </>
                  )}
                </div>
                <footer>
                  <strong>{testimonial.name}</strong>
                  <small>{testimonial.membership}</small>
                </footer>
              </article>
            ))}
          </div>
        </section>
        <section className="testimonial-cta">
          <div>
            <h2>Siap Memulai Perjalanan Belajarmu?</h2>
            <p>Temukan levelmu melalui Placement Test gratis, lalu pilih cara belajar yang sesuai dengan target dan ritme belajarmu.</p>
          </div>
          <div>
            <Link className="button button-primary" href="/placement">
              Cek Level Gratis
            </Link>
            <Link className="button testimonial-secondary" href="/program">
              Lihat Program &amp; Biaya
            </Link>
          </div>
        </section>
      </main>
    </PublicPage>
  );
}
