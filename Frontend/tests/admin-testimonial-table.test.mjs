import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("testimonial cards retain accessible filters, full preview and explicit deletion", () => {
  const source = read("../src/components/admin-testimonial-prototype.tsx");
  assert.match(source, /role="region" aria-label="Daftar testimoni"/);
  assert.match(source, /rows\.slice\(0, visible\)\.map\(item => <article/);
  for (const field of ["item.name", "item.context", "item.quote", "item.title", "publicationLabel(item)"]) assert.ok(source.includes(field), `${field} retained in cards`);
  assert.match(source, /type="search"/);
  assert.match(source, /aria-pressed=\{key === filter\}/);
  assert.match(source, /setVisible\(current => current \+ 10\)/);
  assert.match(source, /title="Detail Testimoni"/);
  assert.match(source, /<VideoRecommendation item=\{view\}/);
  assert.match(source, /<TestimonialCard testimonial=\{view\}/);
  assert.match(source, /title="Hapus Testimoni\?"/);
  assert.match(source, /Penghapusan record bersifat permanen\. Media tidak dihapus/);
  const card = read("../src/components/testimonial-card.tsx");
  assert.match(card, /<StudentAvatar/);
  assert.match(card, /created_at/);
  assert.match(card, /aria-expanded/);
  const video = read("../src/app/testimoni/video-recommendation.tsx");
  assert.match(video, /<dialog/);
  assert.match(video, /trigger\.current\?\.focus\(\)/);
  assert.match(video, /videoResolvedUrl=\{item\.video_url_resolved_url\}/);
});
