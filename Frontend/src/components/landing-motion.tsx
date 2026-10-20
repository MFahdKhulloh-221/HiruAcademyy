"use client";

import { useEffect } from "react";

export function LandingMotion({ selector = "[data-landing-motion]" }: { selector?: string }) {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(selector);
    if (!root) return;

    const revealTargets = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (root.matches("[data-reveal]")) revealTargets.unshift(root);
    const counters = Array.from(root.querySelectorAll<HTMLElement>("[data-counter]"));
    const showcase = root.querySelector<HTMLElement>(".lms-showcase-viewport");
    const showcaseTrack = showcase?.querySelector<HTMLElement>(".lms-showcase-track");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let showcaseFrame = 0;
    let showcaseResumeTimer = 0;
    let showcasePaused = false;

    const pauseShowcase = () => {
      showcasePaused = true;
      window.clearTimeout(showcaseResumeTimer);
      showcaseResumeTimer = window.setTimeout(() => { showcasePaused = false; }, 1500);
    };
    const animateShowcase = () => {
      if (showcase && showcaseTrack && !showcasePaused) {
        showcase.scrollLeft += 0.5;
        if (showcase.scrollLeft >= showcaseTrack.scrollWidth / 2) showcase.scrollLeft = 0;
      }
      showcaseFrame = requestAnimationFrame(animateShowcase);
    };

    showcase?.addEventListener("wheel", pauseShowcase);
    showcase?.addEventListener("touchstart", pauseShowcase);
    showcase?.addEventListener("pointerdown", pauseShowcase);
    if (!reducedMotion && showcase && showcaseTrack) showcaseFrame = requestAnimationFrame(animateShowcase);

    if (reducedMotion || !("IntersectionObserver" in window)) {
      revealTargets.forEach((target) => target.dataset.revealed = "true");
      return () => {
        cancelAnimationFrame(showcaseFrame);
        window.clearTimeout(showcaseResumeTimer);
        showcase?.removeEventListener("wheel", pauseShowcase);
        showcase?.removeEventListener("touchstart", pauseShowcase);
        showcase?.removeEventListener("pointerdown", pauseShowcase);
      };
    }

    root.dataset.motionReady = "true";
    const formatCounter = (counter: HTMLElement, value: number) => {
      const decimals = Number(counter.dataset.decimals ?? 0);
      const number = counter.dataset.locale
        ? value.toLocaleString(counter.dataset.locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
        : String(Math.round(value));
      return `${number}${counter.dataset.suffix ?? ""}`;
    };
    counters.forEach((counter) => { counter.textContent = formatCounter(counter, 0); });

    const frames = new Set<number>();
    const animatedCounters = new Set<HTMLElement>();

    const animateCounter = (counter: HTMLElement) => {
      if (animatedCounters.has(counter)) return;
      animatedCounters.add(counter);

      const target = Number(counter.dataset.counter);
      const duration = 1400;
      const start = performance.now();

      const update = (now: number) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        counter.textContent = formatCounter(counter, target * eased);
        if (progress < 1) {
          const nextFrame = requestAnimationFrame(update);
          frames.add(nextFrame);
        }
      };

      const firstFrame = requestAnimationFrame(update);
      frames.add(firstFrame);
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const target = entry.target as HTMLElement;
        target.dataset.revealed = "true";
        target.querySelectorAll<HTMLElement>("[data-counter]").forEach(animateCounter);
        observer.unobserve(target);
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -8%" });

    const setupFrame = requestAnimationFrame(() => {
      const paintFrame = requestAnimationFrame(() => {
        revealTargets.forEach((target) => observer.observe(target));
      });
      frames.add(paintFrame);
    });
    frames.add(setupFrame);

    return () => {
      cancelAnimationFrame(showcaseFrame);
      window.clearTimeout(showcaseResumeTimer);
      showcase?.removeEventListener("wheel", pauseShowcase);
      showcase?.removeEventListener("touchstart", pauseShowcase);
      showcase?.removeEventListener("pointerdown", pauseShowcase);
      observer.disconnect();
      frames.forEach(cancelAnimationFrame);
    };
  }, [selector]);

  return null;
}
