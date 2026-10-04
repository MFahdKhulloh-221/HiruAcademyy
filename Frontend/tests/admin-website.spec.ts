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

test("Scenario 1: approved Landing copy remains static and Admin cannot publish replacement", async ({ page }) => {
  await page.goto("/");
  const approvedHeading = await page.getByRole("heading", { level: 1 }).textContent();
  await page.goto("/admin/landing-page");
  await expect(page.getByLabel("Judul Utama (Headline)")).toBeDisabled();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(approvedHeading ?? "");
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

test("Scenario 3: Blog authoring -> Title, slug, summary, body blocks, SEO -> Draft hidden on '/blog' -> Publish -> visible on '/blog' -> open '/blog/article?slug=...' shows content", async ({
  page,
}) => {
  await page.goto("/admin/blog-seo");
  await page.getByRole("button", { name: "Tambah Artikel", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.getByLabel("Judul Artikel").fill("Panduan Efektif Menembus JLPT N3");
  await page.getByRole("textbox", { name: /^Excerpt/ }).fill("Langkah strategis memahami materi N3 dengan efisien dan terarah.");
  await page.getByRole("textbox", { name: /^Isi Artikel/ }).fill("Kunci kelulusan JLPT N3 terletak pada penguasaan dokkai dan variasi pola tata bahasa.");
  await page.getByRole("tab").filter({ hasText: "SEO" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("textbox", { name: /^Slug/ }).fill("panduan-efektif-menembus-jlpt-n3");
  await page.getByRole("textbox", { name: /^SEO Title/ }).fill("Panduan Efektif Menembus JLPT N3 - Hiru Academy");
  await page
    .getByLabel(/Meta Description/)
    .fill("Pelajari panduan komprehensif menghadapi ujian JLPT N3 bersama Sensei.");

  await page.getByRole("button", { name: "Simpan Artikel", exact: true }).click();

  await page.goto("/blog");
  await expect(page.getByText("Panduan Efektif Menembus JLPT N3")).toHaveCount(0);

  await page.goto("/admin/blog-seo");
  const draftRow = page.getByRole("row").filter({ hasText: "Panduan Efektif Menembus JLPT N3" });
  await expect(draftRow).toBeVisible();
  await draftRow.getByRole("button", { name: "Publikasikan artikel Panduan Efektif Menembus JLPT N3", exact: true }).click();
  await expect(draftRow).toContainText("Published");

  await page.goto("/blog");
  await expect(
    page.getByRole("heading", { name: "Panduan Efektif Menembus JLPT N3" })
  ).toBeVisible();

  await page.goto("/blog/article?slug=panduan-efektif-menembus-jlpt-n3");
  await expect(
    page.getByRole("heading", { level: 1, name: "Panduan Efektif Menembus JLPT N3" })
  ).toBeVisible();
  await expect(
    page.getByText("Kunci kelulusan JLPT N3 terletak pada penguasaan dokkai")
  ).toBeVisible();
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
