import assert from "node:assert/strict";
import test from "node:test";
import { isSafeImageUrl, parseArticleBody } from "../src/lib/blog-parser.ts";

test("isSafeImageUrl permits relative and http/https URLs, rejects dangerous schemes", () => {
  assert.equal(isSafeImageUrl("/brand/hiru-bawah.png"), true);
  assert.equal(isSafeImageUrl("https://cdn.example.test/image.png"), true);
  assert.equal(isSafeImageUrl("http://example.test/image.png"), true);
  assert.equal(isSafeImageUrl("javascript:alert(1)"), false);
  assert.equal(isSafeImageUrl("data:image/png;base64,123"), false);
  assert.equal(isSafeImageUrl("//protocol-relative.test/x.png"), false);
  assert.equal(isSafeImageUrl("https://user:pass@example.test/x.png"), false);
  assert.equal(isSafeImageUrl(null), false);
  assert.equal(isSafeImageUrl(""), false);
});

test("parseArticleBody parses markdown images, headings, lists, and paragraphs", () => {
  const content = `
Ini adalah paragraf pembuka artikel panduan belajar.

## Strategi Belajar JLPT

Berikut tips utama yang bisa diterapkan:
- Menghafal 10 kosakata baru per hari
- Mengulang grammar dengan flashcards
- Latihan mendengarkan soal choukai

![Alur Belajar Mandiri](https://cdn.example.test/flow.png "Diagram alur belajar mandiri")

### Rekomendasi Modul

Pelajari modul dasar sebelum mencoba soal ujian.

1. Buka modul tata bahasa
2. Kerjakan kuis mini
3. Ulangi jika belum lulus

<img src="/brand/hiru-bawah.png" alt="Logo Resmi HIRU" />
`.trim();

  const blocks = parseArticleBody(content);
  assert.equal(blocks.length, 9);

  assert.equal(blocks[0].type, "paragraph");
  assert.match(blocks[0].text, /Ini adalah paragraf/);

  assert.equal(blocks[1].type, "h2");
  assert.equal(blocks[1].text, "Strategi Belajar JLPT");

  assert.equal(blocks[2].type, "paragraph");
  assert.match(blocks[2].text, /Berikut tips utama/);

  assert.equal(blocks[3].type, "bulleted-list");
  assert.deepEqual(blocks[3].items, [
    "Menghafal 10 kosakata baru per hari",
    "Mengulang grammar dengan flashcards",
    "Latihan mendengarkan soal choukai",
  ]);

  assert.equal(blocks[4].type, "image");
  assert.equal(blocks[4].url, "https://cdn.example.test/flow.png");
  assert.equal(blocks[4].alt, "Alur Belajar Mandiri");
  assert.equal(blocks[4].caption, "Diagram alur belajar mandiri");

  assert.equal(blocks[5].type, "h3");
  assert.equal(blocks[5].text, "Rekomendasi Modul");

  assert.equal(blocks[6].type, "paragraph");
  assert.match(blocks[6].text, /Pelajari modul dasar/);

  assert.equal(blocks[7].type, "numbered-list");
  assert.deepEqual(blocks[7].items, [
    "Buka modul tata bahasa",
    "Kerjakan kuis mini",
    "Ulangi jika belum lulus",
  ]);

  assert.equal(blocks[8].type, "image");
  assert.equal(blocks[8].url, "/brand/hiru-bawah.png");
  assert.equal(blocks[8].alt, "Logo Resmi HIRU");
});

test("parseArticleBody handles JSON serialized blocks", () => {
  const json = JSON.stringify([
    { id: "1", type: "h2", text: "Judul JSON" },
    { id: "2", type: "image", url: "https://example.test/pic.png", alt: "Alt JSON", caption: "Cap JSON" },
  ]);
  const blocks = parseArticleBody(json);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].type, "h2");
  assert.equal(blocks[1].type, "image");
  assert.equal(blocks[1].url, "https://example.test/pic.png");
});
