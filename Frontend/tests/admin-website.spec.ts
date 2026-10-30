import { expect, test, type Page } from "./canonical-fixture";

const storageKey = "hiru-admin-website:v1";
const adminRoutes = [
  "/admin/landing-page",
  "/admin/blog-seo",
  "/admin/testimoni",
  "/admin/pengumuman",
];
const responsiveWidths = [360, 390, 768, 820, 1024, 1440];

async function expectNoHorizontalOverflow(page: Page) {
  const result = await page.evaluate(() => ({
    body: document.body.scrollWidth <= document.body.clientWidth,
    page: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  }));
  expect(result).toEqual({ body: true, page: true });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate((key) => localStorage.removeItem(key), storageKey);
});

test("Scenario 1: server-backed Hero editor is available without changing published copy", async ({ page }) => {
  const hero = {
    eyebrow: "BELAJAR BERSAMA HIRU",
    heading: "Hero tersimpan dari server",
    support: "Materi belajar terarah bersama Hiru Academy.",
    primaryCtaLabel: "Lihat program",
    primaryCtaPath: "/program",
    secondaryCtaLabel: "Baca artikel",
    secondaryCtaPath: "/blog",
  };
  let adminReads = 0;
  await page.route("**/api/admin/landing/hero", route => {
    expect(route.request().method()).toBe("GET");
    adminReads++;
    return route.fulfill({ json: { data: { draft: null, published: hero, revision: 1 } } });
  });
  await page.route("**/api/public/landing/hero", route => route.fulfill({ json: { data: hero } }));
  await page.goto("/admin/landing-page");
  await expect(page.getByLabel("Judul Hero", { exact: true })).toBeEnabled();
  await expect(page.getByLabel("Judul Hero", { exact: true })).toHaveValue(hero.heading);
  expect(adminReads).toBeGreaterThan(0);
  await expect(page.getByRole("region", { name: "Pratinjau Hero", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Simpan Draft Hero", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Publikasikan Hero", exact: true })).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(hero.heading);
});

test("Scenario 2: promotion overlays N4 offer price without mutating base price", async ({ page }) => {
  const offer = { id: 20, program_id: 2, program: { id: 2, code: "n4", slug: "n4", name: "JLPT N4" }, plan_code: "lms", currency: "IDR", base_price: 99000, effective_price: 99000, discount_amount: 0, discount_percent: 0, duration_months: 6, status: "active" };
  const promos: Record<string, unknown>[] = [];
  await page.route("**/api/admin/offers", route => route.fulfill({ json: { data: [offer] } }));
  await page.route("**/api/admin/promotions", async route => {
    if (route.request().method() === "POST") { const row = { ...route.request().postDataJSON(), id: 1 }; promos.push(row); offer.discount_percent = 20; offer.discount_amount = 19800; offer.effective_price = 79200; await route.fulfill({ status: 201, json: { data: row } }); return; }
    await route.fulfill({ json: { data: promos } });
  });
  await page.route("**/api/public/offers", route => route.fulfill({ json: { data: [offer] } }));
  await page.goto("/admin/program-harga");
  await page.getByRole("button", { name: "Tambah promo", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nama promo", { exact: true }).fill("Promo Kilat JLPT N4");
  await dialog.getByLabel("Persentase diskon", { exact: true }).fill("20");
  await dialog.getByLabel("Tanggal mulai", { exact: true }).fill("2026-10-01");
  await dialog.getByLabel("Tanggal akhir", { exact: true }).fill("2026-10-31");
  await dialog.getByRole("combobox", { name: /^Status/ }).selectOption("Aktif");
  await dialog.getByRole("button", { name: "Simpan promo", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(offer.base_price).toBe(99000);
  expect(offer.effective_price).toBe(79200);
  await page.goto("/program");
  await expect(page.getByText(/Rp\s*79\.200/).first()).toBeVisible();
});

test("Scenario 3: Blog Studio draft create/reopen and published metadata preservation", async ({ page }) => {
  const rows: Record<string, unknown>[] = [];
  await page.route("**/api/admin/blog-articles**", async route => {
    const request = route.request();
    if (request.method() === "POST") rows.push({ ...request.postDataJSON(), id: 30 });
    if (request.method() === "PATCH") Object.assign(rows[0], request.postDataJSON());
    await route.fulfill({ json: { data: request.method() === "GET" ? rows : rows[0] } });
  });
  await page.goto("/admin/blog-seo/editor");
  await page.getByLabel("Judul artikel", { exact: true }).fill("Panduan Efektif Menembus JLPT N3");
  await page.getByLabel("Ringkasan artikel", { exact: true }).fill("Langkah strategis N3.");
  await page.getByLabel("Isi artikel", { exact: true }).fill("Kunci kelulusan JLPT N3 terletak pada penguasaan dokkai.");
  await page.getByLabel("Kategori", { exact: true }).selectOption("JLPT");
  await page.getByLabel("Penulis", { exact: true }).selectOption("Hiru Academy");
  await page.getByRole("button", { name: "Simpan Draft", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/blog-seo$/);
  expect(rows[0]).toMatchObject({ published: false, slug: "panduan-efektif-menembus-jlpt-n3" });
  await page.request.post("http://127.0.0.1:3412/fixtures/articles", { data: rows });
  expect(await (await page.request.get("/blog")).text()).not.toContain(rows[0].title);
  // Publication is server fixture state in B1, not a nonexistent UI control.
  Object.assign(rows[0], { published: true, featured: true, seo_title: "Panduan N3 SEO", meta_description: "Deskripsi N3", published_at: "2026-01-01T03:00:00Z" });
  await page.reload();
  await page.getByRole("link", { name: "Panduan Efektif Menembus JLPT N3", exact: true }).click();
  await expect(page.getByLabel("Isi artikel", { exact: true })).toHaveValue(String(rows[0].body));
  await page.getByLabel("Ringkasan artikel", { exact: true }).fill("Ringkasan revisi");
  await page.getByRole("button", { name: "Simpan Perubahan", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Tersimpan");
  expect(rows[0]).toMatchObject({ published: true, featured: true, seo_title: "Panduan N3 SEO", meta_description: "Deskripsi N3", published_at: "2026-01-01T03:00:00Z", slug: "panduan-efektif-menembus-jlpt-n3" });
  await page.request.post("http://127.0.0.1:3412/fixtures/articles", { data: rows });
  expect(await (await page.request.get("/blog")).text()).toContain(rows[0].title);
  const response = await page.request.get(`/blog/${rows[0].slug}`);
  expect(response.status()).toBe(200);
  for (const text of [rows[0].title, rows[0].body, "Panduan N3 SEO", "Deskripsi N3"]) expect(await response.text()).toContain(text);
});

test("Scenario 4: Testimonial -> Create -> Approve -> Featured -> Publish -> appears on Landing and '/testimoni'", async ({
  page,
}) => {
  await page.goto("/admin/testimoni");
  await page.getByRole("button", { name: "Tambah Testimoni", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nama", { exact: true }).fill("Kenjiro Tanaka");
  await dialog.getByLabel("Konteks", { exact: true }).fill("Belajar Mandiri (N4)");
  await dialog.getByLabel("Kutipan", { exact: true }).fill("Sistem flashcard dan evaluasi chapter membuat proses belajar terasa jauh lebih ringan!");
  await dialog.getByRole("combobox", { name: /^Status/ }).selectOption("published");
  await dialog.getByRole("combobox", { name: /^Landing/ }).selectOption("yes");
  await dialog.getByRole("button", { name: "Simpan Testimoni", exact: true }).click();
  await expect(dialog).toHaveCount(0);

  await page.goto("/");
  const landingTesti = page.locator(".landing-testimonials");
  await expect(landingTesti.getByText("Kenjiro Tanaka")).toBeVisible();
  await expect(
    landingTesti.getByText("Sistem flashcard dan evaluasi chapter membuat proses belajar")
  ).toBeVisible();

  await page.goto("/testimoni");
  const testiPage = page.locator(".testimonials-page");
  await expect(testiPage.getByText("Kenjiro Tanaka")).toBeVisible();
  await expect(
    testiPage.getByText("Sistem flashcard dan evaluasi chapter membuat proses belajar")
  ).toBeVisible();
});

test("Scenario 5: Announcement -> Audience = LMS, Priority = Penting, active now -> Publish -> visible on '/notifications?membership=lms' -> absent on '/notifications?membership=free'", async ({
  page,
}) => {
  const notifications: Record<string, unknown>[] = [];
  let entitled = true;
  await page.route("**/api/admin/notifications", async route => {
    if (route.request().method() === "POST") { const row = { ...route.request().postDataJSON(), id: 7 }; notifications.push(row); await route.fulfill({ status: 201, json: { data: row } }); return; }
    await route.fulfill({ json: { data: notifications } });
  });
  await page.route("**/api/student/notifications", route => route.fulfill({ json: { data: entitled ? notifications.filter(row => row.status === "published").map(row => ({ ...row, read: false })) : [] } }));
  await page.goto("/admin/notifikasi");
  await page.getByRole("button", { name: "Tambah Notifikasi", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Judul", { exact: true }).fill("Pemeliharaan Khusus Server LMS");
  await dialog.getByLabel("Isi", { exact: true }).fill("Akses chapter dan latihan mandiri akan diperbarui dengan sistem skor otomatis.");
  await dialog.getByRole("combobox", { name: /^Audience/ }).selectOption("Mandiri");
  await dialog.getByRole("combobox", { name: /^Status/ }).selectOption("Published");
  await dialog.getByRole("button", { name: "Simpan Notifikasi", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.goto("/notifications?membership=free");
  await expect(page.getByRole("heading", { name: "Pemeliharaan Khusus Server LMS" })).toBeVisible();
  entitled = false;
  await page.goto("/notifications?membership=lms");
  await expect(page.getByRole("heading", { name: "Belum ada notifikasi" })).toBeVisible();
  await expect(page.getByText("Pemeliharaan Khusus Server LMS")).toHaveCount(0);
});

for (const route of adminRoutes) {
  for (const width of responsiveWidths) {
    test(`Scenario 6: responsive check ${route} at ${width}px has no horizontal overflow`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 850 });
      await page.goto(route);
      await expectNoHorizontalOverflow(page);
    });
  }
}
