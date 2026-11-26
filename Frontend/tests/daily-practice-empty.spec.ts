import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) test(`daily empty catalog and category navigation ${width}`, async ({ page, baseURL }) => {
  await page.setViewportSize({ width, height: 950 });
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
    if (url.pathname === "/api/student/daily-practices") {
      expect(url.search).toBe("");
      return reply(available ? [{ id: 1, title: "Latihan Kosakata", category: "vocabulary", target_level: "n5", question_count: 5, status: "open", starts_at: null, ends_at: null }] : []);
    }
    return route.fulfill({ headers, status: 503, json: {} });
  });
  await page.goto("/practice");
  const emptyHeading = page.getByRole("heading", { name: "Belum ada latihan tersedia", exact: true });
  const categories = page.getByRole("region", { name: "Kategori latihan", exact: true });
  await expect(emptyHeading).toBeVisible();
  await expect(page.getByText("Latihan untuk kategori ini belum tersedia. Kamu dapat memilih kategori lainnya.", { exact: true })).toBeVisible();
  for (const label of ["Kosakata & Kanji", "Pola Kalimat", "Reading", "Audio"]) await expect(categories.getByRole("button", { name: `${label} 0 paket latihan`, exact: true })).toBeVisible();
  await expect(page.locator('input[type="date"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Arsip", exact: true })).toHaveCount(0);
  await categories.getByRole("button", { name: "Pola Kalimat 0 paket latihan", exact: true }).click();
  await expect(emptyHeading).toBeVisible();
  await expect(categories.getByRole("button", { name: "Pola Kalimat 0 paket latihan", exact: true })).toHaveAttribute("aria-pressed", "true");
  available = true;
  await page.reload();
  await expect(page.getByRole("heading", { name: "Latihan Kosakata", exact: true })).toBeVisible();
  await categories.getByRole("button", { name: "Pola Kalimat 0 paket latihan", exact: true }).click();
  await page.getByLabel("Filter Level").selectOption("n5");
  await expect(emptyHeading).toBeVisible();
  await expect(categories.getByRole("button", { name: "Kosakata & Kanji 1 paket latihan", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `C:/Users/Tulo/AppData/Local/Temp/opencode/daily-empty-${width}.png`, fullPage: true });
  await page.getByRole("button", { name: "Reset Filter", exact: true }).click();
  await expect(page.getByRole("button", { name: "Semua Latihan", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Filter Level")).toHaveValue("all");
  await expect(page.getByRole("heading", { name: "Latihan Kosakata", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Mulai Latihan/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Informasi daftar kosong" })).toHaveCount(0);
  expect(mutations).toBe(0);
});
