"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { TestimonialCard } from "@/components/testimonial-card";
import { useContent, type TestimonialContent } from "@/lib/public-content-api";
import { PublicPage } from "@/components/public-shell";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { VideoRecommendation } from "./video-recommendation";
import styles from "./testimoni.module.css";

function subscribeMobile(callback: () => void) {
  const query = window.matchMedia("(max-width: 639px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

export default function TestimonialsPage() {
  const content = useContent<TestimonialContent>("/api/testimonials");
  const [filter, setFilter] = useState("all");
  const [batches, setBatches] = useState(1);
  const mobile = useSyncExternalStore(subscribeMobile, () => window.matchMedia("(max-width: 639px)").matches, () => false);
  const records = content.data.filter(item => item.published !== false && item.show_on_testimonials !== false);
  const texts = records.filter(item => item.type === "text" || (!item.type && !item.video_url));
  const videos = records.filter(item => item.type === "video" || (!item.type && item.video_url));
  const pageSize = mobile ? 2 : 4;
  const visibleCount = batches * pageSize;

  useEffect(() => {
    const reveal = () => {
      const match = /^#testimoni-(\d+)$/.exec(window.location.hash);
      if (!match) return;
      const publishedTexts = content.data.filter(item => item.published !== false && item.show_on_testimonials !== false && (item.type === "text" || (!item.type && !item.video_url)));
      const index = publishedTexts.findIndex(item => item.id === Number(match[1]));
      if (index < 0) return;
      setFilter("text");
      setBatches(current => Math.max(current, Math.ceil((index + 1) / pageSize)));
      requestAnimationFrame(() => document.getElementById(`testimoni-${match[1]}`)?.scrollIntoView({ block: "start" }));
    };
    const frame = requestAnimationFrame(reveal);
    window.addEventListener("hashchange", reveal);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("hashchange", reveal); };
  }, [content.data, pageSize]); // Records arrive asynchronously; retain shared testimonial links.

  return <PublicPage active="Testimoni">
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>CERITA SISWA HIRU</p>
          <h1>Setiap perjalanan punya <span>cerita hebat.</span></h1>
          <p className={styles.description}>Lihat pengalaman siswa yang belajar, berproses, dan terus melangkah bersama Hiru Academy.</p>
          <div className={styles.actions}>
            <a className="button button-primary" href="#pilihan-video" onClick={() => setFilter("all")}>Tonton Cerita Siswa <span aria-hidden="true">▶</span></a>
            <a className={`button ${styles.secondary}`} href="#cerita-teks" onClick={() => setFilter("all")}>Baca Testimoni</a>
          </div>
        </div>
        <div className={styles.featured}>
          {content.loading ? <LoadingSkeleton variant="cards" label="Memuat video unggulan…" /> : videos[0] ? <>
            <p className={styles.featuredLabel}>SOROTAN CERITA SISWA</p>
            <VideoRecommendation key={videos[0].id} item={videos[0]} />
          </> : <p className={styles.empty}>{content.error ? "Video unggulan belum dapat dimuat." : "Belum ada video testimoni yang dipublikasikan."}</p>}
        </div>
      </header>

      <div className={styles.collection}>
        <div className={styles.toolbar}>
          <div><p className={styles.eyebrow}>PENGALAMAN NYATA</p><h2>Temukan cerita yang menginspirasimu.</h2></div>
          <div className={styles.filters} role="group" aria-label="Jenis testimoni">
            {[["all", "Semua"], ["video", "Video"], ["text", "Cerita Teks"]].map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
          </div>
        </div>
        {content.loading ? <LoadingSkeleton variant="cards" label="Memuat testimoni…" /> : content.error ? <div className={styles.empty} role="alert">{content.error} <button type="button" className="button button-secondary" onClick={content.reload}>Coba lagi</button></div> : <>
          {filter !== "text" && <section id="pilihan-video" className={styles.section} aria-labelledby="video-heading">
            <div className={styles.sectionHeading}><div><h2 id="video-heading">Pilihan Video</h2><p>Dengar langsung cerita dan pengalaman siswa Hiru.</p></div><span>{videos.length} video</span></div>
            {videos.length ? <div className={styles.videoGrid} role="region" aria-label="Galeri video siswa" tabIndex={0}>{videos.map(item => <VideoRecommendation key={item.id} item={item} />)}</div> : <p className={styles.empty}>Belum ada video testimoni yang dipublikasikan.</p>}
          </section>}
          {filter !== "video" && <section id="cerita-teks" className={styles.section} aria-labelledby="text-heading">
            <div className={styles.sectionHeading}><div><h2 id="text-heading">Ditulis oleh Siswa</h2><p>Langkah kecil, kemajuan berarti. Ini cerita mereka.</p></div><span>{texts.length} cerita</span></div>
            {!texts.length && <p className={styles.empty}>Belum ada testimoni tertulis yang dipublikasikan.</p>}
            <div className={styles.textGrid}>{texts.slice(0, visibleCount).map(item => <TestimonialCard key={item.id} testimonial={item} previewLines={4} maxWords={500} />)}</div>
            {!!texts.length && <div className={styles.more}><p role="status">Menampilkan {Math.min(visibleCount, texts.length)} dari {texts.length} cerita</p>{visibleCount < texts.length && <button type="button" className={`button ${styles.secondary}`} onClick={() => setBatches(current => current + 1)}>Tampilkan Cerita Lainnya <span aria-hidden="true">+</span></button>}</div>}
          </section>}
        </>}
      </div>

      <section className={styles.cta} aria-labelledby="stories-cta-heading">
        <div><p className={styles.eyebrow}>GILIRANMU MELANGKAH</p><h2 id="stories-cta-heading">Perjalananmu berikutnya dimulai di sini.</h2><p>Kenali level bahasa Jepangmu dan temukan cara belajar yang sesuai.</p></div>
        <Link className="button button-primary" href="/placement">Cek Level Gratis <span aria-hidden="true">↗</span></Link>
      </section>
    </main>
  </PublicPage>;
}
