"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { contentMedia, type TestimonialContent } from "@/lib/public-content-api";
import { TestimonialVideoCard } from "@/components/testimonial-video-card";
import styles from "./testimoni.module.css";

export function VideoRecommendation({ item, thumbnailPreview }: { item: TestimonialContent; thumbnailPreview?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const title = item.title || item.video_title || item.name;
  const poster = thumbnailPreview || contentMedia(item.video_thumbnail, item.video_thumbnail_resolved_url);
  function show() {
    setOpen(true);
    dialog.current?.showModal();
  }
  return <>
    <button ref={trigger} type="button" className={styles.recommendation} onClick={show} aria-label={`Tonton ${title}`} aria-haspopup="dialog">
      <span className={styles.thumbnail}>
        {poster && !posterFailed && <Image src={poster} alt="" fill unoptimized sizes="(max-width: 639px) 40vw, 180px" onError={() => setPosterFailed(true)} />}
        <span className={styles.play} aria-hidden="true">▶</span>
      </span>
      <span className={styles.metadata}><strong>{title}</strong><span>{item.name}</span>{item.context && <small>{item.context}</small>}</span>
    </button>
    <dialog ref={dialog} className={styles.dialog} aria-label={title} onClose={() => { setOpen(false); trigger.current?.focus(); }}>
      <div className={styles.dialogHeader}><strong>Video Testimoni</strong><button type="button" onClick={() => dialog.current?.close()} autoFocus>Tutup video</button></div>
      {open && <TestimonialVideoCard title={title} name={item.name} context={item.context} description={item.quote} videoUrl={item.video_url || ""} videoResolvedUrl={item.video_url_resolved_url} thumbnail={item.video_thumbnail} thumbnailResolvedUrl={item.video_thumbnail_resolved_url} />}
    </dialog>
  </>;
}
