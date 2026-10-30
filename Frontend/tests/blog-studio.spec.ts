import { test, expect } from "./canonical-fixture";
async function auditAccessibility(page: import("@playwright/test").Page) {
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (options: unknown) => Promise<{ violations: { id: string; impact: string; nodes: unknown[] }[] }> } }).axe;
    return (await axe.run({ runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations.map(({ id, impact, nodes }) => ({ id, impact, count: nodes.length }));
  });
  expect(violations).toEqual([]);
}


test("B1 draft save, reopen, validation failure and legacy body preservation", async ({ page }) => {
  const legacyBody = '[{"id":"keep","type":"h2","text":"Judul lama"},{"id":"p","type":"paragraph","text":"Isi lama utuh."}]';
  const articles: Record<string, unknown>[] = [{ id: 10, title: "Artikel lama", slug: "alamat-lama", excerpt: "Ringkasan lama", body: legacyBody, thumbnail: null, category: "Tips Belajar", author: "Hiru Academy", published: true, published_at: "2026-01-01T07:30:00Z", featured: true, seo_title: "SEO lama", meta_description: "Deskripsi lama" }];
  const writes: Record<string, unknown>[] = [];
  let failure = "";
  await page.route("**/api/admin/blog-articles**", async route => {
    const request = route.request();
    if (request.method() === "GET") { await route.fulfill({ json: { data: articles } }); return; }
    const data = request.postDataJSON() as Record<string, unknown>;
    writes.push(data);
    if (failure === "network") { await route.abort("failed"); return; }
    if (failure) { await route.fulfill({ status: Number(failure), json: { message: "Validation failed", errors: { title: ["Judul ditolak."] } } }); return; }
    const id = Number(new URL(request.url()).pathname.split("/").at(-1));
    if (Number.isFinite(id)) Object.assign(articles.find(article => article.id === id)!, data);
    else articles.push({ ...data, id: 20 });
    await route.fulfill({ json: { data: articles.at(-1) } });
  });
  await page.goto("/admin/blog-seo");
  await expect(page.getByRole("heading", { name: "Kelola Artikel" })).toBeVisible();
  await page.getByRole("link", { name: "+ Tulis Artikel" }).click();
  await page.getByLabel("Judul artikel", { exact: true }).fill("Artikel Baru");
  await page.getByLabel("Ringkasan artikel", { exact: true }).fill("Ringkasan baru");
  await page.getByLabel("Isi artikel", { exact: true }).fill("Isi baru yang disimpan.");
  await page.getByLabel("Kategori", { exact: true }).selectOption("Tips Belajar");
  await page.getByLabel("Penulis", { exact: true }).selectOption("Hiru Academy");
  await page.getByRole("link", { name: "Kembali ke Artikel", exact: false }).click();
  await expect(page.getByRole("dialog", { name: "Perubahan belum disimpan" })).toBeVisible();
  await page.getByRole("button", { name: "Tetap Mengedit" }).click();
  await expect(page).toHaveURL(/editor/);
  await page.getByRole("button", { name: "Simpan Draft", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/blog-seo$/);
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ published: false, body: "Isi baru yang disimpan.", slug: "artikel-baru" });
  await page.getByRole("link", { name: "Artikel Baru", exact: true }).click();
  await expect(page.getByLabel("Isi artikel", { exact: true })).toHaveValue("Isi baru yang disimpan.");
  await page.getByLabel("Judul artikel", { exact: true }).fill("Revisi draft");
  failure = "422";
  await page.getByRole("button", { name: "Simpan Draft", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Periksa kembali" })).toBeVisible();
  await expect(page.getByLabel("Judul artikel", { exact: true })).toHaveValue("Revisi draft");
  for (const mode of ["500", "network"]) {
    failure = mode;
    await page.getByRole("button", { name: "Simpan Draft", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Permintaan belum berhasil" })).toBeVisible();
    await expect(page.getByLabel("Judul artikel", { exact: true })).toHaveValue("Revisi draft");
  }
  failure = "";
  await page.getByRole("link", { name: "Kembali ke Artikel", exact: false }).click();
  await page.getByRole("button", { name: "Keluar Tanpa Menyimpan" }).click();
  await page.getByRole("link", { name: "Artikel lama", exact: true }).click();
  await page.getByLabel("Ringkasan artikel", { exact: true }).fill("Ringkasan diperbarui");
  await page.getByRole("button", { name: "Simpan Perubahan", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Tersimpan");
  expect(writes.at(-1)).toMatchObject({ title: "Artikel lama", excerpt: "Ringkasan diperbarui", meta_description: "Deskripsi lama", author: "Hiru Academy", slug: "alamat-lama", body: legacyBody, published_at: "2026-01-01T07:30:00Z", featured: true, published: true, seo_title: "SEO lama" });
});

for (const [width, height] of [[1440, 900], [768, 1024], [390, 844]]) {
  test(`B1 dashboard and editor screenshots ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const records = Array.from({ length: 14 }, (_, index) => ({ id: index + 1, title: `Artikel fixture ${index + 1}`, slug: `artikel-${index + 1}`, body: "Isi fixture aman.", excerpt: "Ringkasan fixture", category: index % 2 ? "JLPT" : "Tips Belajar", author: "Hiru Academy", published: index !== 2, published_at: index === 0 ? "2099-01-01T00:00:00Z" : "2026-01-01T00:00:00Z", featured: false, thumbnail: null, seo_title: "", meta_description: "" }));
    await page.route("**/api/admin/blog-articles**", route => route.fulfill({ json: { data: records } }));
    await page.goto("/admin/blog-seo");
    await expect(page.getByRole("link", { name: "Artikel fixture 1", exact: true })).toBeVisible();
    await auditAccessibility(page);
    const output = process.env.BLOG_VISUAL_OUTPUT || "C:/Users/Tulo/AppData/Local/Temp/opencode/studio-b1d2-before";
    await page.screenshot({ path: `${output}/dashboard-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Terjadwal", exact: true }).click();
    await expect(page.getByRole("row")).toHaveCount(2);
    await page.getByRole("button", { name: "Draft", exact: true }).click();
    await expect(page.getByRole("link", { name: "Artikel fixture 3", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Semua", exact: true }).click();
    await page.getByRole("searchbox").fill("fixture 14");
    await expect(page.getByRole("row")).toHaveCount(2);
    await page.getByRole("searchbox").fill("");
    await page.getByRole("button", { name: "Berikutnya", exact: true }).click();
    await expect(page.getByRole("row")).toHaveCount(3);
    await page.getByRole("button", { name: "Pengaturan Blog", exact: true }).click();
    await expect(page.getByRole("button", { name: "Tambah Kategori", exact: true })).toBeVisible();
    await auditAccessibility(page);
    await page.screenshot({ path: `${output}/settings-${width}.png`, fullPage: true });
    await page.getByRole("link", { name: "+ Tulis Artikel" }).click();
    await expect(page.getByRole("heading", { name: "Tulis Artikel", exact: true })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Kategori", exact: true })).toBeEnabled();
    await auditAccessibility(page);
    await page.screenshot({ path: `${output}/editor-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Simpan Draft", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "wajib diisi" })).toBeVisible();
    await page.screenshot({ path: `${output}/error-${width}.png`, fullPage: true });
    await page.getByLabel("Judul artikel", { exact: true }).fill("Tulisan belum tersimpan");
    const back = page.getByRole("link", { name: /Kembali ke Artikel/ });
    await back.click();
    const dialog = page.getByRole("dialog", { name: "Perubahan belum disimpan" });
    await expect(dialog).toBeVisible();
    const first = dialog.getByRole("button", { name: "Tutup dialog" });
    await expect(first).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: "Keluar Tanpa Menyimpan" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(first).toBeFocused();
    await auditAccessibility(page);
    await page.screenshot({ path: `${output}/confirm-${width}.png`, fullPage: true });
    await page.keyboard.press("Escape");
    await expect(back).toBeFocused();
    await back.click();
    await page.getByRole("button", { name: "Keluar Tanpa Menyimpan" }).click();
    await page.getByRole("link", { name: "Artikel fixture 1", exact: true }).click();
    await expect(page.getByLabel("Judul artikel", { exact: true })).toHaveValue("Artikel fixture 1");
    await page.screenshot({ path: `${output}/existing-${width}.png`, fullPage: true });
    await page.getByLabel("Ringkasan artikel", { exact: true }).fill("Snapshot pemulihan");
    page.once("dialog", dialog => dialog.accept());
    await page.reload();
    await expect(page.getByRole("region", { name: "Pemulihan tulisan" })).toBeVisible();
    await auditAccessibility(page);
    await page.screenshot({ path: `${output}/recovery-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Abaikan", exact: true }).click();
    await page.getByRole("link", { name: /Kembali ke Artikel/ }).click();
    await expect(page.getByRole("heading", { name: "Kelola Artikel", exact: true })).toBeVisible();
    if (width < 1024) await page.getByRole("button", { name: "Buka navigasi admin" }).click();
    await page.getByRole("navigation", { name: "Navigasi admin" }).getByRole("link", { name: "Dashboard", exact: true }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await page.screenshot({ path: `${output}/admin-${width}.png`, fullPage: true });

  });
}

test("B1 thumbnail upload, replace, detach and invalid/error feedback", async ({ page }) => {
  await page.route("**/api/admin/blog-articles**", route => route.fulfill({ json: { data: [] } }));
  let uploads = 0;
  await page.route("**/api/admin/media", async route => {
    uploads++;
    if (uploads === 3) { await route.fulfill({ status: 500, json: { message: "Upload failed" } }); return; }
    await route.fulfill({ json: { data: { path: `media/image/qa-${uploads}.png`, url: "http://127.0.0.1:3415/brand/hiru-atas.png", mime_type: "image/png" } } });
  });
  await page.goto("/admin/blog-seo/editor");
  const file = { name: "cover.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG1sAAAAASUVORK5CYII=", "base64") };
  await page.getByLabel("Unggah Gambar Sampul", { exact: true }).setInputFiles(file);
  await expect(page.getByRole("img", { name: "Thumbnail Artikel", exact: true })).toBeVisible();
  await page.getByLabel("Ganti Gambar", { exact: true }).setInputFiles(file);
  await expect(page.getByRole("button", { name: "Hapus Gambar", exact: true })).toBeVisible();
  await page.getByLabel("Ganti Gambar", { exact: true }).setInputFiles(file);
  await expect(page.getByRole("alert").filter({ hasText: "Permintaan belum berhasil" })).toBeVisible();
  await page.getByRole("button", { name: "Hapus Gambar", exact: true }).click();
  await page.getByLabel("Unggah Gambar Sampul", { exact: true }).setInputFiles({ name: "unsafe.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
  await expect(page.getByRole("alert").filter({ hasText: "Format gambar tidak didukung" })).toBeVisible();
  expect(uploads).toBe(3);
});


test("B1 closeout existing thumbnail reference and all metadata survive excerpt-only save", async ({ page }) => {
  const original = {
    id: 73, title: "Artikel bergambar existing", slug: "alamat-gambar-tetap",
    excerpt: "Ringkasan sebelum", body: '[{"id":"keep","type":"paragraph","text":"Body existing utuh."}]',
    thumbnail: "media/image/11111111-1111-4111-8111-111111111111.png",
    thumbnail_resolved_url: "http://127.0.0.1:3415/brand/hiru-atas.png?fixture=existing-readonly",
    category: "Tips Belajar", author: "Hiru Academy", featured: true, published: true,
    published_at: "2026-01-01T07:30:00Z", seo_title: "SEO tetap", meta_description: "Deskripsi tetap",
  };
  let stored = { ...original };
  const writes: Record<string, unknown>[] = [];
  const mediaMutations: string[] = [];
  await page.route("**/api/admin/media**", async route => {
    if (route.request().method() !== "GET") mediaMutations.push(route.request().method());
    await route.fulfill({ status: 500, json: { message: "Unexpected media request" } });
  });
  await page.route("**/api/admin/blog-articles**", async route => {
    const request = route.request();
    if (request.method() === "GET") { await route.fulfill({ json: { data: [stored] } }); return; }
    expect(request.method()).toBe("PATCH");
    expect(new URL(request.url()).pathname).toBe("/api/admin/blog-articles/73");
    const data = request.postDataJSON();
    writes.push(data);
    stored = { ...stored, ...data };
    await route.fulfill({ json: { data: stored } });
  });
  await page.goto("/admin/blog-seo/editor?id=73");
  const cover = page.getByRole("img", { name: "Thumbnail Artikel bergambar existing", exact: true });
  await expect(cover).toBeVisible();
  await expect(cover).toHaveAttribute("src", original.thumbnail_resolved_url);
  await expect.poll(() => cover.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.getByLabel("Ringkasan artikel", { exact: true }).fill("Ringkasan sesudah");
  await page.getByRole("button", { name: "Simpan Perubahan", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Tersimpan");
  expect(writes).toHaveLength(1);
  const { id: _id, thumbnail_resolved_url: _resolved, ...fields } = original;
  void _id; void _resolved;
  expect(writes[0]).toEqual({ ...fields, excerpt: "Ringkasan sesudah" });
  expect(stored).toEqual({ ...original, excerpt: "Ringkasan sesudah" });
  expect(writes[0]).not.toHaveProperty("thumbnail_resolved_url");
  await page.getByRole("link", { name: /Kembali ke Artikel/ }).click();
  await page.getByRole("link", { name: original.title, exact: true }).click();
  await expect(page.getByLabel("Ringkasan artikel", { exact: true })).toHaveValue("Ringkasan sesudah");
  await expect(cover).toHaveAttribute("src", original.thumbnail_resolved_url);
  await expect.poll(() => cover.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  expect(stored.thumbnail).toBe(original.thumbnail);
  expect(mediaMutations).toEqual([]);
});
