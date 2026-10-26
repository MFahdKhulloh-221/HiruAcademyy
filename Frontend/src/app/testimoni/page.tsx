"use client";

import { TestimonialCard } from "@/components/testimonial-card";
import { useAuth } from "@/components/auth-provider";
import Link from "next/link";
import { useContent, type TestimonialContent } from "@/lib/public-content-api";
import { PublicPage } from "@/components/public-shell";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { useEffect, useState } from "react";
import { VideoRecommendation } from "./video-recommendation";
import { ScrollList } from "./scroll-list";
import styles from "./testimoni.module.css";


export default function TestimonialsPage() {
  const { user, loading: authLoading } = useAuth();
  const content = useContent<TestimonialContent>("/api/testimonials");
  const [filter, setFilter] = useState("all");
  const [order, setOrder] = useState("default");
  useEffect(() => {
    const reveal = () => {
      if (/^#testimoni-\d+$/.test(window.location.hash)) setFilter("all");
    };
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, []);
  const records = filter === "latest"
    ? [...content.data].sort((a, b) => (Date.parse(b.created_at || "") || 0) - (Date.parse(a.created_at || "") || 0))
    : order === "name" ? [...content.data].sort((a, b) => a.name.localeCompare(b.name, "id")) : content.data;
  const mergedTestimonials = records.filter(item => item.type === "text" || (!item.type && !item.video_url));
  const testimonialVideos = records.filter(item => item.type === "video" || (!item.type && item.video_url));
  const showTexts = filter !== "video";
  const showVideos = filter !== "text" && testimonialVideos.length > 0;

  return (
    <PublicPage active="Testimoni">
      <main className="public-main testimonials-page">
        <header className={styles.heading}>
          <p className="kicker">CERITA SISWA HIRU</p>
          <h1>Cerita Siswa Hiru Academy</h1>
          <p>Jelajahi pengalaman belajar dan cerita video dari komunitas Hiru.</p>
        </header>
        <div className={styles.content}>
          <div className={styles.toolbar}>
            <div className={styles.filters} role="group" aria-label="Jenis testimoni">
              {[["all", "Semua"], ["latest", "Terbaru"], ["text", "Testimoni"], ["video", "Video Testimoni"]].map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
            </div>
            <label className={styles.sort}>Urutan<select aria-label="Urutan" value={filter === "latest" ? "latest" : order} onChange={event => { if (event.target.value === "latest") setFilter("latest"); else { if (filter === "latest") setFilter("all"); setOrder(event.target.value); } }}><option value="latest">Terbaru</option><option value="default">Urutan default</option><option value="name">Nama A?Z</option></select></label>
          </div>
          {content.loading ? <LoadingSkeleton variant="cards" label="Memuat testimoni?" /> : content.error ? <div role="alert">{content.error} <button type="button" onClick={content.reload}>Coba lagi</button></div> : <>
            {!content.data.length && <p>Belum ada testimoni.</p>}
            {filter === "video" && !testimonialVideos.length && <p>Belum ada video testimoni yang dipublikasikan.</p>}
            <div className={`${styles.layout} ${showTexts && showVideos ? styles.withVideos : ""}`}>
              {showVideos && <aside className={styles.videos} aria-labelledby="testimonial-videos-heading">
                <h2 id="testimonial-videos-heading">Video Testimoni <span>({testimonialVideos.length})</span></h2>
                <ScrollList className={filter === "video" ? styles.videoGrid : styles.videoList} label="Daftar video testimoni">
                  {testimonialVideos.map(item => <VideoRecommendation key={item.id} item={item} />)}
                </ScrollList>
              </aside>}
              {showTexts && <section className={styles.texts} aria-label="Testimoni siswa">
                <h2>Testimoni <span>({mergedTestimonials.length})</span></h2>
                {!mergedTestimonials.length && content.data.length > 0 && <p>Belum ada testimoni teks yang dipublikasikan.</p>}
                <ScrollList className={`testimonial-grid ${styles.textGrid}`} label="Daftar testimoni teks">
                  {mergedTestimonials.map(item => <TestimonialCard key={item.id} testimonial={item} />)}
                </ScrollList>
              </section>}
            </div>
          </>}
        </div>
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
