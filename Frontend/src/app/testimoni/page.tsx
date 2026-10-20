"use client";

import { StudentAvatar } from "@/components/student-avatar";
import { useAuth } from "@/components/auth-provider";
import Link from "next/link";
import { contentMedia, useContent, type TestimonialContent } from "@/lib/public-content-api";
import { PublicPage } from "@/components/public-shell";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { LandingMotion } from "@/components/landing-motion";
import { TestimonialVideoCard } from "@/components/testimonial-video-card";


export default function TestimonialsPage() {
  const { user, loading: authLoading } = useAuth();
  const content = useContent<TestimonialContent>("/api/testimonials");
  const mergedTestimonials = content.data.filter(item => item.type === "text" || (!item.type && !item.video_url)).map(item => ({ id: item.id, name: item.name, membership: item.context, quote: item.quote, avatarSrc: contentMedia(item.image, item.image_resolved_url) }));
  const testimonialVideos = content.data.filter(item => item.type === "video" || (!item.type && item.video_url));

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
        <LandingMotion selector="[data-testimonial-motion]" />
        <section className="testimonial-kpis" aria-label="Indikator pengalaman" data-testimonial-motion data-reveal>
          <article>
            <span>Alumni</span>
            <strong data-counter="2300" data-locale="id-ID" data-suffix="+" aria-label="2.300+">2.300+</strong>
          </article>
          <article>
            <span>Merasa lebih terarah</span>
            <strong data-counter="92" data-locale="id-ID" data-suffix="%" aria-label="92%">92%</strong>
          </article>
          <article>
            <span>Rating pengalaman</span>
            <strong data-counter="4.9" data-locale="id-ID" data-decimals="1" data-suffix=" / 5" aria-label="4,9 / 5">4,9 / 5</strong>
          </article>
        </section>
        <section className="public-section testimonial-section">
          {content.loading ? <LoadingSkeleton variant="cards" label="Memuat testimoni…" /> : content.error ? <div role="alert">{content.error} <button type="button" onClick={content.reload}>Coba lagi</button></div> : !content.data.length && <p>Belum ada testimoni.</p>}
          <div className="testimonial-grid">
            {mergedTestimonials.map((testimonial) => (
              <article className="testimonial-card" key={testimonial.id}>
                <StudentAvatar name={testimonial.name} url={testimonial.avatarSrc} className="testimonial-avatar" />
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
          {!content.loading && !content.error && testimonialVideos.length === 0 && <p>Belum ada video testimoni yang dipublikasikan.</p>}
          <div className="testimonial-video-grid">
            {testimonialVideos.map((testimonial) => (
              <TestimonialVideoCard key={testimonial.id} title={testimonial.title || testimonial.video_title || testimonial.name} name={testimonial.name} context={testimonial.context} description={testimonial.quote} videoUrl={testimonial.video_url || ""} videoResolvedUrl={testimonial.video_url_resolved_url} thumbnail={testimonial.video_thumbnail} thumbnailResolvedUrl={testimonial.video_thumbnail_resolved_url} />
            ))}
          </div>
        </section>
        <section className="testimonial-cta">
          <div><h2>Sudah belajar bersama Hiru Academy?</h2><p>Bagikan pengalaman belajarmu.</p></div>
          <div>{!authLoading && <Link className="button button-primary" href={user?.role === "student" ? "/profile/testimoni" : "/login"}>Tulis Testimoni</Link>}</div>
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
