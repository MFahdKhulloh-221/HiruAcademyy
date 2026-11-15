import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) test(`daily empty states and navigation ${width}`, async ({ page, baseURL }) => {
  await page.setViewportSize({ width, height: 950 });
  // UTC date differs from WIB: returning to today must use WIB.
  await page.clock.install({ time: new Date("2026-11-15T18:00:00Z") });
  await page.context().addCookies([{ name: "XSRF-TOKEN", value: "fixture", url: baseURL! }]);
  let available = false;
  let mutations = 0;
  await page.route(/\/(api\/|sanctum\/csrf-cookie)/, route => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = { "access-control-allow-origin": baseURL!, "access-control-allow-credentials": "true", "access-control-allow-methods": "GET, OPTIONS", "access-control-allow-headers": "accept, content-type, x-xsrf-token" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (request.method() !== "GET") mutations++;
    const reply = (data: unknown) => route.fulfill({ headers, json: { data } });
    if (url.pathname === "/api/me") return reply({ id: 2, name: "Free Student", email: "free@example.test", whatsapp: "081234567890", role: "student", account_status: "active" });
    if (url.pathname === "/api/student/daily-practices") return reply(available ? [{ id: 1, title: "Latihan Kosakata", category: "vocabulary", target_level: "n5", question_count: 5, starts_at: "2026-11-16T01:00:00Z", ends_at: "2026-11-16T16:59:00Z", status: "open" }] : []);
    return route.fulfill({ headers, status: 503, json: {} });
  });
  await page.goto("/practice");
  await expect(page.getByRole("heading", { name: "Belum ada latihan hari ini", exact: true })).toBeVisible();
  await expect(page.getByText("BELUM ADA JADWAL", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pilih Tanggal Lain", exact: true }).click();
  await expect(page.getByLabel("Tanggal (WIB)")).toBeFocused();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Lihat Arsip", exact: true }).click();
  await expect(page.getByRole("button", { name: "Arsip", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await page.getByLabel("Tanggal (WIB)").fill("2026-11-14");
  await expect(page.getByRole("heading", { name: "Belum ada latihan pada tanggal ini", exact: true })).toBeVisible();
  await expect(page.getByText("TANGGAL TANPA LATIHAN", { exact: true })).toBeVisible();
  // Active filters cannot explain an empty source date.
  await page.getByRole("combobox", { name: "Kategori", exact: true }).selectOption("grammar");
  await expect(page.getByRole("heading", { name: "Belum ada latihan pada tanggal ini", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Kembali ke Hari Ini", exact: true }).click();
  await expect(page.getByLabel("Tanggal (WIB)")).toHaveValue("2026-11-16");
  await expect(page.getByRole("heading", { name: "Belum ada latihan hari ini", exact: true })).toBeVisible();
  available = true;
  await page.getByRole("button", { name: "Hari Ini", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tidak ada latihan yang cocok", exact: true })).toBeVisible();
  await expect(page.getByText("HASIL FILTER KOSONG", { exact: true })).toBeVisible();
  await page.getByLabel("Filter Level").selectOption("n5");
  await expect(page.getByRole("heading", { name: "Tetap siap untuk latihan berikutnya", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `C:/Users/Tulo/AppData/Local/Temp/opencode/daily-empty-${width}.png`, fullPage: true });
  await page.getByRole("button", { name: "Reset Filter", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Kategori", exact: true })).toHaveValue("all");
  await expect(page.getByLabel("Filter Level")).toHaveValue("all");
  await expect(page.getByRole("heading", { name: "Latihan Kosakata", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Mulai Latihan/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Informasi daftar kosong" })).toHaveCount(0);
  expect(mutations).toBe(0);
});
