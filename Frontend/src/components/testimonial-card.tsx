"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { StudentAvatar } from "@/components/student-avatar";
import { contentMedia, type TestimonialContent } from "@/lib/public-content-api";
import styles from "./testimonial-card.module.css";

export function TestimonialCard({ testimonial, landing = false }: { testimonial: TestimonialContent; landing?: boolean }) {
  const id = `testimoni-${testimonial.id}`;
  const previewLines = landing ? 4 : 5;
  const createdAt = testimonial.created_at ? new Date(testimonial.created_at) : null;
  const dateLabel = createdAt && Number.isFinite(createdAt.getTime()) ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(createdAt) : null;
  const card = useRef<HTMLElement>(null);
  const quote = useRef<HTMLQuoteElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [long, setLong] = useState(false);

  useEffect(() => {
    const element = quote.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const lineHeight = parseFloat(getComputedStyle(element).lineHeight);
      setLong(element.scrollHeight > lineHeight * previewLines + 1);
    });
    observer.observe(element);
    const revealTarget = () => {
      if (!landing && window.location.hash === `#${id}`) {
        setExpanded(true);
        card.current?.scrollIntoView({ block: "start" });
      }
    };
    const frame = requestAnimationFrame(revealTarget);
    window.addEventListener("hashchange", revealTarget);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", revealTarget);
    };
  }, [id, landing, previewLines]);

  return (
    <article ref={card} id={id} data-expanded={expanded} className={`testimonial-card ${styles.card}`} aria-label={`Testimoni ${testimonial.name}`}>
      <header className={styles.header}>
        <StudentAvatar name={testimonial.name} url={contentMedia(testimonial.image, testimonial.image_resolved_url)} className={`testimonial-avatar ${styles.avatar}`} />
        <div className={styles.identity}><strong>{testimonial.name}</strong><small>{testimonial.context}</small>{!landing && dateLabel && <time dateTime={testimonial.created_at!} aria-label={`Ditambahkan ${dateLabel}`}>{dateLabel}</time>}</div>
      </header>
      <blockquote ref={quote} id={`${id}-quote`} className={expanded ? styles.expanded : `${styles.preview} ${landing ? "" : styles.fiveLines}`}>{testimonial.quote}</blockquote>
      {long && (landing && testimonial.show_on_testimonials ? <Link className={styles.toggle} href={`/testimoni#${id}`}>Baca selengkapnya</Link> : <button className={styles.toggle} type="button" aria-expanded={expanded} aria-controls={`${id}-quote`} onClick={() => setExpanded(value => !value)}>{expanded ? "Tampilkan lebih sedikit" : "Baca selengkapnya"}</button>)}
    </article>
  );
}
