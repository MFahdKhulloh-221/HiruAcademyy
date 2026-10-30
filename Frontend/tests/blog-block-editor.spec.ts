import { test, expect } from "./canonical-fixture";
import { readEditableBody, serializeEditableBody, validateEditableBody } from "../src/lib/blog-block-editor";
import { parseArticleBody } from "../src/lib/blog-parser";

const existing = { id: 81, title: "Artikel blok", slug: "blok-tetap", excerpt: "Ringkasan", body: "Paragraf awal", thumbnail: "media/cover.png", thumbnail_resolved_url: "http://127.0.0.1:3415/brand/hiru-atas.png", category: "Tips Belajar", author: "Hiru Academy", featured: true, published: true, published_at: "2026-01-01T00:00:00Z", seo_title: "SEO tetap", meta_description: "Deskripsi tetap" };

test("B2-A adapter lossless boundaries and public parser round trip", () => {
  const json = '[{"id":"original","type":"paragraph","text":"Isi","extension":{"keep":true}}]';
  expect(JSON.parse(serializeEditableBody(readEditableBody(json)!))[0].extension).toEqual({ keep: true });
  for (const raw of ['[{"type":"unknown","text":"Tetap"}]', '<p>HTML lama</p>', '{"blocks":[]}', '[broken', 'Awal [tautan](/blog) akhir']) expect(readEditableBody(raw)).toBeNull();
  const markdown = '## Bagian\n\n### Subbagian\n\n- Satu\n- Dua\n\n1. Pertama\n2. Kedua\n\n[Blog](/blog)';
  const blocks = readEditableBody(markdown)!;
  expect(parseArticleBody(serializeEditableBody(blocks))).toEqual(parseArticleBody(markdown));
  expect(validateEditableBody('[{"type":"link","text":"Bahaya","url":"javascript:alert(1)"}]')).toContain("URL");
  expect(validateEditableBody('[{"type":"paragraph","text":"<script>alert(1)</script>"}]')).toContain("HTML");
});

test("B2-A six blocks edit reorder delete save failure recovery and metadata preservation", async ({ page, request }) => {
  let stored = { ...existing };
  const writes: Record<string, unknown>[] = [];
  let failure = "";
  let release: (() => void) | undefined;
  await page.route("**/api/admin/blog-articles**", async route => {
    if (route.request().method() === "GET") { await route.fulfill({ json: { data: [stored] } }); return; }
    const data = route.request().postDataJSON(); writes.push(data);
    if (failure === "network") { await route.abort("failed"); return; }
    if (failure === "422" || failure === "500") { await route.fulfill({ status: Number(failure), json: { message: "Ditolak", errors: { body: ["Isi ditolak"] } } }); return; }
    if (failure === "pending") await new Promise<void>(resolve => { release = resolve; });
    stored = { ...stored, ...data };
    await route.fulfill({ json: { data: stored } });
  });
  await page.goto("/admin/blog-seo/editor?id=81");
  await page.getByLabel("Isi artikel", { exact: true }).fill("Paragraf revisi\nBaris kedua");
  async function add(name: string) {
    const menu = page.getByRole("group", { name: "Pilih jenis konten", exact: true });
    const tool = menu.getByRole("button", { name, exact: true });
    await expect(tool).toHaveAttribute("title", name);
    await tool.focus();
    await expect(tool).toBeFocused();
    await tool.press("Enter");
  }
  await add("Judul Bagian"); await page.getByRole("textbox", { name: "Judul Bagian", exact: true }).fill("Bagian revisi");
  await add("Subjudul"); await page.getByRole("textbox", { name: "Subjudul", exact: true }).fill("Subjudul revisi");
  for (const kind of ["Daftar Poin", "Daftar Bernomor"]) {
    await add(kind);
    const block = page.getByRole("region", { name: new RegExp(`Blok \\d+: ${kind}`) });
    await block.getByLabel("Item 1", { exact: true }).fill(`${kind} satu`);
    await block.getByRole("button", { name: "Tambah item", exact: true }).click();
    await block.getByLabel("Item 2", { exact: true }).fill(`${kind} dua`);
    await block.getByRole("button", { name: "Tambah item", exact: true }).click();
    await block.getByRole("button", { name: "Hapus item 3", exact: true }).click();
  }
  await add("Tautan");
  await page.getByLabel("Teks tautan", { exact: true }).fill("Baca Blog");
  await page.getByLabel("URL tujuan", { exact: true }).fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Simpan Perubahan", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Isi teks tautan" })).toContainText("URL"); expect(writes).toHaveLength(0);
  await page.getByLabel("URL tujuan", { exact: true }).fill("/blog");
  await page.getByRole("button", { name: "Pindah blok 6 ke atas", exact: true }).click();
  await page.getByRole("button", { name: "Pindah blok 5 ke bawah", exact: true }).click();
  await page.getByLabel("URL tujuan", { exact: true }).focus();
  await add("Paragraf");
  await page.getByRole("button", { name: "Hapus blok 7", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Batal", exact: true }).click();
  await expect(page.getByRole("region", { name: "Blok 7: Paragraf", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Hapus blok 7", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Hapus blok", exact: true }).click();
  await page.getByRole("link", { name: /Kembali ke Artikel/ }).click();
  await page.getByRole("button", { name: "Tetap Mengedit", exact: true }).click();
  page.once("dialog", dialog => dialog.accept()); await page.reload();
  await page.getByRole("button", { name: "Pulihkan Tulisan", exact: true }).click();
  await expect(page.getByLabel("Teks tautan", { exact: true })).toHaveValue("Baca Blog");
  for (const mode of ["422", "500", "network"]) {
    failure = mode; await page.getByRole("button", { name: "Simpan Perubahan", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: /Periksa kembali|Permintaan belum berhasil/ })).toBeVisible();
    await expect(page.getByLabel("URL tujuan", { exact: true })).toHaveValue("/blog");
  }
  failure = "pending";
  await page.getByRole("button", { name: "Simpan Perubahan", exact: true }).click();
  await expect(page.getByLabel("URL tujuan", { exact: true })).toBeDisabled();
  await page.locator("form").evaluate(form => { for (let n = 0; n < 3; n++) form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  await expect.poll(() => writes.length).toBe(4); expect(release).toBeDefined(); release!();
  await expect(page.getByRole("status")).toContainText("Tersimpan");
  const expected = ["paragraph", "h2", "h3", "bulleted-list", "numbered-list", "link"];
  expect(parseArticleBody(stored.body).map(block => block.type)).toEqual(expected);
  expect(parseArticleBody(stored.body)[3].items).toEqual(["Daftar Poin satu", "Daftar Poin dua"]);
  expect(parseArticleBody(stored.body)[4].items).toEqual(["Daftar Bernomor satu", "Daftar Bernomor dua"]);
  expect(stored).toEqual({ ...existing, body: stored.body });
  const { thumbnail_resolved_url: resolved, id, ...persisted } = existing;
  expect(id).toBe(81);
  expect(resolved).not.toBe(existing.thumbnail);
  expect(writes[3]).toMatchObject({ ...persisted, body: stored.body });
  expect(writes[3]).not.toHaveProperty("thumbnail_resolved_url");
  await page.getByRole("link", { name: /Kembali ke Artikel/ }).click();
  await page.getByRole("link", { name: "Artikel blok", exact: true }).click();
  await expect(page.getByLabel("Teks tautan", { exact: true })).toHaveValue("Baca Blog");
  await expect(page.getByRole("textbox", { name: "Paragraf", exact: true })).toHaveValue("Paragraf revisi\nBaris kedua");
  expect(JSON.parse(stored.body).every((block: { id: string }) => typeof block.id === "string" && block.id.length > 0)).toBe(true);
  await request.post("http://127.0.0.1:3412/fixtures/articles", { data: [stored] });
  const publicResponse = await request.get(`/blog/${stored.slug}`);
  expect(publicResponse.status()).toBe(200);
  const html = await publicResponse.text();
  for (const content of ["Bagian revisi", "Subjudul revisi", "Daftar Poin dua", "Daftar Bernomor dua", 'href="/blog"', "Baca Blog"]) expect(html).toContain(content);
  expect(html).toMatch(/<h2[^>]*>Bagian revisi<\/h2>/);
  expect(html).toMatch(/<h3[^>]*>Subjudul revisi<\/h3>/);
  for (const [width, height] of [[1440, 900], [768, 1024], [390, 844]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `C:/Users/Tulo/AppData/Local/Temp/opencode/studio-document/editor-${width}.png`, fullPage: true });
    await page.getByLabel("URL tujuan", { exact: true }).focus();
    const lastMenu = page.getByRole("group", { name: "Pilih jenis konten", exact: true });
    await expect(lastMenu.getByRole("button", { name: "Tautan", exact: true })).toHaveAttribute("aria-pressed", "true");
    await lastMenu.getByRole("button", { name: "Gambar", exact: true }).focus();
    await page.screenshot({ path: `C:/Users/Tulo/AppData/Local/Temp/opencode/studio-document/toolbar-${width}.png`, fullPage: true });

  }
});

for (const body of ['## Heading lama\n\n- Satu\n- Dua', '[{"id":"keep","type":"paragraph","text":"Tetap","extra":{"keep":true}}]', '[{"type":"image","url":"/brand/hiru-atas.png","custom":"keep"}]']) {
  test(`B2-A metadata-only body exact preservation ${body.slice(0, 25)}`, async ({ page }) => {
    let stored = { ...existing, body };
    await page.route("**/api/admin/blog-articles**", async route => {
      if (route.request().method() !== "GET") stored = { ...stored, ...route.request().postDataJSON() };
      await route.fulfill({ json: { data: route.request().method() === "GET" ? [stored] : stored } });
    });
    await page.goto("/admin/blog-seo/editor?id=81");
    await page.getByLabel("Ringkasan artikel", { exact: true }).fill("Hanya ringkasan");
    await page.getByRole("button", { name: "Simpan Perubahan", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Tersimpan");
    expect(stored).toEqual({ ...existing, body, excerpt: "Hanya ringkasan" });
  });
}
