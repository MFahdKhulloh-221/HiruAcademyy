import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`#19 owner, code, clipboard and empty/error ${width}px; API mocked`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 900 });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    let mode = "active";
    let owner = "Siswa Sakura";
    let code = "HIRU-A1B2C3-D4E5F6";
    await page.route("**/api/**", route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/me") return route.fulfill({ json: { data: { id: 71, name: owner, role: "student", account_status: "active", email: "sakura@example.test", whatsapp: "6281234567890" } } });
      if (path === "/api/student/dashboard") return route.fulfill({ json: { data: { programs: [], access: { learning: {}, replay_levels: [], source_grants: [] } } } });
      if (path === "/api/student/access") return route.fulfill({ json: { data: { learning: {}, replay_levels: [], source_grants: [] } } });
      if (path === "/api/student/affiliate") {
        if (mode === "error") return route.fulfill({ status: 503, json: {} });
        return route.fulfill({ json: { data: {
          affiliate: mode === "empty" ? null : { id: 71, name: owner, code, status: mode === "inactive" ? "inactive" : "active" },
          policy: { enabled: true, inviter_reward: 10000, friend_discount: 5000, minimum_purchase: 0, credit_limit: null, expiry_days: null, combine_promo: false, program_ids: [] },
          totals: { available: 0, pending: 0, reserved: 0, used: 0 }, history: [], usage: [],
        } } });
      }
      return route.fulfill({ json: { data: [] } });
    });
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/student/affiliate", async route => { await pending; await route.fallback(); });
    await page.goto("/affiliate");
    await expect(page.getByText("Memuat kredit diskon...", { exact: true })).toBeVisible();
    await expect(page.locator("code")).toHaveCount(0);
    release();
    await expect(page.getByText(`Nama pemilik: ${owner}`, { exact: true })).toBeVisible();
    await expect(page.locator("code")).toHaveText(code);
    await page.getByRole("button", { name: "Salin Kode", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Kode referral berhasil disalin." })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);
    await page.getByRole("button", { name: "Salin Link", exact: true }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(`https://hiruacademy.id/register?referral=${code}`);
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("denied"); } } }));
    await page.getByRole("button", { name: "Salin Kode", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Gagal menyalin.");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    mode = "inactive";
    await page.reload();
    await expect(page.getByText(/Hubungi Admin untuk informasi aktivasi/)).toBeVisible();
    await expect(page.locator("code")).toHaveCount(0);
    mode = "empty";
    await page.reload();
    await expect(page.getByText(/Kode referral belum tersedia/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Salin Kode", exact: true })).toHaveCount(0);
    mode = "error";
    await page.reload();
    await expect(page.getByRole("button", { name: "Coba Lagi", exact: true })).toBeVisible();
    await expect(page.locator("code")).toHaveCount(0);
    mode = "active"; owner = "Siswa Kedua"; code = "HIRU-SECOND";
    await page.getByRole("button", { name: "Coba Lagi", exact: true }).click();
    await expect(page.getByText(`Nama pemilik: ${owner}`, { exact: true })).toBeVisible();
    await expect(page.locator("code")).toHaveText(code);
    await expect(page.getByText("Nama pemilik: Siswa Sakura", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Riwayat Referral", exact: true })).toBeVisible();
  });
}
