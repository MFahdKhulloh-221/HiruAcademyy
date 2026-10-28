import { expect, test } from "@playwright/test";
import { dashboardFixture, gamificationFixture } from "./canonical-fixture";
import { getDashboardData, getStudentFeatureAccess } from "../src/lib/dashboard-mock";

for (const width of [1440, 390]) {
  test(`C2 learning destinations ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const programs = [{ id: 1, code: "n5", name: "JLPT N5", family: "jlpt" }];
    const access = { learning: { n5: "full" as const }, replay_levels: [], source_grants: [{ plan_code: "lms", program_code: "n5" }] };
    const chapter = { id: 11, chapter_number: 1, title: "Chapter Satu", sort_order: 1, access: "full" as const };
    const progress = { chapter_id: 11, activities: { audio: { total: 1, completed: 0, complete: false }, reading: { total: 1, completed: 0, complete: false } }, mini_unlocked: false };
    const starts: string[] = [];
    let answers: Record<string, string> = {};
    const audioAttempt = () => ({ id: 4, kind: "audio", chapter_id: 11, revision: 1, status: "in_progress", answers, questions: [{ id: 81, question: "Soal latihan existing", options: { A: "Satu", B: "Dua" } }], result: null });
    await page.route(/\/(api\/|sanctum\/csrf-cookie)/, async route => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();
      const headers = { "access-control-allow-origin": "http://localhost:3000", "access-control-allow-credentials": "true", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "accept, content-type, x-xsrf-token" };
      const reply = (data: unknown) => route.fulfill({ headers, json: { data } });
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
      if (path === "/sanctum/csrf-cookie") return route.fulfill({ status: 204, headers: { ...headers, "set-cookie": "XSRF-TOKEN=fixture; Path=/" } });
      if (method === "PUT" && path.endsWith("/attempts/4/answers")) {
        answers = route.request().postDataJSON().answers;
        return reply(audioAttempt());
      }
      if (method === "GET" && path.endsWith("/attempts/4")) return reply(audioAttempt());
      if (method !== "GET") {
        expect(path).toBe("/api/student/programs/1/chapters/11/attempts");
        starts.push(route.request().postDataJSON().kind);
        return reply({ id: 4, kind: route.request().postDataJSON().kind, chapter_id: 11, revision: 0, status: "in_progress", answers: {}, questions: [{ id: 81, question: "Soal latihan existing", options: { A: "Satu", B: "Dua" } }], result: null });
      }
      if (path === "/api/me") return reply({ id: 71, name: "Siswa C2", email: "c2@example.test", whatsapp: "6281999000071", role: "student", account_status: "active" });
      if (path === "/api/public/programs") return reply(programs);
      if (path === "/api/student/access") return reply(access);
      if (path === "/api/student/dashboard") return reply(dashboardFixture(programs, access, () => [chapter], () => progress));
      if (path === "/api/student/gamification") return reply(gamificationFixture);
      if (path === "/api/student/leaderboard") return reply({ scope: "all", entries: [], self: null });
      if (path.endsWith("/chapters")) return reply([chapter]);
      if (path.endsWith("/progress")) return reply(progress);
      if (path === "/api/student/programs/1/chapters/11") return reply({ ...chapter, flashcards: [{ id: 21, japanese: "猫", reading: "ねこ", meaning: "Kucing", example: "猫です。", sort_order: 1 }], modules: [], video_lessons: [] });
      if (path === "/api/student/flashcards") return reply({ metrics: { cards_studied: 0, cards_available: 1, decks_completed: 0, streak_days: 0 }, decks: [{ id: 11, program_code: "n5", program_name: "JLPT N5", level: "N5", chapter_number: 1, chapter_title: "Chapter Satu", title: "Kosakata", category: "Kosakata", card_count: 1, progress: 0, glyph: "猫", description: "Kartu kosakata", action: "Mulai", cta_label: "Mulai Flashcard", locked: false, href: "/learn/n5/chapter-1/flashcards" }] });
      return reply([]);
    });
    await page.goto("/dashboard");
    const practice = page.locator('main a[href^="/practice"]').filter({ hasText: 'Soal Audio/Reading' });
    const flashcards = page.locator('main a[href^="/flashcards"]');
    await expect(practice).toContainText("Soal Audio/Reading & materi chapter");
    await expect(flashcards).toContainText("Hafalan kosakata dengan kartu belajar");
    await page.screenshot({ path: testInfo.outputPath(`dashboard-${width}.png`), fullPage: true });
    await practice.click();
    await expect(page.getByRole("heading", { name: "Latihan Harian" })).toBeVisible();
    const cards = page.locator(".practice-journey-card");
    await expect(cards).toHaveCount(2);
    await expect(page.getByRole("link", { name: "Belajar Flashcard", exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`practice-${width}.png`), fullPage: true });
    for (const category of ["Audio", "Reading"]) {
      await cards.filter({ hasText: `| ${category}` }).getByRole("button", { name: "Kerjakan Latihan" }).click();
      await expect(page.getByRole("heading", { name: "Soal latihan existing" })).toBeVisible();
      await page.getByRole("button", { name: "Kembali ke Daftar Latihan" }).click();
    }
    expect(starts).toEqual(["audio", "reading"]);
    await cards.filter({ hasText: "| Audio" }).getByRole("button", { name: "Kerjakan Latihan" }).click();
    await expect(page.getByRole("heading", { name: "Soal latihan existing" })).toBeVisible();
    const saved = page.waitForResponse(response => response.request().method() === "PUT" && response.url().endsWith("/attempts/4/answers"));
    await page.getByRole("radio", { name: "A. Satu" }).check();
    await saved;
    await expect(page.getByRole("status").filter({ hasText: "Tersimpan" })).toBeVisible();
    await page.getByRole("button", { name: "Kembali ke Daftar Latihan" }).click();
    await cards.filter({ hasText: "| Audio" }).getByRole("button", { name: "Kerjakan Latihan" }).click();
    await expect(page.getByRole("radio", { name: "A. Satu" })).toBeChecked();
    answers = { "81": "B" };
    await page.reload();
    await expect(page.getByRole("radio", { name: "B. Dua" })).toBeChecked();
    answers = { "81": "A" };
    await page.goto("/learn/n5/chapter-1/audio?start=1");
    await expect(page.getByRole("radio", { name: "A. Satu" })).toBeChecked();
    await page.getByRole("link", { name: "Kembali ke Aktivitas Chapter" }).click();
    await expect(page).toHaveURL(/\/learn\/n5\/chapter-1$/);
    await page.goto("/learn/n5/chapter-1/audio?start=1");
    await expect(page.getByRole("radio", { name: "A. Satu" })).toBeChecked();
    if (width === 390) await page.getByRole("button", { name: "Buka navigasi" }).click();
    await page.getByRole("link", { name: "Dashboard", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Soal latihan existing" })).toHaveCount(0);
    await page.goto("/learn/n5/chapter-1/audio?start=1");
    await expect(page.getByRole("radio", { name: "A. Satu" })).toBeChecked();
    expect(starts).toEqual(["audio", "reading"]);
    await page.goto("/dashboard");
    await page.locator('main a[href^="/flashcards"]').click();
    await expect(page.getByRole("heading", { name: "Flashcard Kosakata" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`flashcards-${width}.png`), fullPage: true });
    await page.getByRole("link", { name: /Mulai Flashcard/ }).click();
    const card = page.locator(".flashcard-surface");
    await expect(card).toBeVisible();
    await card.press("Enter");
    await expect(card).toHaveAttribute("aria-pressed", "true");
    await expect(card).toHaveClass(/flipped/);
    await expect(card).toContainText("Kucing");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("C2 preserves Sensei actions and entitlement states", () => {
  const sensei = getDashboardData("sensei").config.quickActions;
  for (const feature of ["journey", "schedule", "replay", "ask-sensei", "community", "affiliate", "practice", "flashcards"]) expect(sensei.some(action => action.feature === feature)).toBe(true);
  for (const membership of ["free", "lms", "sensei"] as const) {
    const actions = getDashboardData(membership).config.quickActions;
    for (const feature of ["practice", "flashcards"] as const) {
      expect(actions.find(action => action.feature === feature)?.access).toBe("available");
      expect(getStudentFeatureAccess(membership, feature)).toBe(membership === "free" ? "limited" : "available");
    }
  }
});
