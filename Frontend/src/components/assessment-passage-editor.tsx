"use client";

import { useEffect, useRef } from "react";
import { AdminMediaUpload } from "@/components/admin-media-upload";
import { PlacementTextEditor } from "@/components/placement-rich-text";
import { AssessmentContent } from "@/components/assessment-content";
import type { AdminAssessment } from "@/components/admin-assessment-fixtures";
import type { AssessmentPassageBlock } from "@/lib/assessment-image";
import { legacyPassageBlocks, passageBlocksBody, passageBlocksError } from "@/lib/assessment-passage-blocks";
import styles from "./assessment-passage-editor.module.css";

type Passage = NonNullable<AdminAssessment["passages"]>[number];

export function AssessmentPassageEditor({ passage, disabled, imagesEnabled, onChange, onBusyChange }: { passage: Passage; disabled: boolean; imagesEnabled: boolean; onChange: (passage: Passage) => void; onBusyChange: (busy: boolean) => void }) {
  const current = useRef(passage);
  useEffect(() => { current.current = passage; }, [passage]);
  function change(blocks: AssessmentPassageBlock[]) {
    onChange({ ...current.current, blocks, body: passageBlocksBody(blocks), image: null, image_alt: null, image_resolved_url: null, image_position: "before" });
  }
  if (passage.blocks == null) return <>
    <PlacementTextEditor shared disabled={disabled} label="Bacaan Bersama" value={passage.body} onChange={body => onChange({ ...passage, body })} />
    <button type="button" className="button" disabled={disabled || !imagesEnabled} onClick={() => change(legacyPassageBlocks(passage))}>Susun teks dan gambar</button>
  </>;
  const blocks = passage.blocks;
  const error = passageBlocksError(blocks);
  function update(index: number, block: AssessmentPassageBlock) {
    change(current.current.blocks!.map((item, position) => position === index ? block : item));
  }
  function move(index: number, offset: number) {
    const next = [...blocks];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    change(next);
  }
  return <fieldset className={styles.editor} disabled={disabled} aria-label="Susunan teks dan gambar bacaan">
    <legend>Susunan teks dan gambar</legend>
    <p>Minimal satu blok teks. Urutan di bawah sama dengan tampilan siswa.</p>
    {blocks.map((block, index) => <section key={index} className={styles.block} aria-label={`Blok ${index + 1}`}>
      <div className={styles.controls}><strong>{index + 1}. {block.type === "text" ? "Teks" : "Gambar"}</strong>
        <button type="button" className="button" aria-label={`Naikkan blok ${index + 1}`} disabled={index === 0} onClick={() => move(index, -1)}>Naik</button>
        <button type="button" className="button" aria-label={`Turunkan blok ${index + 1}`} disabled={index === blocks.length - 1} onClick={() => move(index, 1)}>Turun</button>
        <button type="button" className="button" aria-label={`Hapus blok ${index + 1}`} onClick={() => change(blocks.filter((_, position) => position !== index))}>Hapus</button>
      </div>
      {block.type === "text" ? <PlacementTextEditor shared disabled={disabled} label={`Teks bacaan ${index + 1}`} value={block.text} onChange={text => update(index, { ...block, text })} /> : <>
        <fieldset disabled={!imagesEnabled}><AdminMediaUpload kind="image" label={`Gambar bacaan ${index + 1}`} onBusyChange={onBusyChange} onUploaded={(image, image_resolved_url) => { const latest = current.current.blocks?.[index]; if (latest?.type === "image") update(index, { ...latest, image, image_resolved_url }); }} /></fieldset>
        {block.image && <AssessmentContent content={block}>{null}</AssessmentContent>}
        <label className="admin-field">Teks alternatif gambar {index + 1}<input required value={block.image_alt} onChange={event => update(index, { ...block, image_alt: event.target.value })} /></label>
      </>}
    </section>)}
    <div className={styles.controls}>
      <button type="button" className="button" onClick={() => change([...blocks, { type: "text", text: "" }])}>Tambah teks</button>
      <button type="button" className="button" disabled={!imagesEnabled} onClick={() => change([...blocks, { type: "image", image: "", image_alt: "" }])}>Tambah gambar</button>
    </div>
    {error && <p role="status">{error}</p>}
  </fieldset>;
}
