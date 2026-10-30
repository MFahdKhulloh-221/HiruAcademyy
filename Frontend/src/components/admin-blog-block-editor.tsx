"use client";

import { useState } from "react";
import { BlogArticleBody } from "./blog-article-body";
import { AdminMediaUpload } from "./admin-media-upload";
import { AdminDialog } from "./admin-primitives";
import { blockLabels, readEditableBody, serializeEditableBody, type BlockKind, type EditableBlock } from "@/lib/blog-block-editor";
import styles from "./admin-blog-studio.module.css";

function BlockIcon({ type }: { type: BlockKind }) {
  if (type === "paragraph" || type === "h2" || type === "h3") return <span aria-hidden="true">{type === "paragraph" ? "\u00b6" : type.toUpperCase()}</span>;
  const paths = { "bulleted-list": "M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1", "numbered-list": "M10 6h11M10 12h11M10 18h11M3 4h1v4M3 11h3l-3 4h3M3 18h3v3H3", link: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2", image: "M3 3h18v18H3zM3 17l6-6 4 4 3-3 5 5M8 7h.01" };
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[type]} /></svg>;
}

export function AdminBlogBlockEditor({ body, onChange }: { body: string; onChange: (body: string) => void }) {
  const blocks = readEditableBody(body);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [activeType, setActiveType] = useState<BlockKind | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  if (!blocks) return <section aria-label="Isi artikel"><h2>Isi artikel tersimpan</h2><p>Mode kompatibilitas: konten asli tetap utuh. Format ini belum dapat diedit tanpa risiko kehilangan isi. Pengaturan artikel tetap dapat disimpan.</p><BlogArticleBody body={body} /></section>;
  const commit = (next: EditableBlock[]) => onChange(serializeEditableBody(next));
  const change = (index: number, fields: Partial<EditableBlock>) => commit(blocks.map((block, position) => position === index ? { ...block, ...fields } : block));
  function add(type: BlockKind, after: number) {
    const block: EditableBlock = { id: crypto.randomUUID(), type, ...(type.endsWith("list") ? { items: [""] } : { text: "" }), ...(type === "link" ? { url: "" } : {}) };
    setActiveType(type);
    setActiveIndex(after + 1);
    commit([...blocks!.slice(0, after + 1), block, ...blocks!.slice(after + 1)]);
  }
  function move(index: number, offset: number) {
    const next = [...blocks!];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    commit(next);
  }
  const toolbar = <div className={styles.documentToolbar} role="group" aria-label="Pilih jenis konten">{Object.entries(blockLabels).map(([type, label]) => <button type="button" key={type} className={styles.iconButton} title={label} aria-label={label} aria-pressed={activeType === type} onClick={() => add(type as BlockKind, Math.min(activeIndex ?? blocks.length - 1, blocks.length - 1))}><BlockIcon type={type as BlockKind} /><span className={styles.toolTip}>{label}</span></button>)}</div>;
  return <section aria-label="Editor blok" className={`${styles.blocks} ${styles.documentEditor}`}>{toolbar}<div className={styles.documentPaper}>{blocks.map((block, index) => <section className={styles.block} key={index} onFocusCapture={() => { setActiveType(block.type); setActiveIndex(index); }} aria-label={`Blok ${index + 1}: ${blockLabels[block.type]}`}>
    <header className={styles.blockActions}><strong>{index + 1}. {blockLabels[block.type]}</strong><button type="button" title="Pindah ke atas" aria-label={`Pindah blok ${index + 1} ke atas`} disabled={index === 0} onClick={() => move(index, -1)}>&uarr;</button><button type="button" title="Pindah ke bawah" aria-label={`Pindah blok ${index + 1} ke bawah`} disabled={index === blocks.length - 1} onClick={() => move(index, 1)}>&darr;</button><button type="button" title="Hapus blok" aria-label={`Hapus blok ${index + 1}`} onClick={() => setRemoving(index)}>&times;</button></header>
    {block.type === "image" ? <><BlogArticleBody body={JSON.stringify([block])} /><AdminMediaUpload kind="image" buttonLabel={block.url ? "Ganti Gambar Artikel" : "Unggah Gambar Artikel"} onUploaded={(path, url) => change(index, { url, mediaPath: path })} /><label>Teks alternatif<input value={block.alt || ""} onChange={event => change(index, { alt: event.target.value })} placeholder="Jelaskan isi gambar untuk pembaca" /></label><label>Keterangan gambar<input value={block.caption || ""} onChange={event => change(index, { caption: event.target.value })} /></label>{block.url && <button type="button" onClick={() => change(index, { url: "", mediaPath: "" })}>Hapus referensi gambar</button>}</> : block.type.endsWith("list") ? <><ol className={styles.blockItems} style={{ listStyleType: block.type === "bulleted-list" ? "disc" : "decimal" }}>{block.items?.map((item, itemIndex) => <li key={itemIndex}><label>Item {itemIndex + 1}<textarea rows={2} value={item} onChange={event => change(index, { items: block.items!.map((value, position) => position === itemIndex ? event.target.value : value) })} placeholder="Tulis isi poin…" /></label><button type="button" disabled={block.items!.length === 1} aria-label={`Hapus item ${itemIndex + 1}`} onClick={() => change(index, { items: block.items!.filter((_, position) => position !== itemIndex) })}>Hapus item</button></li>)}</ol><button type="button" onClick={() => change(index, { items: [...block.items!, ""] })}>Tambah item</button></> : <><label>{blocks.length === 1 && block.type === "paragraph" ? "Isi artikel" : block.type === "link" ? "Teks tautan" : blockLabels[block.type]}{block.type === "paragraph" ? <textarea aria-label={blocks.length === 1 ? "Isi artikel" : "Paragraf"} rows={6} value={block.text || ""} onChange={event => change(index, { text: event.target.value })} placeholder="Mulai menulis paragraf…" /> : <input value={block.text || ""} onChange={event => change(index, { text: event.target.value })} placeholder={block.type === "link" ? "Teks yang dibaca pengunjung" : "Tulis judul bagian…"} />}</label>{block.type === "link" && <label>URL tujuan<input aria-label="URL tujuan" type="url" value={block.url || ""} onChange={event => change(index, { url: event.target.value })} placeholder="https://contoh.id atau /blog" /><small>Gunakan https://, http://, atau alamat internal dengan awalan /.</small></label>}</>}
  </section>)}</div>
    <AdminDialog open={removing !== null} title="Hapus blok konten?" close={() => setRemoving(null)} actions={<><button type="button" className="button" onClick={() => setRemoving(null)}>Batal</button><button type="button" className="button" onClick={() => { if (removing !== null) commit(blocks.filter((_, index) => index !== removing)); setRemoving(null); }}>Hapus blok</button></>}><p>Isi blok akan dihapus dari tulisan. Artikel server belum berubah sampai Anda menyimpan.</p></AdminDialog>
  </section>;
}
