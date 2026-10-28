import { expect, test } from "@playwright/test";

for (const width of [1440, 768, 390]) {
  test(`affiliate identity and clipboard ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    let owner = "Pemilik Referral Resmi";
    let code = "REF-AKTIF-2026";
    let status = "active";
    let empty = false;
    let failed = false;
    let userId = 71;
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: (value: string) => new Promise<void>((resolve, reject) => {
        Object.assign(window, { copiedCode: value, resolveCopy: resolve, rejectCopy: reject });
      }) } });
    });
    await page.route(/\/(api\/|sanctum\/csrf-cookie)/, async route => {
      const path = new URL(route.request().url()).pathname;
      const headers = { "access-control-allow-origin": "http://localhost:3000", "access-control-allow-credentials": "true", "access-control-allow-methods": "GET, OPTIONS", "access-control-allow-headers": "accept, content-type, x-xsrf-token" };
      const reply = (data: unknown) => route.fulfill({ headers, json: { data } });
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      expect(route.request().method()).toBe("GET");
      if (path === "/api/me") return reply({ id: userId, name: "Nama Akun Berbeda", email: "student@example.test", whatsapp: "628123456789", role: "student", account_status: "active" });
      if (path === "/api/public/programs") return reply([]);
      if (path === "/api/student/access") return reply({ learning: {}, replay_levels: [], source_grants: [] });
      if (path === "/api/student/affiliate") {
        if (failed) return route.fulfill({ headers, status: 503, json: { message: "API unavailable" } });
        return reply({ affiliate: empty ? null : { id: userId, name: owner, code, status, rate: 12 }, code: empty ? null : code, totals: { pending: 12345, approved: 20000, paid: 30000 } });
      }
      return reply([]);
    });
    await page.goto("/affiliate");
    await expect(page.getByRole("heading", { name: owner, exact: true })).toBeVisible();
    await expect(page.locator("code")).toHaveText(code);
    await expect(page.getByText("Status Affiliate: Aktif", { exact: true })).toBeVisible();
    const button = page.getByRole("button", { name: "Salin Kode Referral", exact: true });
    await button.focus();
    await button.press("Enter");
    await expect(button).toBeDisabled();
    await expect(page.getByText("Kode referral berhasil disalin.", { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => Reflect.get(window, "copiedCode"))).toBe(code);
    await page.evaluate(() => Reflect.get(window, "resolveCopy")());
    await expect(page.getByRole("status").filter({ hasText: "Kode referral berhasil disalin." })).toBeVisible();
    await button.click();
    await expect(page.getByText("Kode referral berhasil disalin.", { exact: true })).toHaveCount(0);
    await page.evaluate(() => Reflect.get(window, "rejectCopy")(new Error("denied")));
    await expect(page.getByRole("alert").filter({ hasText: "Kode referral gagal disalin." })).toBeVisible();
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined }));
    await button.click();
    await expect(page.getByRole("alert").filter({ hasText: "Kode referral gagal disalin." })).toBeVisible();
    expect(await button.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    status = "inactive";
    await page.reload();
    await expect(page.getByText("Status Affiliate: Tidak aktif", { exact: true })).toBeVisible();
    await expect(page.getByText("Belum ada kode referral aktif.", { exact: true })).toBeVisible();
    await expect(button).toHaveCount(0);
    await expect(page.locator("code")).toHaveCount(0);
    empty = true;
    userId = 72;
    await page.reload();
    await expect(page.getByText("Belum ada data affiliate.", { exact: true })).toBeVisible();
    await expect(page.getByText(owner, { exact: true })).toHaveCount(0);
    await expect(page.getByText(code, { exact: true })).toHaveCount(0);
    failed = true;
    await page.reload();
    await expect(page.getByRole("button", { name: "Coba Lagi", exact: true })).toBeVisible();
    empty = false;
    failed = false;
    status = "active";
    owner = "Pemilik Kedua";
    code = "KODE-KEDUA";
    await page.getByRole("button", { name: "Coba Lagi", exact: true }).click();
    await expect(page.getByRole("heading", { name: owner, exact: true })).toBeVisible();
    await expect(page.locator("code")).toHaveText(code);
    await expect(page.getByText("Pemilik Referral Resmi", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Komisi Belum Dicairkan", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
