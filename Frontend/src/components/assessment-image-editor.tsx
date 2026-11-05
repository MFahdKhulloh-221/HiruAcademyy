"use client";

import { useState } from "react";
import { AdminMediaUpload } from "@/components/admin-media-upload";
import { AssessmentContent } from "@/components/assessment-content";
import type { AssessmentImage } from "@/components/admin-assessment-fixtures";

export function AssessmentImageEditor({ content, enabled, label, group = false, onChange, onBusyChange }: { group?: boolean; content: AssessmentImage; enabled: boolean; label: string; onChange: (image: AssessmentImage) => void; onBusyChange: (busy: boolean) => void }) {
  const [on, setOn] = useState(Boolean(content.image));
  const [uploading, setUploading] = useState(false);
  return <fieldset className="assessment-image-editor" aria-label={label} disabled={!enabled || uploading}>
    <legend>{label}</legend>
    {!enabled && <p role="note">Gambar belum tersedia: schema gambar Try Out belum diterapkan.</p>}
    <label><input type="checkbox" checked={on} onChange={event => { setOn(event.target.checked); if (!event.target.checked) onChange({ image: null, image_alt: null, image_position: "before", image_resolved_url: null }); }} />Gunakan gambar</label>
    {enabled && on && <>
      <AdminMediaUpload kind="image" label={content.image ? "Ganti gambar" : "Upload gambar"} onBusyChange={busy => { setUploading(busy); onBusyChange(busy); }} onUploaded={(image, image_resolved_url) => onChange({ ...content, image, image_resolved_url, image_position: content.image_position ?? "before" })} />
      {content.image && <>
        <AssessmentContent content={content}>{null}</AssessmentContent>
        <label className="admin-field">Teks alternatif gambar<input required value={content.image_alt ?? ""} onChange={event => onChange({ ...content, image_alt: event.target.value })} /></label>
        <fieldset aria-label={group ? "Urutan Stimulus" : "Posisi Gambar"} className="assessment-image-position"><legend>{group ? "Urutan Stimulus" : "Posisi Gambar"}</legend>{(["before", "after"] as const).map(position => <button key={position} type="button" className="button" aria-pressed={(content.image_position ?? "before") === position} onClick={() => onChange({ ...content, image_position: position })}>{group ? position === "before" ? "Gambar → Teks" : "Teks → Gambar" : position === "before" ? "Gambar → Pertanyaan" : "Pertanyaan → Gambar"}</button>)}</fieldset>
        <button type="button" className="button" onClick={() => { setOn(false); onChange({ image: null, image_alt: null, image_position: "before", image_resolved_url: null }); }}>Hapus referensi gambar</button>
      </>}
    </>}
  </fieldset>;
}
