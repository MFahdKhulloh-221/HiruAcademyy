"use client";

import { useId, type ReactNode } from "react";
import { TestimonialCard } from "@/components/testimonial-card";
import { VideoRecommendation } from "@/app/testimoni/video-recommendation";
import publicStyles from "@/app/testimoni/testimoni.module.css";
import { testimonialVideo, type TestimonialContent } from "@/lib/public-content-api";

export function TestimonialFields({ value, onChange, disabled, student = false, lockType = false, fieldsDisabled = false, onThumbnailFile, thumbnailInput, errors = {} }: { value: TestimonialContent; onChange: (patch: Partial<TestimonialContent>) => void; disabled?: boolean; student?: boolean; lockType?: boolean; fieldsDisabled?: boolean; thumbnailInput?: ReactNode; errors?: Record<string, string[]>; onThumbnailFile?: (file: File | null) => void }) {
  const id = useId();
  const fieldError = (field: string) => errors[field]?.length ? <small id={`${id}-${field}-error`} role="alert">{errors[field].join(" ")}</small> : null;
  const errorAttributes = (field: string) => ({ "aria-invalid": !!errors[field]?.length, "aria-describedby": errors[field]?.length ? `${id}-${field}-error` : undefined });
  return <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: "grid", gap: 12 }}>
    <label htmlFor={`${id}-type`}>Jenis Testimoni</label><select {...errorAttributes("type")} id={`${id}-type`} value={value.type} disabled={lockType} onChange={event => onChange({ type: event.target.value as "text" | "video" })}><option value="text">Testimoni Tertulis</option><option value="video">Testimoni Video</option></select>{fieldError("type")}
    <fieldset disabled={fieldsDisabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: "grid", gap: 12 }}>
    {value.type === "video" && <><label>URL video<input {...errorAttributes("video_url")} value={value.video_url || ""} maxLength={2048} required onChange={event => onChange({ video_url: event.target.value, video_url_resolved_url: null })} /></label>{fieldError("video_url")}<small>{student ? "Tautan HTTPS YouTube, Instagram, atau Google Drive. Upload file belum didukung." : "URL video yang didukung atau referensi media hasil upload Admin."}</small><label>Judul video{student && " (wajib)"}<input {...errorAttributes("title")} value={value.title || ""} maxLength={255} required onChange={event => onChange({ title: event.target.value })} /></label>{fieldError("title")}{student ? <><label htmlFor={`${id}-thumbnail`}>Thumbnail video</label><input id={`${id}-thumbnail`} type="file" accept="image/png,image/jpeg" aria-invalid={!!errors.video_thumbnail?.length} aria-describedby={`${id}-thumbnail-hint${errors.video_thumbnail?.length ? ` ${id}-video_thumbnail-error` : ""}`} onChange={event => onThumbnailFile?.(event.target.files?.[0] ?? null)} /><small id={`${id}-thumbnail-hint`}>Pilih gambar PNG atau JPG (wajib).</small>{fieldError("video_thumbnail")}</> : thumbnailInput}</>}
    <label htmlFor={`${id}-quote`}>{value.type === "text" ? "Komentar / Pengalaman Belajar" : "Deskripsi pengalaman (opsional)"}</label><textarea {...errorAttributes("quote")} maxLength={student ? 500 : undefined} id={`${id}-quote`} rows={6} value={value.quote} required={value.type === "text"} onChange={event => onChange({ quote: event.target.value })} aria-describedby={`${id}-count${errors.quote?.length ? ` ${id}-quote-error` : ""}`} />
    <small id={`${id}-count`}>{Array.from(value.quote).length}{student ? (value.type === "text" ? "/500 karakter ? minimal 20 karakter untuk teks" : "/500 karakter ? opsional") : " karakter"}</small>{fieldError("quote")}
    </fieldset>
  </fieldset>;
}

export function TestimonialPreview({ value, thumbnailPreview }: { value: TestimonialContent; thumbnailPreview?: string }) {
  const valid = value.title?.trim() && testimonialVideo(value.video_url, value.video_url_resolved_url);
  return <section aria-label="Preview Testimoni"><h2>Preview Testimoni</h2><p>Pratinjau langsung, belum disimpan.</p>{value.type === "text" ? <div className={publicStyles.textGrid}><TestimonialCard key={value.id} testimonial={{ ...value, quote: value.quote || "Komentar pengalaman belajarmu akan tampil di sini." }} /></div> : valid ? <VideoRecommendation key={thumbnailPreview || value.video_thumbnail} item={value} thumbnailPreview={thumbnailPreview} /> : <p>Masukkan judul dan URL video yang valid untuk melihat preview.</p>}</section>;
}
