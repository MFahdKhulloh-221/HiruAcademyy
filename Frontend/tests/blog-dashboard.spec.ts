import { test, expect } from "./canonical-fixture";

const now = "2026-10-29T00:00:00Z";
const article = (id: number) => ({ id, title: `Dashboard ${id}`, slug: `dashboard-${id}`, excerpt: "Ringkasan", body: "Isi aman", category: id % 2 ? "Tips Belajar" : "JLPT", author: "Hiru Academy", thumbnail: null, published: true, published_at: `2026-01-${String(id).padStart(2, "0")}T00:00:00Z`, featured: false, seo_title: "SEO", meta_description: "Deskripsi" });

test("B1-D1 dashboard filters, date boundary, pagination, preview, edit and fixture deletion", async ({ page }) => {
  await page.clock.install({ time: new Date(now) });
  await page.clock.pauseAt(new Date(now));
  const rows = Array.from({ length: 15 }, (_, i) => article(i + 1));
  Object.assign(rows[0], { published: false, published_at: "2099-01-01T00:00:00Z" });
  rows[1].published_at = "2026-10-29T07:00:00.001+07:00";
  rows[2].published_at = "2026-10-29T07:00:00+07:00";
  rows[3].published_at = "2026-10-29T06:59:59.999+07:00";
  const deletes: string[] = [];
  await page.route("**/api/admin/blog-articles**", async route => {
    if (route.request().method() === "DELETE") {
      deletes.push(route.request().url());
      const id = Number(new URL(route.request().url()).pathname.split("/").at(-1));
      rows.splice(rows.findIndex(row => row.id === id), 1);
      await route.fulfill({ status: 204 }); return;
    }
    await route.fulfill({ json: { data: rows } });
  });
  await page.goto("/admin/blog-seo");
  const body = page.getByRole("rowgroup").nth(1);
  await expect(body.getByRole("row")).toHaveCount(12);
  expect(await body.getByRole("link").allTextContents()).toEqual(["Dashboard 1", "Dashboard 2", "Dashboard 3", "Dashboard 4", "Dashboard 15", "Dashboard 14", "Dashboard 13", "Dashboard 12", "Dashboard 11", "Dashboard 10", "Dashboard 9", "Dashboard 8"]);
  for (const [status, count] of [["Draft", 1], ["Terjadwal", 1], ["Terbit", 12]] as const) {
    await page.getByRole("button", { name: status, exact: true }).click();
    await expect(body.getByRole("row")).toHaveCount(count);
    if (status === "Terbit") await expect(page.getByRole("link", { name: "Dashboard 3", exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Semua", exact: true }).click();
  for (const [category, count] of [["Tips Belajar", 8], ["JLPT", 7]] as const) {
    await page.getByLabel("Kategori", { exact: true }).selectOption(category);
    await expect(body.getByRole("row")).toHaveCount(count);
  }
  await page.getByLabel("Kategori", { exact: true }).selectOption("");
  await page.getByRole("button", { name: "Berikutnya", exact: true }).click();
  await expect(body.getByRole("row")).toHaveCount(3);
  await page.getByRole("button", { name: "Sebelumnya", exact: true }).click();
  await expect(body.getByRole("row")).toHaveCount(12);
  await page.getByRole("searchbox").fill("dashboard 3");
  await expect(body.getByRole("row")).toHaveCount(1);
  const row = body.getByRole("row");
  await row.getByLabel("Tindakan Dashboard 3").click();
  await expect(row.getByRole("link", { name: "Lihat di Website" })).toHaveAttribute("href", "/blog/dashboard-3");
  await expect(row.getByRole("link", { name: "Lihat di Website" })).toHaveAttribute("target", "_blank");
  await row.getByRole("button", { name: "Pratinjau", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Pratinjau artikel tersimpan" })).toContainText("Isi aman");
  await page.keyboard.press("Escape");
  await row.getByRole("link", { name: "Edit", exact: true }).click();
  await expect(page).toHaveURL(/editor\?id=3/);
  await page.getByRole("link", { name: /Kembali ke Artikel/ }).click();
  await page.getByRole("searchbox").fill("Dashboard 1");
  const draft = body.getByRole("row").filter({ has: page.getByRole("link", { name: "Dashboard 1", exact: true }) });
  await draft.getByLabel("Tindakan Dashboard 1", { exact: true }).click();
  await expect(draft.getByRole("link", { name: "Lihat di Website" })).toHaveCount(0);
  await draft.getByRole("button", { name: "Hapus", exact: true }).click();
  await page.getByRole("dialog", { name: "Hapus artikel?" }).getByRole("button", { name: "Batal", exact: true }).click();
  expect(deletes).toHaveLength(0);
  await draft.getByRole("button", { name: "Hapus", exact: true }).click();
  await page.getByRole("dialog", { name: "Hapus artikel?" }).getByRole("button", { name: "Hapus artikel", exact: true }).click();
  await expect(draft).toHaveCount(0);
  expect(deletes).toHaveLength(1);
  await page.getByRole("searchbox").fill("tidak ada artikel ini");
  await expect(page.getByText("Belum ada artikel yang sesuai.")).toBeVisible();
});

test("B1-D1 dashboard load error retries", async ({ page }) => {
  let fail = true;
  await page.route("**/api/admin/blog-articles**", route => route.fulfill(fail ? { status: 500, json: { message: "Unavailable" } } : { json: { data: [article(1)] } }));
  await page.goto("/admin/blog-seo");
  await expect(page.getByRole("button", { name: "Coba lagi", exact: true })).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Coba lagi", exact: true }).click();
  await expect(page.getByRole("link", { name: "Dashboard 1", exact: true })).toBeVisible();
});

for (const field of ["category", "author", "slug"]) {
  test(`B1-D1 backend 422 ${field} keeps editor data`, async ({ page }) => {
    let writes = 0;
    await page.route("**/api/admin/blog-articles**", async route => {
      if (route.request().method() === "GET") { await route.fulfill({ json: { data: [article(1)] } }); return; }
      writes++;
      await route.fulfill({ status: 422, json: { message: "The given data was invalid.", errors: { [field]: [field === "slug" ? "The slug has already been taken." : `The selected ${field} is invalid.`] } } });
    });
    await page.goto("/admin/blog-seo/editor?id=1");
    await page.getByLabel("Ringkasan artikel", { exact: true }).fill("Tulisan tetap utuh");
    await page.getByRole("button", { name: "Simpan Perubahan", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Periksa kembali data yang dimasukkan." })).toBeVisible();
    await expect(page).toHaveURL(/editor\?id=1/);
    await expect(page.getByLabel("Ringkasan artikel", { exact: true })).toHaveValue("Tulisan tetap utuh");
    await expect(page.getByRole("status")).toContainText("Gagal menyimpan");
    expect(writes).toBe(1);
  });
}

test("B1-D1 required title/body reject before mutation", async ({ page }) => {
  let writes = 0;
  await page.route("**/api/admin/blog-articles**", async route => {
    if (route.request().method() !== "GET") writes++;
    await route.fulfill({ json: { data: [article(1)] } });
  });
  await page.goto("/admin/blog-seo/editor?id=1");
  for (const label of ["Judul artikel", "Isi artikel"]) {
    const input = page.getByLabel(label, { exact: true });
    const previous = await input.inputValue();
    await input.fill(" ");
    await page.getByRole("button", { name: "Simpan Perubahan", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "wajib diisi" })).toBeVisible();
    await input.fill(previous);
  }
  expect(writes).toBe(0);
});

test("B1-D1 non-editor Admin sidebar and logout remain normal", async ({ page }) => {
  let logouts = 0;
  await page.route("**/api/auth/logout", async route => { logouts++; await route.fulfill({ status: 204 }); });
  await page.goto("/admin/blog-seo");
  await page.getByRole("navigation", { name: "Navigasi admin" }).getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Keluar", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(logouts).toBe(1);
});


test("B1-D1 clean editor sidebar does not show guard", async ({ page }) => {
  await page.route("**/api/admin/blog-articles**", route => route.fulfill({ json: { data: [article(1)] } }));
  await page.goto("/admin/blog-seo/editor?id=1");
  await expect(page.getByLabel("Judul artikel", { exact: true })).toHaveValue("Dashboard 1");
  await page.getByRole("navigation", { name: "Navigasi admin" }).getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
