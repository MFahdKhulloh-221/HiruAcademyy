import { test, expect, type Page } from "./canonical-fixture";
import { formatProgramPrice } from "../src/lib/format-program-price";

// Public projections mirror ProgramController / ProgramOfferController, not admin rows.
async function catalogApi(page: Page, options: { guest?: boolean; expired?: boolean } = {}) {
  const programs = [
    { id: 1, code: "n5", slug: "n5", name: "JLPT N5", family: "jlpt" },
    { id: 2, code: "n1", slug: "n1", name: "JLPT N1", family: "jlpt" },
    { id: 3, code: "ssw-food", slug: "ssw-pengolahan-makanan", name: "SSW Pengolahan Makanan", family: "ssw" },
    { id: 4, code: "interview", slug: "persiapan-interview", name: "Persiapan Interview", family: "interview" },
  ].map((program, index) => ({ ...program, description: `Materi ${program.name} dari API`, status: "active", sort_order: index }));
  const offers = programs.flatMap(program => ["lms", "sensei"].map((plan, index) => ({
    id: program.id * 10 + index, program_id: program.id, plan_code: plan,
    base_price: program.id * 100000 + index * 50000, currency: "IDR",
    duration_months: program.id + index + 1, status: "active",
  })));
  const promo = { id: 81, name: "Promo katalog", program_offer_id: 30, discount_percent: 20, status: "active", starts_at: "2020-01-01", ends_at: options.expired ? "2020-01-02" : "2099-01-01", note: null };
  const writes: unknown[] = [];
  const mutations: string[] = [];
  const failures = new Set<string>();
  function projection(offer: typeof offers[number], admin: boolean) {
    const program = programs.find(item => item.id === offer.program_id)!;
    const discount_percent = promo.status === "active" && promo.program_offer_id === offer.id && !options.expired ? promo.discount_percent : 0;
    const discount_amount = Math.round(offer.base_price * discount_percent / 100);
    const data = { id: offer.id, program: { code: program.code, slug: program.slug, name: program.name }, plan_code: offer.plan_code, base_price: offer.base_price, currency: offer.currency, duration_months: offer.duration_months, effective_price: offer.base_price - discount_amount, discount_amount, discount_percent, promotion: discount_percent ? { starts_at: promo.starts_at, ends_at: promo.ends_at } : null };
    return admin ? { ...data, program_id: program.id, status: offer.status, program_status: program.status } : data;
  }
  await page.route(/\/api\/(public\/(programs|offers)|admin\/(programs|offers|promotions)(\/\d+)?|student\/(invoices|access)|me)$/, async route => {
    const path = new URL(route.request().url()).pathname;
    if (failures.has(path)) { await route.fulfill({ status: 503, json: { message: "Katalog sementara gagal dimuat" } }); return; }
    if (path === "/api/me") {
      await route.fulfill({ status: options.guest ? 401 : 200, json: options.guest ? { message: "Unauthenticated." } : { data: { id: 901, name: "Catalog Student", email: "catalog@example.test", whatsapp: "6281999000012", role: new URL(page.url()).pathname.startsWith("/admin") ? "admin" : "student", account_status: "active" } } }); return;
    }
    if (path === "/api/student/access") { await route.fulfill({ json: { data: { learning: {}, replay_levels: [], source_grants: [] } } }); return; }
    if (path === "/api/admin/promotions" && route.request().method() === "POST") {
      mutations.push(path);
      await route.fulfill({ status: 201, json: { data: { ...promo, ...route.request().postDataJSON(), id: 82 } } }); return;
    }
    if (path === "/api/student/invoices") {
      expect(route.request().method()).toBe("POST");
      const body = route.request().postDataJSON(); writes.push(body);
      expect(Object.keys(body)).toEqual(["program_offer_id"]);
      const offer = offers.find(item => item.id === body.program_offer_id)!;
      expect(offer).toBeDefined();
      const price = projection(offer, false);
      // Invoice backend omits program_code; frontend must resolve program_id itself.
      await route.fulfill({ status: 201, json: { data: { id: 501, user_id: 901, program_id: offer.program_id, program_offer_id: offer.id, duration_months: offer.duration_months, plan_code: offer.plan_code, base_price: price.base_price, discount_amount: price.discount_amount, total_price: price.effective_price, status: "draft", created_at: "2026-10-27T00:00:00Z" } } }); return;
    }
    const mutation = path.match(/^\/api\/admin\/(programs|offers|promotions)\/(\d+)$/);
    if (mutation) {
      expect(route.request().method()).toBe("PATCH");
      const row = mutation[1] === "programs" ? programs.find(item => item.id === Number(mutation[2])) : mutation[1] === "offers" ? offers.find(item => item.id === Number(mutation[2])) : promo;
      expect(row).toBeDefined();
      Object.assign(row!, route.request().postDataJSON()); mutations.push(path);
      await route.fulfill({ json: { data: row } }); return;
    }
    const admin = path.startsWith("/api/admin/");
    const data = path.endsWith("programs") ? programs.filter(program => admin || program.status === "active").map(program => admin ? program : (({ id, code, slug, name, description, family }) => ({ id, code, slug, name, description, family }))(program))
      : path.endsWith("promotions") ? [promo]
      : offers.filter(offer => admin || offer.status === "active" && programs.find(program => program.id === offer.program_id)?.status === "active").map(offer => projection(offer, admin));
    await route.fulfill({ json: { data } });
  });
  return { programs, offers, promo, writes, mutations, failures };
}

const money = (value: number) => `Rp ${value.toLocaleString("id-ID")}`;
const summary = (page: Page) => page.getByRole("complementary", { name: "Ringkasan pilihan program dan paket" });

for (const width of [1440, 768, 390]) {
  test(`public catalog swaps API names, prices and durations at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const api = await catalogApi(page);
    await page.goto("/program?level=N5&plan=lms");
    for (const program of api.programs) {
      await page.getByRole("button", { name: `Pilih ${program.name}`, exact: true }).click();
      await page.getByRole("button", { name: "Pilih Belajar Mandiri", exact: true }).click();
      await expect(summary(page)).toContainText(program.name);
      const offer = api.offers.find(item => item.program_id === program.id && item.plan_code === "lms")!;
      await expect(summary(page)).toContainText(formatProgramPrice(offer.id === 30 ? 240000 : offer.base_price));
      await expect(summary(page)).toContainText(`${offer.duration_months} bulan`);
      if (program.family !== "jlpt") await expect(summary(page)).not.toContainText(/JLPT (SSW|INTERVIEW|Persiapan)/i);
    }
    await expect(summary(page).getByRole("link", { name: "Lanjutkan ke Checkout" })).toHaveAttribute("href", "/checkout?program=interview&plan=lms");
    await page.getByRole("button", { name: "Pilih Kelas bersama Sensei", exact: true }).click();
    await expect(summary(page)).toContainText(formatProgramPrice(450000));
    await expect(summary(page)).toContainText("6 bulan");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(api.writes).toEqual([]);
  });

  test(`SSW and interview detail use API identity without JLPT at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const api = await catalogApi(page);
    for (const program of api.programs.filter(item => item.family !== "jlpt")) {
      await page.goto(`/program/${program.slug}`);
      await expect(page.getByRole("main")).toContainText(program.name);
      await expect(page.getByRole("main")).not.toContainText(/JLPT (SSW|INTERVIEW|Persiapan)/i);
      await expect(page.getByRole("main")).not.toContainText("Contoh ini menampilkan JLPT");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.goto(`/checkout?program=${program.code}&plan=lms`);
      await expect(page.locator(".checkout-summary")).toContainText(program.name);
      await expect(page.locator(".checkout-summary")).not.toContainText(/JLPT (SSW|INTERVIEW|Persiapan)/i);
      await expect(page.locator(".checkout-total")).toContainText(money(program.id === 3 ? 240000 : 400000));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(api.writes).toEqual([]);
    }
  });
}

test("inactive program and offer disappear; unavailable detail never falls back to JLPT", async ({ page }) => {
  const api = await catalogApi(page);
  api.programs[2].status = "inactive";
  api.offers.find(item => item.id === 40)!.status = "inactive";
  await page.goto("/program?level=INTERVIEW&plan=lms");
  await expect(page.locator(".public-level").filter({ hasText: "SSW Pengolahan Makanan" })).toHaveCount(0);
  await expect(summary(page).getByRole("link", { name: "Lanjutkan Pendaftaran" })).toHaveCount(0);
  await expect(summary(page).getByRole("button", { name: "Paket belum tersedia" })).toBeDisabled();
  for (const slug of [api.programs[2].slug, "program-tidak-ada"]) {
    await page.goto(`/program/${slug}`);
    await expect(page.getByRole("main")).toContainText(/program tidak tersedia|belum tersedia|tidak ditemukan/i);
    await expect(page.getByRole("main")).not.toContainText("JLPT N4");
  }
});

test("expired promo returns base price in catalog and checkout", async ({ page }) => {
  const api = await catalogApi(page, { expired: true });
  await page.goto("/program?level=SSW&plan=lms");
  await page.getByRole("button", { name: "Pilih Belajar Mandiri", exact: true }).click();
  await expect(summary(page)).toContainText(formatProgramPrice(300000));
  await expect(summary(page)).not.toContainText(formatProgramPrice(240000));
  await page.goto("/checkout?level=SSW&plan=lms");
  await expect(page.locator(".checkout-total")).toContainText(money(300000));
  expect(api.writes).toEqual([]);
});

test("active promo survives checkout and invoice retry without real transaction", async ({ page }) => {
  const api = await catalogApi(page);
  await page.goto("/program?level=SSW&plan=lms");
  await page.getByRole("button", { name: "Pilih Belajar Mandiri", exact: true }).click();
  await expect(summary(page)).toContainText(formatProgramPrice(240000));
  await page.goto("/checkout?level=SSW&plan=lms");
  await expect(page.locator(".checkout-summary")).toContainText("SSW Pengolahan Makanan");
  await expect(page.locator(".checkout-summary")).not.toContainText("JLPT SSW");
  await expect(page.locator(".checkout-total")).toContainText(money(240000));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  api.failures.add("/api/student/invoices");
  await page.getByRole("button", { name: "Buat Invoice", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Invoice gagal dibuat");
  expect(api.writes).toEqual([]);
  api.failures.delete("/api/student/invoices");
  await page.getByRole("dialog").getByRole("button", { name: "Coba Lagi" }).click();
  await expect(page.getByRole("dialog")).toContainText("INVOICE BERHASIL DIBUAT");
  for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("link", { name: "Detail Pesanan" })).toBeInViewport();
    expect(await dialog.locator(".admin-dialog-content").evaluate(node => node.scrollHeight <= node.clientHeight)).toBe(true);
  }
  await expect(page.locator(".checkout-total")).toContainText(money(240000));
  await expect(page.locator(".checkout-summary")).toContainText(money(60000));
  expect(api.writes).toEqual([{ program_offer_id: 30 }]);
  expect(page.context().pages()).toHaveLength(1);
});

test("pricing API 503 retry and invalid offer checkout zero invoice request", async ({ page }) => {
  const api = await catalogApi(page);
  api.failures.add("/api/public/offers");
  await page.goto("/program?level=N5&plan=lms");
  const alert = page.getByRole("main").getByRole("alert");
  await expect(alert).toContainText("Permintaan belum berhasil. Silakan coba lagi.");
  api.failures.delete("/api/public/offers");
  await alert.getByRole("button", { name: /Coba lagi/i }).click();
  await expect(alert).toHaveCount(0);
  await expect(summary(page)).toContainText(formatProgramPrice(100000));

  api.offers.find(item => item.id === 20)!.status = "inactive";
  await page.goto("/checkout?level=N1&plan=lms");
  const submit = page.getByRole("button", { name: "Buat Invoice", exact: true });
  await expect(submit).toBeDisabled();
  await expect(page.locator(".checkout-summary")).toContainText(/Program belum tersedia|Belum tersedia/);
  expect(api.writes).toEqual([]);
});

test("admin promo editor handles optional dates and rounding preview", async ({ page }) => {
  const api = await catalogApi(page);
  await page.goto("/admin/program-harga");
  await page.getByRole("button", { name: "Tambah promo", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nama promo").fill("Promo Bulat");
  await dialog.getByLabel("Persentase diskon", { exact: true }).fill("33");
  await expect(dialog).toContainText("Harga normal: Rp100.000");
  await expect(dialog).toContainText("Diskon: Rp33.000");
  await expect(dialog).toContainText("Harga promosi: Rp67.000");
  await dialog.getByRole("button", { name: "Simpan promo", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(api.mutations.length).toBeGreaterThan(0);
});

test("landing minimum price CTA preserves chosen API offer", async ({ page }) => {
  const api = await catalogApi(page);
  api.offers.find(item => item.id === 10)!.base_price = 500000;
  await page.goto("/");
  const card = page.locator(".landing-price-card").filter({ has: page.getByRole("link", { name: "Pilih Mandiri", exact: true }) });
  await expect(card).toContainText(formatProgramPrice(200000));
  const link = card.getByRole("link", { name: "Pilih Mandiri", exact: true });
  await expect(link).toHaveAttribute("href", /\/program\?(?=.*level=n1)(?=.*plan=lms)/);
  await link.click();
  await expect(summary(page)).toContainText("JLPT N1");
  await expect(summary(page)).toContainText(formatProgramPrice(200000));
  await expect(summary(page)).toContainText("3 bulan");
  expect(api.writes).toEqual([]);
});

test("catalog API error offers explicit retry", async ({ page }) => {
  const api = await catalogApi(page);
  api.failures.add("/api/public/programs");
  await page.goto("/program");
  const alert = page.getByRole("main").getByRole("alert");
  await expect(alert).toContainText("Permintaan belum berhasil. Silakan coba lagi.");
  api.failures.delete("/api/public/programs");
  await alert.getByRole("button", { name: /Coba lagi/i }).click();
  await expect(page.locator(".public-level").filter({ hasText: "SSW Pengolahan Makanan" })).toBeVisible();
  await expect(alert).toHaveCount(0);
});

test("guest registration preserves selected API program without creating invoice", async ({ page }) => {
  const api = await catalogApi(page, { guest: true });
  await page.goto("/program?level=SSW&plan=lms");
  await page.getByRole("button", { name: "Pilih Belajar Mandiri", exact: true }).click();
  await expect(summary(page)).toContainText("SSW Pengolahan Makanan");
  await summary(page).getByRole("link", { name: "Lanjutkan Pendaftaran" }).click();
  await expect(page).toHaveURL(/\/register\?/);
  const params = new URL(page.url()).searchParams;
  expect(params.get("program") ?? params.get("placement") ?? params.get("level")).toMatch(/^(SSW|ssw-food)$/);
  expect(params.get("plan")).toBe("lms");
  expect(api.writes).toEqual([]);
});

test("admin program and promo status changes persist into public projections", async ({ page }) => {
  const api = await catalogApi(page);
  await page.goto("/admin/kurikulum-materi?tab=Program");
  const row = page.getByRole("row").filter({ has: page.getByRole("cell", { name: "SSW Pengolahan Makanan", exact: true }) });
  await row.getByRole("button", { name: "Nonaktifkan", exact: true }).click();
  await expect(row).toContainText("Nonaktif");
  await page.reload();
  await expect(row).toContainText("Nonaktif");
  await page.goto("/program");
  await expect(page.locator(".public-level").filter({ hasText: "SSW Pengolahan Makanan" })).toHaveCount(0);
  await page.goto("/admin/kurikulum-materi?tab=Program");
  await row.getByRole("button", { name: "Aktifkan", exact: true }).click();
  await expect(row).toContainText("Aktif");
  await page.goto("/admin/program-harga");
  await page.getByRole("button", { name: "Nonaktifkan promo Promo katalog", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Konfirmasi", exact: true }).click();
  await expect(page.getByRole("button", { name: "Aktifkan promo Promo katalog", exact: true })).toBeVisible();
  await page.goto("/program?level=SSW&plan=lms");
  await page.getByRole("button", { name: "Pilih Belajar Mandiri", exact: true }).click();
  await expect(summary(page)).toContainText(formatProgramPrice(300000));
  expect(api.mutations).toEqual(["/api/admin/programs/3", "/api/admin/programs/3", "/api/admin/promotions/81"]);
  expect(api.writes).toEqual([]);
});

for (const width of [1440, 768, 390]) {
  test(`journey grid, API-only offers and selection at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const api = await catalogApi(page);
    api.programs.push(...["n4", "n3", "n2"].map((code, index) => ({ id: index + 5, code, slug: code, name: `JLPT ${code.toUpperCase()}`, family: "jlpt", description: `Deskripsi ${code} dari API`, status: "active", sort_order: index + 5 })));
    api.offers.push(...api.programs.filter(program => program.id >= 5).flatMap(program => ["lms", "sensei"].map((plan_code, index) => ({ id: program.id * 10 + index, program_id: program.id, plan_code, base_price: program.id * 100000 + index * 50000, currency: "IDR", duration_months: index + 2, status: "active" }))));
    await page.goto("/program?level=N5&plan=lms");
    await expect(page.getByRole("heading", { name: "Satu langkah lebih dekat ke Jepang." })).toBeVisible();
    await expect(page.getByText("Pilih program belajarmu", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Tes Level Gratis" })).toHaveAttribute("href", "/placement");
    const cards = page.locator(".public-levels > article");
    await expect(cards).toHaveCount(8);
    const columns = await page.locator(".public-levels").evaluate(node => getComputedStyle(node).gridTemplateColumns.split(" ").length);
    expect(columns).toBe(width >= 1024 ? 3 : width >= 640 ? 2 : 1);
    await page.getByRole("button", { name: "Pilih JLPT N3", exact: true }).click();
    await expect(page.getByRole("button", { name: "Pilih JLPT N3", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".public-level.selected")).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Pilih metode belajar ? JLPT N3" })).toBeVisible();
    await expect(page.locator(".program-pricing-section .pricing-card")).toHaveCount(2);
    await expect(page.locator(".program-pricing-section")).not.toContainText("Coba Gratis");
    await page.getByRole("button", { name: "Pilih Kelas bersama Sensei", exact: true }).click();
    await expect(summary(page)).toContainText(formatProgramPrice(650000));
    await expect(summary(page)).toContainText("3 bulan");
    await expect(summary(page).getByRole("link", { name: "Lanjutkan ke Checkout" })).toHaveAttribute("href", "/checkout?program=n3&plan=sensei");
    api.offers.find(offer => offer.program_id === 5 && offer.plan_code === "sensei")!.status = "inactive";
    await page.reload();
    await page.getByRole("button", { name: "Pilih Kelas bersama Sensei", exact: true }).click();
    await page.getByRole("button", { name: "Pilih JLPT N4", exact: true }).click();
    await expect(summary(page)).toContainText("Belajar Mandiri");
    await expect(page.locator(".program-pricing-section .pricing-card")).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(api.writes).toEqual([]);
  });
}
