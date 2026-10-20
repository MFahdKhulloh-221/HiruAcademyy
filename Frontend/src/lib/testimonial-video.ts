export type VideoSource = { kind: "youtube" | "drive" | "instagram" | "native"; src: string; href: string };

export function parseTestimonialVideo(source: string): VideoSource | null {
  if (!source || /[\u0000-\u0020\u007f\\]/.test(source)) return null;
  try {
    let decoded = source;
    for (let pass = 0; pass < 3; pass++) decoded = decodeURIComponent(decoded);
    if (/[\u0000-\u0020\u007f\\%]/.test(decoded)) return null;
    const url = new URL(source);
    if (url.username || url.password || !["https:", "http:"].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    const path = url.pathname.replace(/\/$/, "");
    const providerHost = ["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com", "youtu.be", "instagram.com", "www.instagram.com", "drive.google.com"].includes(host);
    if (providerHost && url.port) return null;
    const youtube = ["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(host);
    if (youtube || host === "youtu.be") {
      if (url.protocol !== "https:") return null;
      const id = host === "youtu.be" ? path.slice(1) : path === "/watch" ? url.searchParams.get("v") : /^\/(?:embed|shorts)\/([^/]+)$/.exec(path)?.[1];
      return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? { kind: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}`, href: `https://www.youtube.com/watch?v=${id}` } : null;
    }
    if (["instagram.com", "www.instagram.com"].includes(host)) {
      if (url.protocol !== "https:" || !/^\/(?:reel|reels|p|tv)\/[A-Za-z0-9_-]+$/.test(path)) return null;
      return { kind: "instagram", src: "", href: `https://www.instagram.com${path}/` };
    }
    if (host === "drive.google.com") {
      if (url.protocol !== "https:") return null;
      const id = /^\/file\/d\/([A-Za-z0-9_-]+)(?:\/(?:view|preview))?$/.exec(path)?.[1] ?? (path === "/open" ? url.searchParams.get("id") : null);
      return id && /^[A-Za-z0-9_-]{10,200}$/.test(id) ? { kind: "drive", src: `https://drive.google.com/file/d/${id}/preview`, href: `https://drive.google.com/file/d/${id}/view` } : null;
    }
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(host);
    if (url.protocol !== "https:" && !local) return null;
    return /\.(mp4|webm)$/i.test(path) ? { kind: "native", src: url.href, href: url.href } : null;
  } catch { return null; }
}
