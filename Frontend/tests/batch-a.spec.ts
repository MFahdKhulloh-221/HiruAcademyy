import { expect, test, type Page } from "@playwright/test";
import { formatProgramPrice } from "../src/lib/format-program-price";

const programs = ["n5", "n4", "n3", "n2", "n1"].map((code, index) => ({ id: index + 1, code, slug: code, name: `JLPT ${code.toUpperCase()}`, family: "jlpt" }));
const offer = (code: string, price: number, base = price, percent = 0) => ({ program: { code, slug: code, name: code }, plan_code: "lms", base_price: base, effective_price: price, discount_percent: percent, duration_months: 6, currency: "IDR" });
const activity = (total: number, completed: number, complete = false) => ({ video: { total, completed, complete } });
const progress = [activity(1, 1, true), activity(1000, 999), activity(1, 0), {}];

async function mock(page: Page, offers = [offer("n5", 99000, 110000, 10), offer("n1", 90000), offer("ssw-food", 1000)]) {
  await page.route(/\/(api\/|sanctum\/csrf-cookie)/, async route => {
    const path = new URL(route.request().url()).pathname;
    expect(route.request().method()).toBe("GET");
    const data = path === "/api/me" ? { id: 71, name: "Batch A", email: "batch@example.test", whatsapp: "081234567890", role: "student", account_status: "active" }
      : path === "/api/public/programs" ? [...programs, { id: 7, code: "ssw-food", name: "SSW", family: "ssw" }]
      : path === "/api/public/offers" ? offers
      : path === "/api/student/access" ? { learning: { n5: "full" }, replay_levels: [], source_grants: [] }
      : path.endsWith("/chapters") ? progress.map((_, index) => ({ id: index + 1, chapter_number: index + 1, title: `Chapter ${index + 1}`, access: index === 3 ? "locked" : "full" }))
      : path.endsWith("/progress") ? { chapter_id: Number(path.split("/").at(-2)), activities: progress[Number(path.split("/").at(-2)) - 1], mini_unlocked: false }
      : path === "/api/student/programs/1/chapters/1" ? { id: 1, chapter_number: 1, title: "Chapter 1", access: "full", video_lessons: [{ id: 1, title: "Video", sort_order: 0, video_url: null }], modules: [], flashcards: [] }
      : [];
    await route.fulfill({ json: { data } });
  });
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test("compact rupiah preserves exact amounts and unavailable states", () => {
  expect(formatProgramPrice(99000)).toBe("Rp99K");
  expect(formatProgramPrice(350000)).toBe("Rp350K");
  expect(formatProgramPrice(1500000)).toBe("Rp1,5JT");
  expect(formatProgramPrice(99999)).toBe("Rp99,999K");
  expect(formatProgramPrice(0)).toBe("Gratis");
  expect(formatProgramPrice(null)).toBe("Belum tersedia");
});

for (const width of [1440, 390]) {
  test(`pricing and journey responsive ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await mock(page);
    await page.goto("/");
    const landing = page.locator(".landing-price-card").last();
    await expect(landing).toContainText("Mulai dari");
    await expect(landing).toContainText("Rp90K"); // N1 included, cheaper SSW excluded.
    await expect(landing).toContainText("/6 bulan");
    await expect(landing.locator("s")).toHaveCount(0);
    await expect(page.locator(".landing-price-card").first()).toContainText("Gratis");
    await landing.scrollIntoViewIfNeeded();
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`landing-${width}.png`) });
    await page.goto("/program?level=N5&plan=lms");
    const card = page.locator(".pricing-card").last();
    await expect(card).toContainText("Rp99K");
    await expect(card).toContainText("Diskon 10%");
    await expect(card.locator("s")).toHaveText("Rp110K");
    await expect(page.locator(".program-summary-card")).toContainText("Diskon 10%");
    await card.scrollIntoViewIfNeeded();
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`program-promo-${width}.png`) });
    await page.locator(".program-summary-card").screenshot({ path: testInfo.outputPath(`summary-promo-${width}.png`) });
    for (const code of ["N4", "N3", "N2", "N1"]) {
      await page.getByRole("button", { name: new RegExp(`JLPT ${code}`) }).click();
      await expect(card).toContainText(code === "N1" ? "Rp90K" : "Belum tersedia");
    }
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`program-${width}.png`) });
    await page.goto("/journey/n5");
    const chapters = page.locator(".chapter-card");
    await expect(chapters).toHaveCount(4);
    await expect(chapters.nth(0)).toHaveClass(/chapter-completed/);
    await expect(chapters.nth(0).getByLabel("Selesai")).toBeVisible();
    await expect(chapters.nth(0).locator(".chapter-number")).toHaveCSS("color", "rgb(50, 100, 58)");
    await expect(chapters.nth(1)).toHaveClass(/chapter-current/);
    await expect(chapters.nth(1)).toContainText("100%"); // Rounded display must not complete chapter.
    await expect(chapters.nth(1)).toContainText("Sedang berjalan");
    await expect(chapters.nth(2)).toHaveClass(/chapter-available/);
    await expect(chapters.nth(2)).toContainText("Belum dimulai");
    await expect(chapters.nth(3)).toHaveClass(/chapter-entitlementLocked/);
    await expect(chapters.nth(3).getByLabel("Terkunci")).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`journey-${width}.png`), fullPage: true });
    await page.goto("/learn/n5/chapter-1");
    const video = page.locator(".learning-activity-card").first();
    await expect(video).toHaveClass(/activity-completed/);
    await expect(video.getByRole("status")).toContainText("Selesai");
    await expect(video.getByRole("status").locator("svg")).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`chapter-${width}.png`), fullPage: true });
  });
}

for (const state of ["inactive", "expired", "amount-only", "inconsistent", "empty"]) {
  test(`public offer pricing ${state}`, async ({ page }) => {
    // API contract removes inactive/expired promotions; browser receives base price and zero percent.
    const offers = state === "empty" ? [] : [state === "amount-only" ? offer("n5", 99000, 110000) : state === "inconsistent" ? offer("n5", 99000, 110000, 50) : offer("n5", 110000)];
    await mock(page, offers);
    await page.goto("/");
    const card = page.locator(".landing-price-card").last();
    await expect(card).toContainText(state === "empty" ? "Belum tersedia" : state === "amount-only" || state === "inconsistent" ? "Hemat Rp11K" : "Rp110K");
    await expect(card).not.toContainText("Diskon");
    await expect(card.locator("s")).toHaveCount(state === "amount-only" || state === "inconsistent" ? 1 : 0);
  });
}
