import { expect, test } from "@playwright/test";

for (const code of ["dasar", "n5", "n4", "n3", "n2", "n1"]) {
  test(`R08 completion indicators follow API progress ${code}`, async ({ page }) => {
    await page.setViewportSize({ width: code === "dasar" ? 390 : 1440, height: 900 });
    const activity = (complete: boolean) => ({ total: 1, completed: Number(complete), complete });
    const activities = { video: activity(true), module: activity(true), flashcard: activity(true), ...(code === "dasar" ? {} : { audio: activity(true), reading: activity(true) }) };
    const chapters = [1, 2, 3].map(number => ({ id: 90 + number, chapter_number: number, title: `Chapter ${number}`, access: number === 3 ? "locked" : "full", video_lessons: [{ id: 1 }], modules: [{ id: 2 }], flashcards: [{ id: 3 }] }));
    await page.route("**/api/**", route => {
      const path = new URL(route.request().url()).pathname;
      const number = Number(path.match(/chapters\/(9[123])/)?.[1] ?? 91) - 90;
      const data = path === "/api/me" ? { id: 77, name: "Siswa", email: "siswa@example.test", whatsapp: "081234567890", role: "student", account_status: "active" }
        : path === "/api/student/dashboard" ? { programs: [{ id: 17, code, name: code.toUpperCase(), family: code === "dasar" ? "foundation" : "jlpt" }], access: { learning: { [code]: "full" }, replay_levels: [], source_grants: [] }, chapters: [] }
        : path.endsWith("/chapters") ? chapters
        : path.endsWith("/progress") ? { chapter_id: 90 + number, activities: number === 1 ? activities : { ...activities, module: activity(false) }, mini_unlocked: false }
        : /chapters\/9[123]$/.test(path) ? chapters[number - 1]
        : [];
      return route.fulfill({ json: { data } });
    });
    await page.goto(`/journey/${code}`);
    const complete = page.locator(".chapter-completed .chapter-number");
    await expect(complete.getByLabel("Selesai")).toHaveCount(1);
    await expect(complete).toHaveCSS("color", "rgb(50, 100, 58)");
    await expect(page.locator(".chapter-current .chapter-number").getByLabel("Selesai")).toHaveCount(0);
    await expect(page.locator(".chapter-entitlementLocked .chapter-number").getByLabel("Terkunci")).toHaveCount(1);
    await page.reload();
    await expect(complete.getByLabel("Selesai")).toHaveCount(1);
    await page.goto(`/learn/${code}/chapter-1`);
    await expect(page.locator(".learning-activity-card.activity-completed .learning-activity-status svg")).toHaveCount(code === "dasar" ? 3 : 5);
    await expect(page.locator(".activity-completed .learning-activity-status").first()).toHaveCSS("color", "rgb(50, 100, 58)");
    await page.goto(`/learn/${code}/chapter-2`);
    await expect(page.getByRole("heading", { name: "Aktivitas chapter", exact: true })).toBeVisible();
    const moduleCard = page.locator(".learning-activity-card").filter({ has: page.getByRole("heading", { name: "Modul", exact: true }) });
    await expect(moduleCard.locator(".learning-activity-status svg")).toHaveCount(0);
    await page.reload();
    await expect(moduleCard.locator(".learning-activity-status")).toHaveText("Belum dimulai");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
