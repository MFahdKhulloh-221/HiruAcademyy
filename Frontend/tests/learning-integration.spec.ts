import { expect, test } from "@playwright/test";

async function mockLearning(page: import("@playwright/test").Page, failCompletion = false) {
  let completions = 0;
  await page.route(/\/(api\/|sanctum\/csrf-cookie)/, async route => {
    const path = new URL(route.request().url()).pathname;
    const data = path === "/api/me" ? { id: 71, name: "Real Student", email: "student@example.test", whatsapp: "081234567890", role: "student", account_status: "active" }
      : path === "/api/public/programs" ? [{ id: 5, code: "n5", name: "JLPT N5", family: "jlpt" }]
      : path === "/api/student/access" ? { learning: { n5: "preview" }, source_grants: [], replay_levels: [] }
      : path.endsWith("/chapters") ? [{ id: 9, chapter_number: 1, title: "Canonical Chapter", sort_order: 0, access: "preview" }]
      : path.endsWith("/chapters/9") ? { id: 9, chapter_number: 1, title: "Canonical Chapter", sort_order: 0, access: "preview", flashcards: [{ id: 1, japanese: "猫", reading: "ねこ", meaning: "Cat", example: "猫です。", sort_order: 0 }], video_lessons: [], modules: [], mini_checkpoint: { exists: true } }
      : path.endsWith("/progress") ? { chapter_id: 9, activities: { flashcard: { total: 1, completed: 0, complete: false } }, mini_unlocked: false }
      : path.endsWith("/completions") ? { chapter_id: 9, activities: { flashcard: { total: 1, completed: 1, complete: true } }, mini_unlocked: true }
      : [];
    if (path === "/sanctum/csrf-cookie") {
      await route.fulfill({ status: 204, headers: { "set-cookie": "XSRF-TOKEN=test; Path=/; SameSite=Lax" } }); return;
    }
    if (path.endsWith("/completions")) {
      completions += 1;
      expect(route.request().postDataJSON()).toEqual({ type: "flashcard" });
      if (failCompletion && completions === 1) { await route.fulfill({ status: 500, json: {} }); return; }
    }
    await route.fulfill({ json: { data } });
  });
  return () => completions;
}

test("flashcard classification stays local; canonical completion retries and repeat remains visible", async ({ page }) => {
  const count = await mockLearning(page, true);
  await page.goto("/learn/n5/chapter-1/flashcards?membership=sensei");
  const repeat = page.getByRole("button", { name: "Ulangi Kartu Sulit" });
  await expect(repeat).toBeVisible();
  await expect(repeat).toBeDisabled();
  await expect(page.getByRole("button", { name: "Sulit", exact: true })).toBeDisabled();
  await page.locator(".flashcard-surface").press("Enter");
  await page.getByRole("button", { name: "Sulit", exact: true }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(page.getByText("FLASHCARD SELESAI")).toHaveCount(0);
  await page.getByRole("button", { name: "Sulit", exact: true }).click();
  await expect(page.getByText("FLASHCARD SELESAI")).toBeVisible();
  expect(count()).toBe(2);
  await repeat.click();
  await page.locator(".flashcard-surface").press("Space");
  await page.getByRole("button", { name: "Mudah", exact: true }).click();
  await expect(page.getByText("FLASHCARD SELESAI")).toBeVisible();
  await expect(repeat).toBeDisabled();
  expect(count()).toBe(2);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.includes("learning-progress")))).toEqual([]);
});

test("free preview mini gate follows canonical progress, not membership query", async ({ page }) => {
  await mockLearning(page);
  await page.goto("/learn/n5/chapter-1?membership=sensei");
  await expect(page.getByRole("heading", { name: "Canonical Chapter" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mini Checkpoint Chapter 1" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Mulai Mini Checkpoint" })).toHaveCount(0);
});

test("practice screen filters by category and level tabs", async ({ page }) => {
  await mockLearning(page);
  await page.goto("/practice");
  await expect(page.getByRole("heading", { name: "Latihan Harian" })).toBeVisible();

  for (const cat of ["Semua", "Kosakata", "Kanji", "Tata Bahasa", "Audio", "Reading"]) {
    await expect(page.getByRole("tab", { name: cat, exact: true })).toBeVisible();
  }

  await page.getByRole("tab", { name: "Audio" }).click();
  await expect(page.getByRole("heading", { name: /Audio/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Kosakata/ })).toHaveCount(0);

  await page.getByRole("tab", { name: "Kosakata" }).click();
  await expect(page.getByRole("heading", { name: /Kosakata/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Audio/ })).toHaveCount(0);
});
