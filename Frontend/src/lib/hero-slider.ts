import type { HeroBannerSlide } from "@/components/hero-banner-slider";
import { contentMedia } from "@/lib/public-content-api";

export type HeroSliderSlide = HeroBannerSlide & {
  internalTitle: string;
  order: number;
  active: boolean;
  mobileSrc: string;
  imageAlt: string;
  eyebrow: string;
  description: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
  showOverlay: boolean;
  showPrimary: boolean;
  showSecondary: boolean;
  desktopPosition: "left" | "center" | "right";
  mobilePosition: "left" | "center" | "right";
  offsetY: number;
  desktopSrc_resolved_url?: string;
  mobileSrc_resolved_url?: string;
};
export type HeroSliderConfig = { slides: HeroSliderSlide[]; autoplay: boolean; intervalMs: number };

export function sliderSlides(config: HeroSliderConfig, includeInactive = false): HeroBannerSlide[] {
  return [...config.slides].filter(slide => includeInactive || slide.active).sort((a, b) => a.order - b.order).map(slide => ({
    ...slide,
    desktopSrc: slide.desktopSrc.startsWith("/") ? slide.desktopSrc : contentMedia(slide.desktopSrc_resolved_url || slide.desktopSrc),
    mobileSrc: slide.mobileSrc.startsWith("/") ? slide.mobileSrc : contentMedia(slide.mobileSrc_resolved_url || slide.mobileSrc),
    primaryLabel: slide.showPrimary ? slide.primaryLabel : "",
    secondaryLabel: slide.showSecondary ? slide.secondaryLabel : "",
  }));
}
export function isHeroSlider(value: unknown): value is HeroSliderConfig {
  if (!value || typeof value !== "object") return false;
  const config = value as HeroSliderConfig;
  return typeof config.autoplay === "boolean" && Number.isInteger(config.intervalMs) && config.intervalMs >= 3000 && config.intervalMs <= 60000 && Array.isArray(config.slides) && config.slides.length <= 20 && config.slides.every(slide =>
    slide && ["id", "internalTitle", "desktopSrc", "mobileSrc", "imageAlt", "eyebrow", "title", "description", "primaryLabel", "primaryHref", "secondaryLabel", "secondaryHref"].every(key => typeof slide[key as keyof HeroSliderSlide] === "string") &&
    [slide.active, slide.showOverlay, slide.showPrimary, slide.showSecondary].every(flag => typeof flag === "boolean") &&
    [slide.desktopPosition, slide.mobilePosition].every(position => ["left", "center", "right"].includes(position)) && Number.isInteger(slide.order) && Number.isInteger(slide.offsetY) && Math.abs(slide.offsetY) <= 10);
}
