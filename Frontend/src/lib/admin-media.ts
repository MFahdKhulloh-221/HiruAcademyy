import { apiRequest } from "@/lib/api";
import { contentMedia } from "@/lib/public-content-api";

const resolvedMedia = new Map<string, string>();
export function rememberAdminMedia(item: Record<string, unknown>) {
  for (const [key, value] of Object.entries(item)) if (key.endsWith("_resolved_url") && typeof value === "string" && typeof item[key.slice(0, -13)] === "string") resolvedMedia.set(item[key.slice(0, -13)] as string, value);
}

export type MediaKind = "image" | "audio" | "video";
export const mediaAccept = { image: "image/jpeg,image/png,image/webp", audio: "audio/mpeg,audio/wav,audio/x-wav,audio/ogg", video: "video/mp4,video/webm" };
export function validMediaFile(file: File, kind: MediaKind) {
  const extensions = { image: /\.(jpe?g|png|webp)$/i, audio: /\.(mp3|wav|ogg)$/i, video: /\.(mp4|webm)$/i };
  return file.size > 0 && mediaAccept[kind].split(",").includes(file.type) && extensions[kind].test(file.name);
}
export async function uploadAdminMedia(file: File, kind: MediaKind) {
  if (!validMediaFile(file, kind)) throw new Error("Pilih file dengan format yang didukung dan tidak kosong.");
  const body = new FormData();
  body.append("file", file); body.append("kind", kind);
  const media = (await apiRequest<{ data: { path: string; url: string; mime_type: string } }>("/api/admin/media", { method: "POST", body })).data;
  resolvedMedia.set(media.path, media.url);
  return media;
}
export function adminMediaUrl(value: string | null | undefined, resolved?: string | null) {
  return contentMedia(resolved || (value ? resolvedMedia.get(value) : "") || value);
}
export function videoEmbed(value: string) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "";
    const host = url.hostname.toLowerCase();
    const id = host === "youtu.be" ? url.pathname.slice(1).replace(/\/$/, "") : ["youtube.com", "www.youtube.com", "m.youtube.com", "www.youtube-nocookie.com"].includes(host) ? url.pathname === "/watch" ? url.searchParams.get("v") : /^\/(embed|shorts)\//.test(url.pathname) ? url.pathname.split("/")[2] : "" : "";
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : "";
  } catch { return ""; }
}
export function validVideoReference(value: string) {
  if (!value) return true;
  if (videoEmbed(value)) return true;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && /\.(mp4|webm)$/i.test(url.pathname);
  } catch { return /^media\/video\/[a-f0-9-]+\.(mp4|webm)$/i.test(value); }
}
