import { apiRequest } from "@/lib/api";
import type { LandingContent } from "@/lib/admin-website-store";

import { isHeroSlider, type HeroSliderConfig } from "@/lib/hero-slider";
export type LandingHero = LandingContent["hero"] & { slider?: HeroSliderConfig };
export type LandingHeroState = { draft: LandingHero | null; published: LandingHero | null; revision: number };

export function isInternalHeroPath(value: string): boolean {
  return value.length <= 255 && /^(?:\/(?:[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\/?)?(?:#[a-zA-Z][a-zA-Z0-9_-]*)?|#[a-zA-Z][a-zA-Z0-9_-]*)$/.test(value) && !/[\r\n]/.test(value);
}

export function isLandingHero(value: unknown): value is LandingHero {
  if (!value || typeof value !== "object") return false;
  const hero = value as Record<string, unknown>;
  return ["eyebrow", "heading", "support", "primaryCtaLabel", "primaryCtaPath", "secondaryCtaLabel", "secondaryCtaPath"].every(key => typeof hero[key] === "string" && hero[key].trim().length > 0)
    && isInternalHeroPath(hero.primaryCtaPath as string) && isInternalHeroPath(hero.secondaryCtaPath as string)
    && (hero.slider === undefined || isHeroSlider(hero.slider));
}

function readState(value: unknown): LandingHeroState {
  if (!value || typeof value !== "object") throw new Error("Respons Hero tidak valid. Muat ulang data server.");
  const state = value as LandingHeroState;
  if (!Number.isSafeInteger(state.revision) || state.revision < 0 || !(state.draft === null || isLandingHero(state.draft)) || !(state.published === null || isLandingHero(state.published))) throw new Error("Respons Hero tidak valid. Muat ulang data server.");
  return state;
}

export async function fetchLandingHero(signal?: AbortSignal) {
  const response = await apiRequest<{ data: unknown }>("/api/admin/landing/hero", { signal });
  return readState(response.data);
}

export async function saveLandingHero(revision: number, hero: LandingHero) {
  if (!isLandingHero(hero)) throw new Error("Isi seluruh teks dan gunakan path internal untuk CTA.");
  const clean = { ...hero, slider: hero.slider && { ...hero.slider, slides: hero.slider.slides.map(slide => {
    const copy = { ...slide };
    delete copy.desktopSrc_resolved_url;
    delete copy.mobileSrc_resolved_url;
    return copy;
  }) } };
  const response = await apiRequest<{ data: unknown }>("/api/admin/landing/hero/draft", { method: "PATCH", body: JSON.stringify({ revision, hero: clean }) });
  return readState(response.data);
}

export async function publishLandingHero(revision: number) {
  const response = await apiRequest<{ data: unknown }>("/api/admin/landing/hero/publish", { method: "POST", body: JSON.stringify({ revision }) });
  return readState(response.data);
}

export async function fetchPublishedLandingHero(signal: AbortSignal): Promise<LandingHero | null> {
  const response = await apiRequest<{ data: unknown }>("/api/public/landing/hero", { signal });
  if (response.data === null || isLandingHero(response.data)) return response.data;
  throw new Error("Respons Hero publik tidak valid.");
}
