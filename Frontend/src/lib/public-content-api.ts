"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { formatProgramPrice } from "@/lib/format-program-price";
import { parseTestimonialVideo } from "@/lib/testimonial-video";

export type SenseiContent = { id: number; name: string; role: string; bio: string; photo: string; photo_resolved_url?: string | null; expertise: string[]; level: string | null; active?: boolean; sort_order?: number };
export type TestimonialContent = { id: number; created_at?: string | null; name: string; context: string; quote: string; image: string | null; image_resolved_url?: string | null; type: "text" | "video"; title: string | null; video_url: string | null; video_url_resolved_url?: string | null; video_title: string | null; video_thumbnail: string | null; video_thumbnail_resolved_url?: string | null; show_on_testimonials: boolean; published?: boolean; landing?: boolean; sort_order?: number };
export type ArticleContent = { id: number; title: string; slug: string; excerpt: string | null; body: string; thumbnail: string | null; category: string; seo_title: string | null; meta_description: string | null; featured: boolean; published_at: string | null; author: string; published?: boolean };
export type ShowcaseContent = { id: number; key: string; label: string; image_src: string; alt: string; visible?: boolean; sort_order?: number };
export type PublicOffer = { program: { code: string; slug: string; name: string }; plan_code: string; base_price: number; effective_price: number; currency: string; duration_months: number; discount_percent: number };
export type PublicProgram = { code: string; slug: string; name: string; family: string };

export function useContent<T>(path: string, single = false) {
  const key = JSON.stringify([path, single]);
  const [state, setState] = useState<{ key: string; data: T[]; loading: boolean; error: string }>({ key, data: [], loading: true, error: "" });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => {
    setState(current => current.key === key ? { ...current, loading: current.data.length === 0, error: "" } : { key, data: [], loading: true, error: "" });
    setVersion(value => value + 1);
  }, [key]);
  const current = state.key === key ? state : { data: [], loading: true, error: "" };
  useEffect(() => {
    const controller = new AbortController();
    apiRequest<{ data: T[] }>(path, { signal: controller.signal }).then(result => {
      const data = single && result.data && typeof result.data === "object" && !Array.isArray(result.data) ? [result.data as unknown as T] : result.data;
      if (!Array.isArray(data)) throw new Error("Respons konten tidak valid.");
      if (!controller.signal.aborted) setState({ key, data, loading: false, error: "" });
    }).catch(error => {
      if (controller.signal.aborted) return;
      if (error instanceof Error && (error.name === "AbortError" || error.message.toLowerCase().includes("abort"))) {
        reload();
        return;
      }
      setState({ key, data: [], loading: false, error: error instanceof Error ? error.message : "Konten gagal dimuat." });
    });
    return () => controller.abort();
  }, [path, version, single, reload, key]);
  return { data: current.data, loading: current.loading, error: current.error, reload };
}

const aliases: Record<string, string> = { imageSrc: "image_src", order: "sort_order", videoUrl: "video_url", videoTitle: "video_title", seoTitle: "seo_title", metaDescription: "meta_description", publishedAt: "published_at" };
export function decodeContent<T>(item: Record<string, unknown>): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) result[Object.keys(aliases).find(alias => aliases[alias] === key) ?? key] = value ?? "";
  result.id = String(item.id);
  if (typeof result.level === "string") result.level = result.level.toUpperCase();
  return result as T;
}
export function encodeContent(item: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    if (key === "id") continue;
    result[aliases[key] ?? key] = key === "level" ? (typeof value === "string" && value ? value.toLowerCase() : null) : ["publishedAt", "videoUrl", "videoTitle", "image", "thumbnail"].includes(key) && value === "" ? null : value;
  }
  return result;
}

export function contentMedia(value: string | null | undefined, resolved?: string | null): string {
  const source = resolved || value;
  if (!source) return "";
  if (/[\u0000-\u0020\u007f\\]/.test(source) || source.startsWith("//")) return "";
  try {
    const url = /^[a-z][a-z\d+.-]*:/i.test(source) ? new URL(source) : new URL(source, `${process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "")}/storage/`);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

export function testimonialVideo(value: string | null | undefined, resolved?: string | null) {
  return parseTestimonialVideo(contentMedia(value, resolved));
}

export function offerPrice(offer: PublicOffer | undefined) {
  return offer ? `${formatProgramPrice(offer.effective_price)}${offer.effective_price > 0 ? `/${offer.duration_months} bulan` : ""}` : "Belum tersedia";
}
