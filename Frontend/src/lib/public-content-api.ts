"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api";

export type SenseiContent = { id: number; name: string; role: string; bio: string; photo: string; photo_resolved_url?: string | null; expertise: string[]; level: string | null; active?: boolean; sort_order?: number };
export type TestimonialContent = { id: number; name: string; context: string; quote: string; image: string | null; image_resolved_url?: string | null; video_url: string | null; video_url_resolved_url?: string | null; video_title: string | null; published?: boolean; landing?: boolean; sort_order?: number };
export type ArticleContent = { id: number; title: string; slug: string; excerpt: string | null; body: string; thumbnail: string | null; category: string; seo_title: string | null; meta_description: string | null; featured: boolean; published_at: string | null; author: string; published?: boolean };
export type ShowcaseContent = { id: number; key: string; label: string; image_src: string; alt: string; visible?: boolean; sort_order?: number };
export type PublicOffer = { program: { code: string; slug: string; name: string }; plan_code: string; base_price: number; effective_price: number; currency: string; duration_months: number; discount_percent: number };
export type PublicProgram = { code: string; slug: string; name: string; family: string };

export function useContent<T>(path: string, single = false) {
  const [state, setState] = useState<{ data: T[]; loading: boolean; error: string }>({ data: [], loading: true, error: "" });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    apiRequest<{ data: T[] }>(path, { signal: controller.signal }).then(result => {
      const data = single && result.data && typeof result.data === "object" && !Array.isArray(result.data) ? [result.data as unknown as T] : result.data;
      if (!Array.isArray(data)) throw new Error("Respons konten tidak valid.");
      if (!controller.signal.aborted) setState({ data, loading: false, error: "" });
    }).catch(error => {
      if (controller.signal.aborted) return;
      if (error instanceof Error && (error.name === "AbortError" || error.message.toLowerCase().includes("abort"))) {
        reload();
        return;
      }
      setState({ data: [], loading: false, error: error instanceof Error ? error.message : "Konten gagal dimuat." });
    });
    return () => controller.abort();
  }, [path, version, single, reload]);
  return { ...state, reload };
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

export function useAdminContent<T extends { id: string }>(resource: string) {
  const remote = useContent<Record<string, unknown>>(`/api/admin/${resource}`);
  const rows = remote.data.map(item => decodeContent<T>(item));
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const mutate = async (item: T, remove = false) => {
    if (locked.current) throw new Error("Permintaan sedang diproses.");
    locked.current = true;
    setBusy(true);
    try {
      const exists = /^\d+$/.test(item.id);
      await apiRequest(`/api/admin/${resource}${exists ? `/${item.id}` : ""}`, { method: remove ? "DELETE" : exists ? "PATCH" : "POST", ...(!remove ? { body: JSON.stringify(encodeContent(item)) } : {}) });
      remote.reload();
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  return { rows, loading: remote.loading, loadError: remote.error, reload: remote.reload, busy, mutate };
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
  const source = contentMedia(value, resolved);
  if (!source) return null;
  const url = new URL(source);
  const youtube = ["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(url.hostname);
  if (youtube || url.hostname === "youtu.be") {
    const id = url.hostname === "youtu.be" ? url.pathname.slice(1) : url.pathname === "/watch" ? url.searchParams.get("v") : /^\/(?:embed|shorts)\/([^/]+)$/.exec(url.pathname)?.[1];
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? { kind: "youtube" as const, src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
  }
  return { kind: "native" as const, src: source };
}

export function offerPrice(offer: PublicOffer | undefined) {
  return offer ? `${new Intl.NumberFormat("id-ID", { style: "currency", currency: offer.currency, maximumFractionDigits: 0 }).format(offer.effective_price)}/${offer.duration_months} bulan` : "Belum tersedia";
}
