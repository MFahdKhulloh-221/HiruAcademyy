import type { AssessmentImage, AssessmentPassageBlock } from "@/lib/assessment-image";
import { placementText } from "@/lib/placement-rich-text";

export function legacyPassageBlocks(passage: AssessmentImage & { body: string }): AssessmentPassageBlock[] {
  const text: AssessmentPassageBlock = { type: "text", text: passage.body };
  if (!passage.image) return [text];
  const image: AssessmentPassageBlock = { type: "image", image: passage.image, image_alt: passage.image_alt ?? "", image_resolved_url: passage.image_resolved_url };
  return passage.image_position === "after" ? [text, image] : [image, text];
}

export function passageBlocksBody(blocks: AssessmentPassageBlock[]) {
  return blocks.filter(block => block.type === "text").map(block => block.text).join("\n\n");
}

export function passageBlocksError(blocks?: AssessmentPassageBlock[] | null) {
  if (blocks == null) return "";
  if (!Array.isArray(blocks) || blocks.length === 0) return "Tambahkan blok teks bacaan.";
  for (const block of blocks) {
    if (block?.type === "text") {
      if (typeof block.text !== "string" || !placementText(block.text).trim()) return "Isi setiap blok teks bacaan.";
    } else if (block?.type === "image") {
      if (typeof block.image !== "string" || !block.image.trim()) return "Unggah gambar untuk setiap blok gambar.";
      if (typeof block.image_alt !== "string" || !block.image_alt.trim()) return "Isi teks alternatif setiap gambar.";
    } else return "Pilih jenis blok teks atau gambar.";
  }
  if (!blocks.some(block => block.type === "text")) return "Tambahkan minimal satu blok teks bacaan.";
  return "";
}
