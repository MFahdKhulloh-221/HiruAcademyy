import { isSafeImageUrl, parseArticleBody } from "./blog-parser";

export const blockLabels = {
  paragraph: "Paragraf", h2: "Judul Bagian", h3: "Subjudul",
  "bulleted-list": "Daftar Poin", "numbered-list": "Daftar Bernomor", link: "Tautan", image: "Gambar",
} as const;
export type BlockKind = keyof typeof blockLabels;
export type EditableBlock = { id: string; type: BlockKind; text?: string; items?: string[]; url?: string; alt?: string; caption?: string; [key: string]: unknown };

export function readEditableBody(body: string): EditableBlock[] | null {
  if (/^\s*[\[{]/.test(body)) {
    try {
      const parsed: unknown = JSON.parse(body);
      const blocks = Array.isArray(parsed) ? parsed : [parsed];
      if (!blocks.every(block => block && typeof block === "object" && Object.hasOwn(blockLabels, block.type) &&
        (block.id === undefined || typeof block.id === "string") &&
        (block.text === undefined || typeof block.text === "string") &&
        (block.url === undefined || typeof block.url === "string") &&
        (block.alt === undefined || typeof block.alt === "string") && (block.caption === undefined || typeof block.caption === "string") &&
        (block.items === undefined || (Array.isArray(block.items) && block.items.every((item: unknown) => typeof item === "string"))) &&
        (!block.type.endsWith("list") || block.items?.length))) return null;
      return blocks.map((block, index) => ({ ...block, id: block.id || `existing-${index}` }));
    } catch { return null; }
  }
  // ponytail: HTML, images and inline Markdown stay read-only until lossless editing supports them.
  if (/<[^>]*>|!\[|\[[^\]]*\]\([^)]*\).+|.+\[[^\]]*\]\([^)]*\)/.test(body)) return null;
  if (!/^\s*(#{2,3}\s|[-*]\s|\d+\.\s|\[.*\]\()/m.test(body)) return [{ id: "paragraph", type: "paragraph", text: body }];
  const blocks = parseArticleBody(body);
  if (!blocks.every(block => Object.hasOwn(blockLabels, block.type))) return null;
  return blocks as EditableBlock[];
}

export function serializeEditableBody(blocks: EditableBlock[]): string {
  // Keep simple text compatible with existing plain-body clients, without reinterpreting Markdown as text.
  if (blocks.length === 1 && blocks[0].id === "paragraph" && blocks[0].type === "paragraph" && Object.keys(blocks[0]).every(key => ["id", "type", "text"].includes(key))) {
    const text = blocks[0].text || "";
    const parsed = readEditableBody(text);
    if (parsed?.length === 1 && parsed[0].type === "paragraph" && parsed[0].text === text) return text;
  }
  return JSON.stringify(blocks);
}

export function validateEditableBody(body: string): string | null {
  const blocks = readEditableBody(body);
  if (!blocks) return null; // Compatibility bodies are never rewritten or newly authored here.
  for (const block of blocks) {
    if (block.type === "image") {
      if (!isSafeImageUrl(block.url) || !block.alt?.trim()) return "Unggah gambar dan isi teks alternatif sebelum menyimpan.";
      if (/<[^>]*>/.test(`${block.alt}${block.caption || ""}`)) return "Gunakan teks biasa, bukan kode HTML.";
      continue;
    }
    if (block.type === "link" && (!block.text?.trim() || !isSafeImageUrl(block.url))) return "Isi teks tautan dan URL yang valid (https://, http://, atau alamat /).";
    const texts = block.type.endsWith("list") ? block.items || [] : [block.text || ""];
    if (!texts.length || texts.some(text => !text.trim())) return "Isi setiap blok dan item daftar sebelum menyimpan.";
    if (texts.some(text => /<[^>]*>/.test(text))) return "Gunakan teks biasa, bukan kode HTML, dalam konten baru.";
  }
  return blocks.length ? null : "Isi artikel wajib diisi.";
}
