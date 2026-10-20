"use client";

import Image from "next/image";
import { useState } from "react";
import { contentMedia, testimonialVideo } from "@/lib/public-content-api";

type Props = { title: string; name: string; context: string; description?: string; videoUrl: string; videoResolvedUrl?: string | null; thumbnail: string | null; thumbnailResolvedUrl?: string | null };

export function TestimonialVideoCard(props: Props) {
  const source = testimonialVideo(props.videoUrl, props.videoResolvedUrl);
  const poster = contentMedia(props.thumbnail, props.thumbnailResolvedUrl);
  const key = `${source?.src}|${poster}`;
  return <VideoCard key={key} {...props} source={source} poster={poster} />;
}

function VideoCard({ title, name, context, description, source, poster }: Props & { source: ReturnType<typeof testimonialVideo>; poster: string }) {
  const [playing, setPlaying] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const externalLabel = source?.kind === "instagram" ? "Tonton di Instagram" : source?.kind === "drive" ? "Buka di Google Drive" : "Buka video";
  return <article className="testimonial-video-card">
    <div className="testimonial-video-frame">
      {!playing || failed || source?.kind === "instagram" ? <>
        {poster && !posterFailed && <Image src={poster} alt={`Thumbnail ${title}`} fill unoptimized sizes="(max-width: 767px) 100vw, 50vw" style={{ objectFit: "cover" }} onError={() => setPosterFailed(true)} />}
        {source && source.kind !== "instagram" && !failed && <button type="button" aria-label={`Putar ${title}`} onClick={() => setPlaying(true)}>▶</button>}
        {(!source || failed) && <p role="status">Video tidak dapat diputar.</p>}
      </> : source?.kind === "native" ? <video controls autoPlay preload="metadata" aria-label={title} poster={poster || undefined} src={source.src} onLoadedData={() => setLoaded(true)} onError={() => setFailed(true)} /> : source && <iframe title={title} src={source.src} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation" allow="fullscreen; picture-in-picture" allowFullScreen onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />}
      {playing && !loaded && !failed && <p className="testimonial-video-loading" role="status">Memuat video…</p>}
    </div>
    <footer><strong>{title}</strong><span>{name}</span><small>{context}</small>{description && <p>{description}</p>}
      {source && <a href={source.href} target="_blank" rel="noopener noreferrer">{externalLabel}</a>}
      {source?.kind === "drive" && <small>File harus dapat diakses oleh orang yang memiliki tautan. Jika preview meminta login, buka di Google Drive.</small>}
    </footer>
  </article>;
}
