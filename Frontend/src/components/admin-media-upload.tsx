"use client";

import { useEffect, useId, useRef, useState } from "react";
import { adminMediaUrl, mediaAccept, uploadAdminMedia, videoEmbed, type MediaKind } from "@/lib/admin-media";

export function AdminVideoPreview({ value, resolved, title }: { value: string; resolved?: string | null; title: string }) {
  const embed = videoEmbed(value);
  const url = adminMediaUrl(value, resolved);
  return embed ? <iframe src={embed} title={title} allowFullScreen style={{ width: "100%", aspectRatio: "16 / 9", border: 0 }} /> : url ? <video src={url} controls preload="metadata" aria-label={title} style={{ width: "100%", maxHeight: 360 }} /> : null;
}

export function AdminMediaUpload({ kind, onUploaded, label, buttonLabel }: { kind: MediaKind; onUploaded: (path: string, url: string) => void; label?: string; buttonLabel?: string }) {
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const uploading = useRef(false);
  const onUploadedRef = useRef(onUploaded);
  useEffect(() => { onUploadedRef.current = onUploaded; }, [onUploaded]);
  useEffect(() => {
    const form = input.current?.form;
    const block = (event: SubmitEvent) => { if (uploading.current) { event.preventDefault(); event.stopImmediatePropagation(); } };
    form?.addEventListener("submit", block, true);
    return () => form?.removeEventListener("submit", block, true);
  }, []);
  return <div className="admin-field">{label && !buttonLabel && <label htmlFor={inputId}>{label}</label>}{buttonLabel && <button type="button" className="button" disabled={busy} onClick={() => input.current?.click()}>{buttonLabel}</button>}<input hidden={Boolean(buttonLabel)} tabIndex={buttonLabel ? -1 : undefined} id={inputId} ref={input} aria-label={buttonLabel || (label ? undefined : `Upload ${kind}`)} type="file" accept={mediaAccept[kind]} aria-describedby={error ? `${inputId}-error` : undefined} aria-invalid={Boolean(error)} disabled={busy} onChange={async event => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file || uploading.current) return;
    uploading.current = true; setBusy(true); setError("");
    try { const media = await uploadAdminMedia(file, kind); onUploadedRef.current(media.path, media.url); }
    catch (cause) { setError(kind === "image" && cause instanceof Error && cause.message.includes("format yang didukung") ? "Format gambar tidak didukung. Pilih JPEG, PNG, atau WebP yang tidak kosong." : cause instanceof Error ? cause.message : "Unggah gagal. Silakan coba lagi."); }
    finally { uploading.current = false; setBusy(false); }
  }} />{busy && <p role="status">Mengunggah…</p>}{error && <p id={`${inputId}-error`} role="alert">{error}</p>}</div>;
}
