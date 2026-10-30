import { expect, test, type Page } from "./canonical-fixture";

type CatalogRow = { id: number; name: string; active: boolean };
type Article = { id: number; title: string; slug: string; category: string; author: string; body: string; published: boolean; [key: string]: unknown };

async function mockBlog(page: Page) {
  const categories: CatalogRow[] = [
    { id: 1, name: "Tips Belajar", active: true },
    { id: 2, name: "Kategori Arsip", active: false },
  ];
  const contributors: CatalogRow[] = [
    { id: 3, name: "Hiru Academy", active: true },
    { id: 4, name: "Kontributor Arsip", active: false },
  ];
  const articles: Article[] = [
    { id: 10, title: "Artikel Arsip", slug: "artikel-arsip", category: "Kategori Arsip", author: "Kontributor Arsip", body: "Konten arsip tetap tersedia.", published: false },
    { id: 11, title: "Artikel Lama Hiru", slug: "artikel-lama-hiru", category: "Tips Belajar", author: "Hiru Academy", body: "Konten lama Hiru Academy.", published: true },
  ];
  articles.forEach(article => Object.assign(article, { excerpt: "Ringkasan artikel fixture.", thumbnail: null, seo_title: "", meta_description: "", featured: false, published_at: null }));
  let sequence = 20;
  const mutations: { path: string; method: string; body: Record<string, unknown> | null }[] = [];
  await page.route(/\/api\/(?:admin\/blog-(?:categories|contributors|articles)(?:\/\d+)?|blog(?:\/[^/?]+)?)\/?(?:\?.*)?$/, async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (method === "OPTIONS") { await route.fulfill({ status: 204 }); return; }
    if (path === "/api/blog" || path.startsWith("/api/blog/")) {
      const published = articles.filter(article => article.published);
      await route.fulfill({ json: { data: path === "/api/blog" ? published : published.find(article => article.slug === path.split("/").at(-1)) ?? null } });
      return;
    }
    const match = path.match(/^\/api\/admin\/blog-(categories|contributors|articles)(?:\/(\d+))?$/)!;
    const kind = match[1];
    const id = Number(match[2]);
    const rows: (CatalogRow | Article)[] = kind === "categories" ? categories : kind === "contributors" ? contributors : articles;
    const row = rows.find(item => item.id === id);
    if (method === "GET") { await route.fulfill({ json: { data: match[2] ? row : rows } }); return; }
    const body = method === "DELETE" ? null : request.postDataJSON();
    mutations.push({ path, method, body });
    if (kind !== "articles" && body) {
      expect(Object.keys(body).sort()).toEqual(["active", "name"]);
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name || rows.some(item => item.id !== id && "name" in item && String(item.name).toLocaleLowerCase("id-ID") === name.toLocaleLowerCase("id-ID"))) {
        const message = name ? "Nama sudah digunakan." : "Nama wajib diisi.";
        await route.fulfill({ status: 422, json: { message, errors: { name: [message] } } }); return;
      }
      body.name = name;
    }
    if (method === "DELETE") {
      if (!row) { await route.fulfill({ status: 404, json: { message: "Data tidak ditemukan." } }); return; }
      const field = kind === "categories" ? "category" : "author";
      if (kind !== "articles" && articles.some(article => article[field] === (row as CatalogRow).name)) {
        await route.fulfill({ status: 409, json: { message: "Data masih digunakan oleh artikel." } }); return;
      }
      rows.splice(rows.indexOf(row), 1);
      await route.fulfill({ status: 204 }); return;
    }
    if (method === "PATCH") {
      if (!row) { await route.fulfill({ status: 404, json: { message: "Data tidak ditemukan." } }); return; }
      if (kind !== "articles") {
        const field = kind === "categories" ? "category" : "author";
        articles.filter(article => article[field] === (row as CatalogRow).name).forEach(article => { article[field] = body.name; });
      }
      Object.assign(row, body);
      await route.fulfill({ json: { data: row } }); return;
    }
    expect(method).toBe("POST");
    const created = { ...body, id: sequence++ };
    if (kind === "articles") articles.push(created as Article);
    else (rows as CatalogRow[]).push(created as CatalogRow);
    await route.fulfill({ status: 201, json: { data: created } });
  });
  return { categories, contributors, articles, mutations };
}

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

for (const catalog of [
  { label: "Kategori", singular: "kategori", existing: "Tips Belajar", key: "categories" as const },
  { label: "Kontributor", singular: "kontributor", existing: "Hiru Academy", key: "contributors" as const },
]) {
  test(`blog catalog ${catalog.key}: create, rename, validation, active state and delete conflict`, async ({ page }) => {
    const state = await mockBlog(page);
    await page.goto("/admin/blog-seo");
    await page.getByRole("button", { name: "Pengaturan Blog", exact: true }).click();
    await page.getByRole("button", { name: `Tambah ${catalog.label}`, exact: true }).click();
    const dialog = page.getByRole("dialog");
    const name = dialog.getByRole("textbox", { name: `Nama ${catalog.label}` });
    await name.fill("   ");
    await dialog.getByRole("button", { name: `Simpan ${catalog.label}` }).click();
    await expect(dialog.getByRole("alert")).toContainText("wajib diisi");
    expect(state.mutations).toHaveLength(0);
    await name.fill(catalog.existing.toLowerCase());
    await dialog.getByRole("button", { name: `Simpan ${catalog.label}` }).click();
    await expect(dialog.getByRole("alert")).toContainText("Periksa kembali data yang dimasukkan.");
    await name.fill(`${catalog.label} Baru`);
    await dialog.getByRole("button", { name: `Simpan ${catalog.label}` }).click();
    await expect(dialog).not.toBeVisible();
    const createdName = `${catalog.label} Baru`;
    const renamed = `${catalog.label} Revisi`;
    await page.getByRole("button", { name: `Edit ${catalog.singular} ${createdName}`, exact: true }).click();
    const editor = page.getByRole("dialog");
    await editor.getByRole("textbox", { name: `Nama ${catalog.label}` }).fill(renamed);
    await editor.getByRole("button", { name: `Simpan ${catalog.label}` }).click();
    await expect(editor).not.toBeVisible();
    await page.getByRole("button", { name: `Nonaktifkan ${catalog.singular} ${renamed}`, exact: true }).click();
    await expect(page.getByRole("button", { name: `Aktifkan ${catalog.singular} ${renamed}`, exact: true })).toBeVisible();
    expect(state[catalog.key].find(row => row.name === renamed)?.active).toBe(false);
    await page.getByRole("button", { name: `Aktifkan ${catalog.singular} ${renamed}`, exact: true }).click();
    await expect(page.getByRole("button", { name: `Nonaktifkan ${catalog.singular} ${renamed}`, exact: true })).toBeVisible();
    await page.getByRole("button", { name: `Hapus ${catalog.singular} ${catalog.existing}`, exact: true }).click();
    const deletion = page.getByRole("dialog");
    await deletion.getByRole("button", { name: `Hapus ${catalog.label}`, exact: true }).click();
    await expect(deletion.getByRole("alert")).toHaveText("Permintaan belum berhasil. Silakan coba lagi.");
    expect(state[catalog.key].some(row => row.name === catalog.existing)).toBe(true);
    await deletion.getByRole("button", { name: "Batal", exact: true }).click();
    await page.getByRole("button", { name: `Hapus ${catalog.singular} ${renamed}`, exact: true }).click();
    await deletion.getByRole("button", { name: `Hapus ${catalog.label}`, exact: true }).click();
    await expect(deletion).not.toBeVisible();
    await expect(page.getByRole("button", { name: `Edit ${catalog.singular} ${renamed}`, exact: true })).toHaveCount(0);
    expect(state[catalog.key].some(row => row.name === renamed)).toBe(false);
  });
}

test("blog catalog inactive values stay on edits, absent from new articles; legacy Hiru attribution survives", async ({ page }) => {
  const state = await mockBlog(page);
  await page.goto("/admin/blog-seo");
    await page.getByRole("button", { name: "Pengaturan Blog", exact: true }).click();
  await page.getByRole("link", { name: "+ Tulis Artikel" }).click();
  await expect(page.getByRole("combobox", { name: "Kategori", exact: true }).getByRole("option", { name: "Kategori Arsip", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Penulis", { exact: true }).getByRole("option", { name: "Kontributor Arsip", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: /Kembali ke Artikel/ }).click();
  await page.getByRole("link", { name: "Artikel Arsip", exact: true }).click();
  await expect(page.getByLabel("Kategori", { exact: true })).toHaveValue("Kategori Arsip");
  await page.getByLabel("Judul artikel", { exact: true }).fill("Artikel Arsip Diperbarui");
  await expect(page.getByLabel("Penulis", { exact: true })).toHaveValue("Kontributor Arsip");
  await page.getByRole("button", { name: "Simpan Draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Tersimpan");
  expect(state.articles.find(article => article.id === 10)).toMatchObject({ category: "Kategori Arsip", author: "Kontributor Arsip", title: "Artikel Arsip Diperbarui" });
  await page.request.post("http://127.0.0.1:3412/fixtures/articles", { data: state.articles });
  const html = await (await page.request.get("/blog")).text();
  expect(html).toContain("Artikel Lama Hiru");
  expect(html).toContain("Hiru Academy");
  const detail = await page.request.get("/blog/artikel-lama-hiru");
  expect(detail.status()).toBe(200);
  expect(await detail.text()).toContain("Hiru Academy");
});

test("blog catalog used names cascade to public articles after category and contributor rename", async ({ page }) => {
  const state = await mockBlog(page);
  await page.goto("/admin/blog-seo");
    await page.getByRole("button", { name: "Pengaturan Blog", exact: true }).click();
  for (const [label, original, renamed] of [["Kategori", "Tips Belajar", "Strategi Belajar"], ["Kontributor", "Hiru Academy", "Tim Hiru Academy"]]) {
    await page.getByRole("button", { name: `Edit ${label.toLowerCase()} ${original}`, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: `Nama ${label}` }).fill(renamed);
    await dialog.getByRole("button", { name: `Simpan ${label}`, exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("button", { name: `Edit ${label.toLowerCase()} ${renamed}`, exact: true })).toBeVisible();
  }
  expect(state.articles.find(article => article.id === 11)).toMatchObject({ category: "Strategi Belajar", author: "Tim Hiru Academy" });
  await page.request.post("http://127.0.0.1:3412/fixtures/articles", { data: state.articles });
  const html = await (await page.request.get("/blog?category=Strategi%20Belajar")).text();
  expect(html).toContain("Artikel Lama Hiru");
  expect(html).toContain("Tim Hiru Academy");
  const detail = await page.request.get("/blog/artikel-lama-hiru");
  expect(detail.status()).toBe(200);
  for (const text of ["Strategi Belajar", "Tim Hiru Academy"]) expect(await detail.text()).toContain(text);
});

test("blog catalog load503 retries and save503 keeps draft without false success", async ({ page }) => {
  const state = await mockBlog(page);
  let failLoad = true;
  let failedSaves = 0;
  await page.route("**/api/admin/blog-categories", async route => {
    if (route.request().method() === "GET" && failLoad) {
      await route.fulfill({ status: 503, json: { message: "Catalog unavailable." } });
    } else if (route.request().method() === "POST") {
      failedSaves++;
      await route.fulfill({ status: 503, json: { message: "Save unavailable." } });
    } else await route.fallback();
  });
  await page.goto("/admin/blog-seo");
    await page.getByRole("button", { name: "Pengaturan Blog", exact: true }).click();
  await expect(page.getByRole("button", { name: "Tambah Kategori", exact: true })).toBeDisabled();
  const retry = page.getByRole("button", { name: "Muat Ulang Kategori", exact: true });
  await expect(retry).toBeVisible();
  failLoad = false;
  await retry.click();
  await expect(page.getByRole("button", { name: "Tambah Kategori", exact: true })).toBeEnabled();
  await expect(retry).toHaveCount(0);
  await page.getByRole("button", { name: "Tambah Kategori", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Nama Kategori" }).fill("Kategori Gagal");
  await dialog.getByRole("button", { name: "Simpan Kategori", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Permintaan belum berhasil. Silakan coba lagi.");
  await expect(dialog.getByRole("textbox", { name: "Nama Kategori" })).toHaveValue("Kategori Gagal");
  await expect(dialog.getByRole("button", { name: "Simpan Kategori", exact: true })).toBeEnabled();
  await expect(page.getByRole("status").filter({ hasText: "Kategori disimpan." })).toHaveCount(0);
  expect(failedSaves).toBe(1);
  expect(state.categories.some(row => row.name === "Kategori Gagal")).toBe(false);
});

for (const width of [1440, 768, 390]) {
  test(`blog catalog responsive ${width}: publish new catalog attribution publicly`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const state = await mockBlog(page);
    await page.goto("/admin/blog-seo");
    await page.getByRole("button", { name: "Pengaturan Blog", exact: true }).click();
    for (const [label, value] of [["Kategori", "Budaya Jepang"], ["Kontributor", "Sensei Hana"]]) {
      await page.getByRole("button", { name: `Tambah ${label}`, exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("textbox", { name: `Nama ${label}` }).fill(value);
      await expectNoOverflow(page);
      await dialog.getByRole("button", { name: `Simpan ${label}`, exact: true }).click();
      await expect(dialog).not.toBeVisible();
    }
    await expectNoOverflow(page);
    await page.getByRole("link", { name: "+ Tulis Artikel" }).click();
    await page.getByLabel("Kategori", { exact: true }).selectOption("Budaya Jepang");
    const title = `Budaya Jepang ${width}`;
    await page.getByLabel("Judul artikel", { exact: true }).fill(title);
    await page.getByLabel("Isi artikel", { exact: true }).fill("Panduan budaya Jepang dari kontributor baru.");
    await page.getByLabel("Penulis", { exact: true }).selectOption("Sensei Hana");
    await expectNoOverflow(page);
    await page.getByRole("button", { name: "Simpan Draft", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/blog-seo$/);
    const created = state.articles.find(article => article.title === title)!;
    expect(created).toMatchObject({ category: "Budaya Jepang", author: "Sensei Hana", published: false });
    expect(created.slug).toBe(`budaya-jepang-${width}`);
    await page.request.post("http://127.0.0.1:3412/fixtures/articles", { data: state.articles });
    expect(await (await page.request.get("/blog")).text()).not.toContain(title);
    // B1 has no publish control: fixture models server publication; public SSR contract stays covered.
    created.published = true;
    await page.request.post("http://127.0.0.1:3412/fixtures/articles", { data: state.articles });
    const html = await (await page.request.get("/blog?category=Budaya%20Jepang")).text();
    expect(html).toContain(title);
    expect(html).toContain("Sensei Hana");
    const detail = await page.request.get(`/blog/${created.slug}`);
    expect(detail.status()).toBe(200);
    for (const text of [title, "Budaya Jepang", "Sensei Hana"]) expect(await detail.text()).toContain(text);
    await page.goto(`/blog/${created.slug}`);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expectNoOverflow(page);
  });
}
