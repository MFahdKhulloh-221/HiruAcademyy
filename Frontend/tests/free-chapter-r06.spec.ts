import { expect, test, type Page } from "@playwright/test";
import { freeChapterDestination, freeChapterPath } from "../src/lib/free-chapter";

async function mockChapter(page: Page, loggedIn: boolean, available = true) {
  const state = { loggedIn };
  const user = { id: 77, name: "Siswa", email: "siswa@example.test", whatsapp: "081234567890", role: "student", account_status: "active" };
  const program = { id: 17, code: "dasar", name: "DASAR", family: "japanese" };
  const chapter = { id: 93, chapter_number: 1, title: "Dasar Chapter Satu", access: "preview", video_lessons: [{ id: 94, title: "Pelafalan DASAR", video_url: "https://example.test/lesson.mp4" }], modules: [], flashcards: [] };
  await page.context().addCookies([{ name: "XSRF-TOKEN", value: "fixture", url: "http://localhost:3000" }]);
  await page.route(/\/(api\/|sanctum\/csrf-cookie)/, route => {
    const path = new URL(route.request().url()).pathname;
    const reply = (data: unknown, status = 200) => route.fulfill({ status, json: { data } });
    if (path === "/api/me") return reply(state.loggedIn ? user : null, state.loggedIn ? 200 : 401);
    if (path === "/sanctum/csrf-cookie") return route.fulfill({ status: 204 });
    if (["/api/auth/login", "/api/auth/register"].includes(path)) { state.loggedIn = true; return reply(user); }
    if (path === "/api/student/dashboard") return reply({ programs: [program], access: { learning: { dasar: "preview" }, replay_levels: [], source_grants: [] }, chapters: [] });
    if (path === "/api/student/programs/17/chapters") return reply(available ? [chapter] : []);
    if (path === "/api/student/programs/17/chapters/93") return reply(chapter);
    if (path === "/api/student/programs/17/chapters/93/progress") return reply({ chapter_id: 93, activities: { video: { total: 1, completed: 0, complete: false } }, mini_unlocked: false });
    return reply([]);
  });
}

for (const width of [390, 1440]) {
  test(`R06 guest login reaches actual DASAR material ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockChapter(page, false);
    await page.goto("/");
    const section = page.locator(".final-cta");
    await expect(section).not.toContainText("Sudah punya target?");
    await section.getByRole("link", { name: "Coba Chapter 1 Gratis", exact: true }).click();
    await expect(page).toHaveURL(/\/login\?next=/);
    await expect(page.getByRole("link", { name: "Daftar", exact: true })).toHaveAttribute("href", `/register?${new URLSearchParams({ next: freeChapterPath })}`);
    await page.getByLabel("Email / WhatsApp").fill("siswa@example.test");
    await page.getByLabel("Kata Sandi", { exact: true }).fill("password123");
    await page.getByRole("button", { name: "Masuk", exact: true }).click();
    await expect(page).toHaveURL(freeChapterPath);
    const video = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Video Lesson", exact: true }) });
    await video.getByRole("link", { name: "Buka", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Pelafalan DASAR", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("R06 authenticated CTA and unpublished chapter", async ({ page }) => {
  await mockChapter(page, true, false);
  await page.goto("/");
  const cta = page.locator(".final-cta").getByRole("link", { name: "Coba Chapter 1 Gratis" });
  await expect(cta).toHaveAttribute("href", freeChapterPath);
  await cta.click();
  await expect(page.getByRole("alert").filter({ hasText: "Chapter 1 gratis DASAR belum tersedia atau belum dipublikasikan." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Buka", exact: true })).toHaveCount(0);
});

test("R06 logged-in visitor opens available chapter directly", async ({ page }) => {
  await mockChapter(page, true);
  await page.goto("/");
  const cta = page.locator(".final-cta").getByRole("link", { name: "Coba Chapter 1 Gratis" });
  await expect(cta).toHaveAttribute("href", freeChapterPath);
  await cta.click();
  await expect(page).toHaveURL(freeChapterPath);
  await expect(page.getByRole("heading", { name: "Aktivitas chapter", exact: true })).toBeVisible();
});

test("R06 registration retains free chapter destination", async ({ page }) => {
  await mockChapter(page, false);
  await page.goto(`/login?${new URLSearchParams({ next: freeChapterPath })}`);
  await page.getByRole("link", { name: "Daftar", exact: true }).click();
  await page.getByLabel("Nama Lengkap").fill("Siswa Baru");
  await page.getByLabel("Email", { exact: true }).fill("baru@example.test");
  await page.getByLabel("Nomor WhatsApp", { exact: true }).fill("081234567890");
  await page.getByLabel("Kata Sandi", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Buat Akun", exact: true }).click();
  await expect(page).toHaveURL(freeChapterPath);
  await expect(page.getByRole("heading", { name: "Aktivitas chapter", exact: true })).toBeVisible();
});

test("R06 redirect accepts only exact internal free chapter", () => {
  expect(freeChapterDestination(freeChapterPath)).toBe(freeChapterPath);
  for (const path of [null, "https://evil.test", "//evil.test", "/\\evil.test", "/learn/dasar/chapter-2", `${freeChapterPath}?next=https://evil.test`]) expect(freeChapterDestination(path)).toBeNull();
});
