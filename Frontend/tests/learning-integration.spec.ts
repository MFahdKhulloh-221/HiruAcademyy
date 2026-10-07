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
  await expect(page.locator(".flashcard-inner")).toHaveCSS("transition-duration", "0.6s");
  await page.locator(".flashcard-surface").press("Enter");
  await page.getByRole("button", { name: "Sulit", exact: true }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(page.getByText("FLASHCARD SELESAI")).toBeVisible();
  await expect(page.getByRole("link", { name: "Kembali ke Aktivitas Chapter" })).toBeVisible();
  await page.getByRole("button", { name: "Coba Lagi", exact: true }).click();
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

test("classification advances locally and difficult retry contains only difficult cards", async ({ page }) => {
  const count = await mockLearning(page);
  await page.route("**/api/student/programs/5/chapters/9", route => route.fulfill({ json: { data: { id: 9, chapter_number: 1, title: "Canonical Chapter", sort_order: 0, access: "preview", flashcards: [{ id: 1, japanese: "猫", reading: "ねこ", meaning: "Cat", sort_order: 0 }, { id: 2, japanese: "犬", reading: "いぬ", meaning: "Dog", sort_order: 1 }] } } }));
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/student/programs/5/chapters/9/completions", async route => { await gate; await route.fallback(); });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/learn/n5/chapter-1/flashcards");
  const difficultTerm = await page.locator(".flash-front ruby").textContent();
  await page.locator(".flashcard-surface").press("Enter");
  expect(await page.locator(".flashcard-inner").evaluate(element => parseFloat(getComputedStyle(element).transitionDuration))).toBeLessThanOrEqual(0.01);
  await page.getByRole("button", { name: "Sulit", exact: true }).click();
  await expect(page.getByText("2 dari 2 kartu")).toBeVisible();
  expect(count()).toBe(0);
  await page.locator(".flashcard-surface").press("Enter");
  await page.getByRole("button", { name: "Mudah", exact: true }).click();
  await expect(page.getByText("FLASHCARD SELESAI")).toBeVisible();
  await expect(page.getByRole("link", { name: /Lanjut Audio/ })).toHaveCount(0);
  release();
  await expect(page.getByText("Progress deck disimpan. Kartu sulit siap diulang.")).toBeVisible();
  await page.getByRole("button", { name: "Ulangi Kartu Sulit" }).click();
  await expect(page.getByText("1 dari 1 kartu")).toBeVisible();
  expect(await page.locator(".flash-front ruby").textContent()).toBe(difficultTerm);
  await page.locator(".flashcard-surface").press("Enter");
  await page.getByRole("button", { name: "Mudah", exact: true }).click();
  await expect(page.getByRole("button", { name: "Ulangi Kartu Sulit" })).toBeDisabled();
  expect(count()).toBe(1);
});

test("free preview mini gate follows canonical progress, not membership query", async ({ page }) => {
  await mockLearning(page);
  await page.goto("/learn/n5/chapter-1?membership=sensei");
  await expect(page.getByRole("heading", { name: "Canonical Chapter" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mini Checkpoint Chapter 1" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Mulai Mini Checkpoint" })).toHaveCount(0);
});

test("journey uses approved descriptions and actual completion percentage", async ({ page }) => {
  await mockLearning(page);
  await page.route("**/api/student/programs/5/chapters/9/progress", route => route.fulfill({ json: { data: { chapter_id: 9, activities: { video: { total: 3, completed: 1, complete: false }, module: { total: 1, completed: 1, complete: true } }, mini_unlocked: false } } }));
  await page.goto("/journey");
  await expect(page.getByText("Tata bahasa dasar, kanji pemula, dan percakapan harian.")).toBeVisible();
  await expect(page.getByText("Chapter 1 tersedia sebagai akses Free pada level ini.")).toBeVisible();
  await page.goto("/journey/n5");
  await expect(page.getByText("50%", { exact: true })).toBeVisible();
  await page.goto("/learn/n5/chapter-1");
  await expect(page.getByRole("progressbar", { name: "Progress chapter" })).toHaveAttribute("value", "50");
});

test("dashboard primary percentage follows selected program real completion", async ({ page }) => {
  await mockLearning(page);
  await page.route("**/api/student/programs/5/chapters/9/progress", route => route.fulfill({ json: { data: { chapter_id: 9, activities: { flashcard: { total: 4, completed: 3, complete: false } }, mini_unlocked: false } } }));
  await page.goto("/dashboard");
  await expect(page.getByText("75%", { exact: true })).toBeVisible();
});

test("zero denominator stays zero and unavailable activities have no links", async ({ page }) => {
  await mockLearning(page);
  await page.route("**/api/student/programs/5/chapters/9/progress", route => route.fulfill({ json: { data: { chapter_id: 9, activities: {}, mini_unlocked: false } } }));
  await page.goto("/learn/n5/chapter-1");
  await expect(page.getByRole("progressbar", { name: "Progress chapter" })).toHaveAttribute("value", "0");
  await expect(page.locator('a[href$="/video"]')).toHaveCount(0);
  await expect(page.getByText("Tonton penjelasan utama chapter.")).toBeVisible();
});

for (const media of [
  { raw: "media/video/test.mp4", resolved: "https://media.example.test/lesson.mp4?signature=abc", native: true },
  { raw: "https://youtu.be/dQw4w9WgXcQ", resolved: "https://youtu.be/dQw4w9WgXcQ", embed: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" },
  { raw: "https://example.test/embed", resolved: "https://youtube.com.evil.test/embed/dQw4w9WgXcQ" },
]) test(`video handles resolved media safely: ${media.resolved}`, async ({ page }) => {
  await mockLearning(page);
  await page.route("**/api/student/programs/5/chapters/9", route => route.fulfill({ json: { data: { id: 9, chapter_number: 1, title: "Canonical Chapter", sort_order: 0, access: "preview", video_lessons: [{ id: 11, title: "Actual video", sort_order: 0, video_url: media.raw, video_url_resolved_url: media.resolved }] } } }));
  await page.goto("/learn/n5/chapter-1/video");
  if (media.native) await expect(page.getByLabel("Actual video")).toHaveAttribute("src", media.resolved);
  else if (media.embed) await expect(page.locator("iframe")).toHaveAttribute("src", media.embed);
  else { await expect(page.locator("iframe, video")).toHaveCount(0); await expect(page.getByText("Belum tersedia", { exact: true })).toBeVisible(); }
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
