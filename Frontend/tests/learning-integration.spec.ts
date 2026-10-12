import { expect, test } from "@playwright/test";
import { dashboardFixture, gamificationFixture, leaderboardFixture } from "./canonical-fixture";
import type { ChapterProgress } from "../src/lib/learning-api";

async function mockLearning(page: import("@playwright/test").Page, failCompletion = false, dashboardProgress: ChapterProgress = { chapter_id: 9, activities: { flashcard: { total: 1, completed: 0, complete: false } }, mini_unlocked: false }) {
  let completions = 0;
  await page.route(/\/(api\/|sanctum\/csrf-cookie)/, async route => {
    const path = new URL(route.request().url()).pathname;
    const data = path === "/api/me" ? { id: 71, name: "Real Student", email: "student@example.test", whatsapp: "081234567890", role: "student", account_status: "active" }
      : path === "/api/public/programs" ? [{ id: 5, code: "n5", name: "JLPT N5", family: "jlpt" }]
      : path === "/api/student/dashboard" ? dashboardFixture([{ id: 5, code: "n5", name: "JLPT N5", family: "jlpt" }], { learning: { n5: "preview" }, source_grants: [], replay_levels: [] }, () => [{ id: 9, chapter_number: 1, title: "Canonical Chapter", sort_order: 0, access: "preview" }], () => dashboardProgress)
      : path === "/api/student/leaderboard" ? leaderboardFixture()
      : path === "/api/student/gamification" ? gamificationFixture
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
  await expect(page.getByRole("button", { name: "Sulit", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Mudah", exact: true })).toBeEnabled();
  await expect(page.locator(".flashcard-inner")).toHaveCSS("transition-duration", "0.6s");
  await page.getByRole("button", { name: "Sulit", exact: true }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(page.getByText("FLASHCARD SELESAI")).toBeVisible();
  await expect(page.getByRole("link", { name: "Kembali ke Aktivitas Chapter" })).toBeVisible();
  await page.getByRole("button", { name: "Coba Lagi", exact: true }).click();
  await expect(page.getByText("FLASHCARD SELESAI")).toBeVisible();
  expect(count()).toBe(2);
  await repeat.click();
  await expect(page.locator(".flashcard-surface")).toHaveAttribute("aria-pressed", "false");
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
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByText("Canonical Chapter", { exact: true })).toBeVisible();
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
  await expect(page.getByRole("progressbar", { name: "Progress Canonical Chapter", exact: true })).toHaveAttribute("value", "50");
});

test("dashboard primary percentage follows selected program real completion", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await mockLearning(page, false, { chapter_id: 9, activities: { flashcard: { total: 4, completed: 3, complete: false } }, mini_unlocked: false });
  await page.goto("/dashboard");
  await expect(page.getByText("75%", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Papan Peringkat", exact: true })).toBeVisible();
  await expect(page.getByText("0 XP", { exact: true })).toBeVisible();
  await expect(page.getByText("Belum ada data untuk ditampilkan.", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("dashboard navigation fetches one aggregate without chapter fanout", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", request => { const path = new URL(request.url()).pathname; if (path.startsWith("/api/")) requests.push(path); });
  await mockLearning(page);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /Halo, Real Student/ })).toBeVisible();
  expect(requests.filter(path => path === "/api/student/dashboard")).toHaveLength(1);
  expect(requests.filter(path => path === "/api/public/programs" || path === "/api/student/access" || path.startsWith("/api/student/programs/"))).toEqual([]);
  const origin = await page.evaluate(() => performance.timeOrigin);
  await page.locator('a[href="/learn/n5/chapter-1"]').first().click();
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Canonical Chapter");
  requests.length = 0;
  await page.getByRole("link", { name: "Dashboard", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: /Halo, Real Student/ })).toBeVisible();
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
  expect(requests.filter(path => path === "/api/student/dashboard")).toHaveLength(1);
  expect(requests.filter(path => path.startsWith("/api/student/programs/"))).toEqual([]);
});

for (const status of [401, 403, 419]) test(`dashboard aggregate rejects unauthorized access ${status}`, async ({ page }) => {
  await mockLearning(page);
  await page.route("**/api/student/dashboard", route => route.fulfill({ status, json: {} }));
  await page.goto("/dashboard?membership=sensei");
  if (status === 403) await expect(page.getByRole("alert").filter({ hasText: "Permintaan belum berhasil." })).toContainText("Permintaan belum berhasil.");
  else await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: /Halo, Real Student/ })).toHaveCount(0);
});

test("dashboard account change discards pending previous account response", async ({ page }) => {
  await mockLearning(page);
  let account = 71;
  let reads = 0;
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const pending = new Promise<void>(resolve => { started = resolve; });
  const user = () => ({ id: account, name: `Account ${account}`, email: `account-${account}@example.test`, whatsapp: "081234567890", role: "student", account_status: "active" });
  await page.route("**/api/me", route => route.fulfill({ json: { data: user() } }));
  await page.route("**/api/auth/login", route => { account = 72; return route.fulfill({ json: { data: user() } }); });
  await page.route("**/api/student/dashboard", async route => {
    reads += 1;
    const owner = account;
    if (owner === 71) { started(); await gate; }
    await route.fulfill({ json: { data: dashboardFixture([{ id: 5, code: "n5", name: "JLPT N5", family: "jlpt" }], { learning: { n5: "preview" }, replay_levels: [], source_grants: [] }, () => [{ id: 9, chapter_number: 1, title: `Private chapter ${owner}`, access: "preview", sort_order: 0 }], chapter_id => ({ chapter_id, activities: { module: { total: 4, completed: owner === 71 ? 3 : 1, complete: false } }, mini_unlocked: false })) } });
  });
  await page.goto("/dashboard");
  await pending;
  await page.evaluate(() => window.dispatchEvent(new Event("hiru:auth-expired")));
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email / WhatsApp").fill("account-72@example.test");
  await page.getByLabel("Kata Sandi", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Halo, Account 72/ })).toBeVisible();
  await expect(page.getByText("25%", { exact: true })).toBeVisible();
  release();
  await expect(page.getByText("Private chapter 71", { exact: true })).toHaveCount(0);
  await expect(page.getByText("75%", { exact: true })).toHaveCount(0);
  expect(reads).toBe(2);
});

test("zero denominator stays zero and unavailable activities have no links", async ({ page }) => {
  await mockLearning(page);
  await page.route("**/api/student/programs/5/chapters/9/progress", route => route.fulfill({ json: { data: { chapter_id: 9, activities: {}, mini_unlocked: false } } }));
  await page.goto("/journey/n5");
  await expect(page.getByRole("progressbar", { name: "Progress Canonical Chapter", exact: true })).toHaveAttribute("value", "0");
  await page.goto("/learn/n5/chapter-1");
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

test("chapter cards split module completion and start audio and reading directly", async ({ page }) => {
  await mockLearning(page);
  await page.route("**/api/student/programs/5/chapters/9", route => route.fulfill({ json: { data: {
    id: 9, chapter_number: 1, title: "Canonical Chapter", sort_order: 0, access: "preview",
    modules: [
      { id: 21, title: "Grammar", module_type: "grammar", file_url: null, sort_order: 0 },
      { id: 22, title: "Kanji", module_type: "kanji", file_url: null, sort_order: 1 },
    ],
  } } }));
  await page.route("**/api/student/programs/5/chapters/9/progress", route => route.fulfill({ json: { data: {
    chapter_id: 9, mini_unlocked: false, activities: {
      module: { total: 2, completed: 1, complete: false, completed_ids: [21] },
      audio: { total: 1, completed: 0, complete: false, completed_ids: [] },
      reading: { total: 1, completed: 1, complete: true, completed_ids: [31] },
    },
  } } }));
  await page.goto("/learn/n5/chapter-1");
  const grammar = page.locator("article").filter({ has: page.getByRole("heading", { name: "Modul Tata Bahasa", exact: true }) });
  const kanji = page.locator("article").filter({ has: page.getByRole("heading", { name: "Modul Huruf Jepang & Kanji", exact: true }) });
  await expect(grammar.getByRole("status")).toHaveText("Selesai");
  await expect(grammar).toHaveClass(/activity-completed/);
  await expect(kanji.getByRole("status")).toHaveText("Belum Selesai");
  await expect(kanji).toHaveClass(/activity-available/);
  for (const [title, path, status] of [["Audio Question", "audio", "Belum Selesai"], ["Reading Question", "reading", "Selesai"]]) {
    const activity = page.locator("article").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
    await expect(activity.getByRole("status")).toHaveText(status);
    await expect(activity.getByRole("link", { name: "Mulai", exact: true })).toHaveAttribute("href", `/learn/n5/chapter-1/${path}?start=1`);
  }
  await page.goto("/learn/n5/chapter-1/grammar");
  await expect(page.getByRole("button", { name: "Selesai", exact: true })).toBeDisabled();
  await page.goto("/learn/n5/chapter-1/kanji");
  await expect(page.getByRole("button", { name: "Tandai Selesai", exact: true })).toBeEnabled();
});

test("video completion retries failures, blocks duplicate clicks and survives reload", async ({ page }) => {
  await mockLearning(page);
  let completedIds: number[] = [];
  let writes = 0;
  const progress = () => ({ chapter_id: 9, activities: { video: { total: 2, completed: completedIds.length, complete: completedIds.length === 2, completed_ids: completedIds } }, mini_unlocked: false });
  await page.route("**/api/student/programs/5/chapters/9", route => route.fulfill({ json: { data: {
    id: 9, chapter_number: 1, title: "Canonical Chapter", sort_order: 0, access: "preview",
    video_lessons: [{ id: 11, title: "First video", video_url: null, sort_order: 0 }, { id: 12, title: "Second video", video_url: null, sort_order: 1 }],
  } } }));
  await page.route("**/api/student/programs/5/chapters/9/progress", route => route.fulfill({ json: { data: progress() } }));
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const pending = new Promise<void>(resolve => { started = resolve; });
  await page.route("**/api/student/programs/5/chapters/9/completions", async route => {
    writes += 1;
    expect(route.request().postDataJSON()).toEqual({ type: "video", resource_id: 11 });
    if (writes === 1) { await route.fulfill({ status: 500, json: {} }); return; }
    started();
    await gate;
    completedIds = [11];
    await route.fulfill({ json: { data: progress() } });
  });
  await page.goto("/learn/n5/chapter-1/video");
  const first = page.locator(".video-card").filter({ has: page.getByRole("heading", { name: "First video", exact: true }) });
  const second = page.locator(".video-card").filter({ has: page.getByRole("heading", { name: "Second video", exact: true }) });
  await first.getByRole("button", { name: "Tandai Selesai", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(first.getByRole("button", { name: "Tandai Selesai", exact: true })).toBeEnabled();
  await first.getByRole("button", { name: "Tandai Selesai", exact: true }).click();
  await pending;
  await expect(first.getByRole("button")).toBeDisabled();
  await expect(second.getByRole("button")).toBeDisabled();
  release();
  await expect(first.getByRole("button", { name: "Selesai", exact: true })).toBeDisabled();
  await expect(first.getByRole("status").filter({ hasText: /^Selesai$/ })).toHaveText("Selesai");
  await expect(second.getByRole("button", { name: "Tandai Selesai", exact: true })).toBeEnabled();
  await expect(page.locator(".video-chapter-rail a").filter({ hasText: "Video Lesson" })).toHaveAttribute("href", "/learn/n5/chapter-1/video");
  await page.reload();
  await expect(first.getByRole("button", { name: "Selesai", exact: true })).toBeDisabled();
  await expect(second.getByRole("button", { name: "Tandai Selesai", exact: true })).toBeEnabled();
  expect(writes).toBe(2);
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
