import { expect, test, type Page } from "@playwright/test";

async function mockPlacement(page: Page, adaptive: boolean | undefined, description: string, duration: number | null = 7) {
  const state = { starts: 0, fail: false, reads: 0 };
  await page.route(/\/(api\/|sanctum\/csrf-cookie)/, async route => {
    const path = new URL(route.request().url()).pathname;
    const headers = { "access-control-allow-origin": "http://localhost:3000", "access-control-allow-credentials": "true", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "accept, content-type, x-xsrf-token" };
    const reply = (data: unknown, status = 200) => route.fulfill({ status, headers, json: { data } });
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (path === "/api/me") return reply(null, 401);
    if (path === "/sanctum/csrf-cookie") return route.fulfill({ status: 204, headers: { ...headers, "set-cookie": "XSRF-TOKEN=fixture; Path=/" } });
    if (path === "/api/placement") return reply({ id: 1, title: "Placement", intro_heading: "Petunjuk dari Admin", description, adaptive, duration_minutes: duration, question_count: 15, is_ready: true, questions: [] });
    if (path === "/api/placement/attempts" && route.request().method() === "POST") {
      state.starts++;
      if (state.fail) return reply(null, 503);
      return reply({ id: 12, status: "in_progress", answers: {}, questions: [] }, 201);
    }
    if (path === "/api/placement/attempts/12") {
      state.reads++;
      return reply({ id: 12, status: "in_progress", adaptive, questions: [{ id: 41, category: "Bunpou", prompt: "Placement runner existing", options: { A: "First", B: "Second" } }], answers: {}, result: null });
    }
    return reply([]);
  });
  return state;
}

for (const width of [1440, 390]) {
  for (const adaptive of [false, true]) {
    test(`B2-B instructions ${width} adaptive ${adaptive}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      const description = adaptive ? "   " : "Instruksi utama Admin: kerjakan dengan teliti.";
      const state = await mockPlacement(page, adaptive, description, adaptive ? null : 7);
      await page.goto("/placement");
      await expect(page.getByRole("heading", { name: "Petunjuk dari Admin" })).toBeVisible();
      await expect(page.getByText(adaptive ? "Kenali kemampuan bahasa Jepangmu untuk mendapatkan rekomendasi level belajar." : description, { exact: true })).toHaveCount(1);
      await expect(page.getByText("Pilih satu jawaban untuk setiap soal.", { exact: true })).toBeVisible();
      const guide = page.locator(".placement-guide-tips");
      await expect(guide).toContainText(adaptive ? "jawaban sebelumnya tidak dapat diubah" : "Jawaban dapat diubah sebelum tes diselesaikan");
      if (adaptive) {
        await expect(guide).not.toContainText("Sebelumnya");
        await expect(page.locator(".public-pills")).not.toContainText("menit");
      } else await expect(guide).toContainText("7 menit");
      expect(state.starts).toBe(0);
      const start = page.getByRole("button", { name: "Mulai Placement Test Gratis" });
      await expect(start).toBeDisabled();
      await page.screenshot({ path: testInfo.outputPath(`placement-${width}-${adaptive ? "fallback" : "admin"}.png`), fullPage: true });
      await page.getByRole("link", { name: "Mulai Tes", exact: true }).click();
      expect(state.starts).toBe(0);
      await page.getByPlaceholder("Masukkan nama").fill("A");
      await page.getByRole("textbox", { name: "Nomor WhatsApp", exact: true }).fill("081234567890");
      await page.getByRole("combobox", { name: "Target Ujian" }).selectOption("N5");
      await page.locator('input[name="privacy"]').check();
      await start.click();
      await expect(page.getByText("Mohon isi nama lengkap kamu (minimal 2 huruf).", { exact: true })).toBeVisible();
      expect(state.starts).toBe(0);
      await page.getByPlaceholder("Masukkan nama").fill("Siswa Hiru");
      state.fail = true;
      await start.click();
      await expect(page.locator(".placement-error-alert")).toBeVisible();
      await expect(start).toBeEnabled();
      expect(state.starts).toBe(1);
      state.fail = false;
      await start.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
      await expect(page).toHaveURL(/placement\/question\?attempt=12/);
      await expect(page.getByRole("heading", { name: "Placement runner existing" })).toBeVisible();
      expect(state.starts).toBe(2);
      await page.goBack();
      await expect(page).toHaveURL(/\/placement#placement-form$/);
      await expect(page.getByRole("heading", { name: "Petunjuk dari Admin" })).toBeVisible();
      await page.goForward();
      await expect(page.getByRole("heading", { name: "Placement runner existing" })).toBeVisible();
      expect(state.starts).toBe(2);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}
