import { expect, test } from "@playwright/test";

for (const code of ["dasar", "n5", "n4", "n3", "n2", "n1"]) {
  test(`R07 activity visibility ${code}`, async ({ page }) => {
    await page.route("**/api/**", route => {
      const path = new URL(route.request().url()).pathname;
      const chapter = { id: 93, chapter_number: 1, title: "Chapter Satu", access: "preview", video_lessons: [], modules: [], flashcards: [] };
      const data = path === "/api/me" ? { id: 77, name: "Siswa", email: "siswa@example.test", whatsapp: "081234567890", role: "student", account_status: "active" }
        : path === "/api/student/dashboard" ? { programs: [{ id: 17, code, name: code.toUpperCase(), family: code === "dasar" ? "japanese" : "jlpt" }], access: { learning: { [code]: "preview" }, replay_levels: [], source_grants: [] }, chapters: [] }
        : path.endsWith("/chapters") ? [chapter]
        : path.endsWith("/chapters/93") ? chapter
        : path.endsWith("/progress") ? { chapter_id: 93, activities: { audio: { total: 1, completed: 0, complete: false }, reading: { total: 1, completed: 0, complete: false } }, mini_unlocked: false }
        : [];
      return route.fulfill({ json: { data } });
    });
    await page.goto(`/learn/${code}/chapter-1`);
    await expect(page.getByRole("heading", { name: "Aktivitas chapter", exact: true })).toBeVisible();
    for (const name of ["Audio Question", "Reading Question"]) await expect(page.getByRole("heading", { name, exact: true })).toHaveCount(code === "dasar" ? 0 : 1);
    await expect(page.locator(".learning-activity-card")).toHaveCount(code === "dasar" ? 3 : 5);
  });
}
