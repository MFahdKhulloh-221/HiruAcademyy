"use client";

import { useEffect, useId, useRef, useState } from "react";
import { adminMediaUrl, mediaAccept, uploadAdminMedia, videoEmbed, type MediaKind } from "@/lib/admin-media";

export function AdminVideoPreview({ value, resolved, title }: { value: string; resolved?: string | null; title: string }) {
  const embed = videoEmbed(value);
  const url = adminMediaUrl(value, resolved);
  return embed ? <iframe src={embed} title={title} allowFullScreen style={{ width: "100%", aspectRatio: "16 / 9", border: 0 }} /> : url ? <video src={url} controls preload="metadata" aria-label={title} style={{ width: "100%", maxHeight: 360 }} /> : null;
}

export function AdminMediaUpload({ kind, onUploaded, label }: { kind: MediaKind; onUploaded: (path: string, url: string) => void; label?: string }) {
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const uploading = useRef(false);
  useEffect(() => {
    const form = input.current?.form;
    const block = (event: SubmitEvent) => { if (uploading.current) { event.preventDefault(); event.stopImmediatePropagation(); } };
    form?.addEventListener("submit", block, true);
    return () => form?.removeEventListener("submit", block, true);
  }, []);
  return <div className="admin-field">{label && <label htmlFor={inputId}>{label}</label>}<input id={inputId} ref={input} aria-label={label ? undefined : `Upload ${kind}`} type="file" accept={mediaAccept[kind]} disabled={busy} onChange={async event => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file || uploading.current) return;
    uploading.current = true; setBusy(true); setError("");
    try { const media = await uploadAdminMedia(file, kind); onUploaded(media.path, media.url); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Upload gagal."); }
    finally { uploading.current = false; setBusy(false); }
  }} />{busy && <p role="status">Mengunggah…</p>}{error && <p role="alert">{error}</p>}</div>;
}
