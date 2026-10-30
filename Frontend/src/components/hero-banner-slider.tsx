"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./hero-banner-slider.module.css";
import { headlineParts, type HeadlineHighlight } from "@/lib/headline-highlights";

/**
 * BATCH 1: carousel UI only. Slides are supplied by the homepage, not the Admin CMS.
 * When more approved banners are provided, append them to this array in page.tsx.
 * BATCH 2 will replace the source of slides with the published Admin data.
 */
export type HeroBannerSlide = {
  showOverlay?: boolean;
  desktopPosition?: "left" | "center" | "right";
  mobilePosition?: "left" | "center" | "right";
  offsetY?: number;
  ctaOffsetDesktop?: number;
  ctaOffsetMobile?: number;
  id: string;
  desktopSrc: string;
  mobileSrc?: string;
  imageAlt: string;
  eyebrow?: string;
  title: string;
  titleHighlights?: HeadlineHighlight[];
  description?: string;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
};

type Props = {
  slides: HeroBannerSlide[];
  intervalMs?: number;
  autoplay?: boolean;
  loading?: boolean;
};

function BannerActions({ desktop = 0, mobile = 0, children }: { desktop?: number; mobile?: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const actions = ref.current;
    const banner = actions?.closest("section");
    if (!actions || !banner) return;
    let shifted = 0;
    actions.style.left = "0px";
    const update = () => {
      actions.style.left = "0px";
      const bounds = banner.getBoundingClientRect();
      const box = actions.getBoundingClientRect();
      // Rects include Builder preview zoom; convert back to local CSS pixels.
      const scale = banner.clientWidth ? bounds.width / banner.clientWidth : 1;
      if (!scale || !box.width) return;
      const left = box.left;
      const offset = Number(getComputedStyle(actions).getPropertyValue("--cta-offset")) || 0;
      const desired = offset / 100 * bounds.width;
      shifted = Math.min(Math.max(desired, bounds.left + 16 * scale - left), bounds.right - 16 * scale - left - box.width) / scale;
      actions.style.left = `${shifted}px`;
    };
    const observer = new ResizeObserver(update);
    observer.observe(banner); observer.observe(actions);
    update();
    return () => observer.disconnect();
  }, [desktop, mobile]);
  return <div ref={ref} className={styles.actions} style={{ "--cta-desktop": desktop, "--cta-mobile": mobile } as React.CSSProperties}>{children}</div>;
}

export function HeroBannerSlider({ slides, intervalMs = 6000, autoplay = true, loading = false }: Props) {
  const [index, setIndex] = useState(0);
  const [pausedByUser, setPausedByUser] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [documentHidden, setDocumentHidden] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const hasMultiple = slides.length > 1;
  const goTo = useCallback((next: number) => {
    setPausedByUser(true);
    setIndex((next + slides.length) % slides.length);
  }, [slides.length]);
  const goBy = useCallback((direction: number) => {
    setPausedByUser(true);
    setIndex((current) => (current + direction + slides.length) % slides.length);
  }, [slides.length]);

  const activeIndex = index < slides.length ? index : 0;
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const update = () => setDocumentHidden(document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    if (loading || !autoplay || !hasMultiple || pausedByUser || hovered || focused || reducedMotion || documentHidden) return;
    const interval = window.setInterval(() => setIndex(current => (current + 1) % slides.length), intervalMs);
    return () => window.clearInterval(interval);
  }, [autoplay, hasMultiple, pausedByUser, hovered, focused, reducedMotion, documentHidden, intervalMs, slides.length, loading]);

  if (loading) return <section className={styles.hero} aria-label="Promosi Hiru Academy" aria-busy="true"><div className={`${styles.viewport} ${styles.skeleton}`} role="status" aria-label="Memuat banner"><div className={styles.skeletonCopy} aria-hidden="true"><i /><i /><i /><i /></div></div></section>;
  if (!slides.length) return null;

  return (
    <section
      className={styles.hero}
      aria-label="Promosi Hiru Academy"
      aria-roledescription={hasMultiple ? "carousel" : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
      onKeyDown={(event) => {
        if (!hasMultiple) return;
        if (event.key === "ArrowLeft") { event.preventDefault(); goBy(-1); }
        if (event.key === "ArrowRight") { event.preventDefault(); goBy(1); }
      }}
      onTouchStart={(event) => {
        const touch = event.touches[0];
        touchStart.current = { x: touch.clientX, y: touch.clientY };
      }}
      onTouchEnd={(event) => {
        if (!hasMultiple || !touchStart.current) return;
        const touch = event.changedTouches[0];
        const dx = touch.clientX - touchStart.current.x;
        const dy = touch.clientY - touchStart.current.y;
        if (Math.abs(dx) >= 44 && Math.abs(dx) > Math.abs(dy) * 1.3) goBy(dx < 0 ? 1 : -1);
        touchStart.current = null;
      }}
    >
      <div className={styles.viewport}>
        {slides.map((slide, position) => {
          const active = activeIndex === position;
          return (
            <article
              key={slide.id}
              className={`${styles.slide} ${active ? styles.active : ""}`}
              aria-hidden={!active}
              aria-label={`${position + 1} dari ${slides.length}: ${slide.title}`}
            >
              <div className={styles.art}>
                <Image
                  src={slide.desktopSrc}
                  alt={slide.imageAlt}
                  fill
                  preload={position === 0}
                  sizes="100vw"
                  className={`${styles.image} ${slide.mobileSrc ? styles.desktopImage : ""}`}
                />
                {slide.mobileSrc && (
                  <Image
                    src={slide.mobileSrc}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 100vw, 1px"
                    className={`${styles.image} ${styles.mobileImage}`}
                  />
                )}
              </div>
              <div className={styles.content} data-desktop-position={slide.desktopPosition || "left"} data-mobile-position={slide.mobilePosition || "left"} style={{ "--overlay-offset": `${slide.offsetY || 0}%` } as React.CSSProperties}>
                <div className={styles.copy}>
                  {slide.showOverlay !== false && <>
                    {slide.eyebrow && <p className={styles.eyebrow}>{slide.eyebrow}</p>}
                    <h1>{headlineParts(slide.title, slide.titleHighlights).map((part, i) => <span key={i} className={part.orange ? styles.headlineOrange : undefined}>{part.text}</span>)}</h1>
                    {slide.description && <p className={styles.description}>{slide.description}</p>}
                  </>}
                  {(slide.primaryLabel && slide.primaryHref || slide.secondaryLabel && slide.secondaryHref) && (
                    <BannerActions key={`${slide.desktopPosition}-${slide.mobilePosition}-${slide.offsetY}`} desktop={slide.ctaOffsetDesktop} mobile={slide.ctaOffsetMobile}>
                      {slide.primaryLabel && slide.primaryHref && <Link href={slide.primaryHref} tabIndex={active ? 0 : -1} className={styles.primary}>{slide.primaryLabel}<span aria-hidden="true">↗</span></Link>}
                      {slide.secondaryLabel && slide.secondaryHref && <Link href={slide.secondaryHref} tabIndex={active ? 0 : -1} className={styles.secondary}>{slide.secondaryLabel}<span aria-hidden="true">→</span></Link>}
                    </BannerActions>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {hasMultiple && (
        <div className={styles.controls}>
          <button className={`${styles.arrow} ${styles.previous}`} type="button" aria-label="Slide sebelumnya" onClick={() => goBy(-1)}>‹</button>
          <div className={styles.dots} role="group" aria-label="Pilih banner">
            {slides.map((slide, i) => (
              <button key={slide.id} type="button" aria-label={`Tampilkan slide ${i + 1}`} aria-current={activeIndex === i ? "true" : undefined} className={`${styles.dot} ${activeIndex === i ? styles.dotActive : ""}`} onClick={() => goTo(i)} />
            ))}
          </div>
          <button className={`${styles.arrow} ${styles.next}`} type="button" aria-label="Slide berikutnya" onClick={() => goBy(1)}>›</button>
        </div>
      )}
    </section>
  );
}
