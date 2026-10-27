import { expect, test } from "@playwright/test";

for (const width of [1440, 768, 390]) {
  test(`checkout layout and server referral totals ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    let writes = 0;
    let rejectReferral = false;
    await page.route(/\/(api\/|sanctum\/csrf-cookie)/, async route => {
      const path = new URL(route.request().url()).pathname;
      const headers = { "access-control-allow-origin": "http://localhost:3000", "access-control-allow-credentials": "true", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "accept, content-type, x-xsrf-token" };
      const reply = (data: unknown, status = 200) => route.fulfill({ status, headers, json: { data } });
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      if (path === "/sanctum/csrf-cookie") return route.fulfill({ status: 204, headers: { ...headers, "set-cookie": "XSRF-TOKEN=fixture; Path=/" } });
      if (path === "/api/me") return reply({ id: 7, name: "Siswa", email: "student@example.test", whatsapp: "6281234567890", role: "student", account_status: "active" });
      if (path === "/api/student/access") return reply({ learning: {}, replay_levels: [], source_grants: [] });
      if (path === "/api/public/programs") return reply([{ id: 3, code: "n3" }]);
      if (path === "/api/public/offers") return reply([{ id: 9, program: { code: "n3", name: "JLPT N3", slug: "n3" }, plan_code: "sensei", base_price: 450000, effective_price: 420000, duration_months: 2 }]);
      if (path === "/api/student/invoices") {
        expect(route.request().method()).toBe("POST");
        expect(route.request().postDataJSON()).toEqual({ program_offer_id: 9, referral_code: rejectReferral ? "INVALID" : "VALID" });
        writes++;
        if (rejectReferral) return route.fulfill({ status: 422, headers, json: { message: "Kode referral tidak valid.", errors: { referral_code: ["Kode referral tidak valid."] } } });
        return reply({ id: 42, user_id: 7, program_id: 3, plan_code: "sensei", base_price: 450000, discount_amount: 75000, total_price: 375000, status: "draft" });
      }
      return reply([]);
    });
    await page.goto("/checkout?level=n3&plan=sensei");
    const summary = page.getByRole("complementary", { name: "Ringkasan pesanan" });
    await expect(page.getByRole("heading", { name: "Periksa Pesanan Kamu" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveCount(0);
    await expect(page.getByText("Alur pembayaran", { exact: true })).toHaveCount(0);
    if (width === 1440) {
      const referralTop = (await page.locator(".checkout-referral").boundingBox())!.y;
      expect(Math.abs(referralTop - (await summary.boundingBox())!.y)).toBeLessThanOrEqual(1);
    }
    await expect(summary).toContainText("2 bulan");
    await expect(summary.locator(".checkout-total")).toHaveText("Total TagihanRp 420.000");
    await expect(summary).toContainText("Belum diterapkan");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`checkout-${width}.png`), fullPage: true });
    rejectReferral = true;
    await page.getByLabel("Kode Referral", { exact: true }).fill("INVALID");
    await page.getByRole("button", { name: "Terapkan", exact: true }).click();
    await expect(summary.locator(".checkout-total")).toContainText("Menunggu perhitungan server");
    await page.getByRole("button", { name: "Buat Invoice", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Periksa kembali data yang dimasukkan.");
    await dialog.getByRole("button", { name: "Tutup", exact: true }).click();
    rejectReferral = false;
    await page.getByLabel("Kode Referral", { exact: true }).fill("VALID");
    await page.getByRole("button", { name: "Diterapkan", exact: true }).click();
    await page.getByRole("button", { name: "Buat Invoice", exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    await expect(dialog).toContainText("INVOICE BERHASIL DIBUAT");
    await dialog.getByRole("button", { name: "Tutup", exact: true }).click();
    await expect(summary.locator(".checkout-total")).toHaveText("Total TagihanRp 375.000");
    await expect(summary).toContainText("Rp 75.000");
    expect(writes).toBe(2);
  });
}

test("checkout loading and offer error remain visible", async ({ page }) => {
  await page.route("**/api/me", route => route.fulfill({ json: { data: { id: 7, name: "Siswa", email: "student@example.test", whatsapp: "6281234567890", role: "student", account_status: "active" } } }));
  await page.route("**/api/student/access", route => route.fulfill({ json: { data: { learning: {}, replay_levels: [], source_grants: [] } } }));
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/public/offers", async route => { await pending; await route.fulfill({ status: 503, json: { message: "Harga sedang tidak tersedia." } }); });
  await page.goto("/checkout?level=n3&plan=sensei");
  await expect(page.getByRole("status")).toContainText("Memuat ringkasan");
  release();
  await expect(page.getByRole("complementary", { name: "Ringkasan pesanan" }).getByRole("alert")).toContainText("Permintaan belum berhasil. Silakan coba lagi.");
  await expect(page.getByRole("button", { name: "Buat Invoice", exact: true })).toBeDisabled();
});
