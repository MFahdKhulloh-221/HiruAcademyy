import { expect, test, type Page, type Request } from "@playwright/test";
import { performance as clock } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { dashboardFixture } from "./canonical-fixture";

const latency = Number(process.env.HIRU_PERF_LATENCY ?? 250);
if (![250, 400].includes(latency)) throw new Error("HIRU_PERF_LATENCY must be 250 or 400");
const programs = ["n5", "n4", "n3", "n2", "n1"].map((code, index) => ({ id: index + 1, code, name: `JLPT ${code.toUpperCase()}`, family: "jlpt" }));
const chapters = (programId: number) => [1, 2, 3].map(number => ({ id: programId * 100 + number, chapter_number: number, title: `Fixture ${programs[programId - 1].name} Chapter ${number}`, sort_order: number, access: "full", mini_checkpoint: { exists: true } }));
type Entry = { path: string; method: string; startMs: number; responseMs?: number; endMs?: number; status?: number; error?: string };

async function harness(page: Page, id: number, admin = false) {
  const entries = new Map<Request, Entry>();
  const errors: string[] = [];
  let epoch = clock.now();
  const since = () => Number((clock.now() - epoch).toFixed(2));
  const api = (request: Request) => /\/(api\/|sanctum\/csrf-cookie)/.test(new URL(request.url()).pathname);
  page.on("request", request => {
    if (api(request)) entries.set(request, { path: new URL(request.url()).pathname, method: request.method(), startMs: since() });
  });
  page.on("response", response => {
    const entry = entries.get(response.request());
    if (entry) { entry.responseMs = since(); entry.status = response.status(); }
  });
  page.on("requestfinished", request => { const entry = entries.get(request); if (entry) entry.endMs = since(); });
  page.on("requestfailed", request => {
    const entry = entries.get(request);
    if (entry) { entry.endMs = since(); entry.error = request.failure()?.errorText; }
  });
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (!api(request)) {
      if (url.origin === "http://127.0.0.1:3027") return route.continue();
      if (url.hostname === "fonts.googleapis.com") return route.fulfill({ contentType: "text/css", body: "" });
      errors.push(`Blocked external request: ${url.origin}${path}`);
      return route.abort();
    }
    await delay(latency);
    let data: unknown;
    if (request.method() !== "GET") {
      errors.push(`Unexpected mutation: ${request.method()} ${path}`);
      return route.fulfill({ status: 405, json: {} });
    }
    if (path === "/api/me") data = { id, name: `Fixture User ${id}`, email: `fixture-${id}@example.test`, whatsapp: "081234567890", role: admin ? "admin" : "student", account_status: "active", target_jlpt: "N5" };
    else if (path === "/api/public/programs") data = programs;
    else if (path === "/api/student/access" || path === "/api/student/dashboard") {
      const access = { learning: Object.fromEntries(programs.map(p => [p.code, "full" as const])), source_grants: programs.map(p => ({ plan_code: "sensei", program_code: p.code })), replay_levels: [] };
      data = path.endsWith("dashboard") ? dashboardFixture(programs, access, chapters, chapter_id => ({ chapter_id, activities: { flashcard: { total: 2, completed: id === 71 ? 1 : 0, complete: false } }, mini_unlocked: false })) : access;
    }
    else if (/^\/api\/student\/programs\/\d+\/chapters$/.test(path)) data = chapters(Number(path.split("/")[4]));
    else if (/^\/api\/student\/programs\/\d+\/chapters\/\d+(\/progress)?$/.test(path)) {
      const programId = Number(path.split("/")[4]);
      const chapterId = Number(path.split("/")[6]);
      data = path.endsWith("/progress") ? { chapter_id: chapterId, activities: { flashcard: { total: 2, completed: id === 71 ? 1 : 0, complete: false } }, mini_unlocked: false }
        : { ...chapters(programId).find(c => c.id === chapterId), flashcards: [{ id: chapterId * 10, japanese: "猫", reading: "ねこ", meaning: "Cat", example: "猫です。", sort_order: 0 }, { id: chapterId * 10 + 1, japanese: "犬", reading: "いぬ", meaning: "Dog", example: "犬です。", sort_order: 1 }], video_lessons: [], modules: [] };
    } else if (path === "/api/student/leaderboard") data = { scope: "all", week_start: "2026-10-05", week_end: "2026-10-11", entries: [{ user_id: id, rank: 1, name: `Fixture User ${id}`, avatar_url: null, category: "sensei", weekly_xp: 123, streak_days: 2, is_current_user: true }], self: null };
    else if (path === "/api/student/gamification") data = { streak_days: 2, weekly_xp: 123, challenge: { active_days: 2, target_days: 5, total_days: 7, starts_on: "2026-10-05", ends_on: "2026-10-11", status: "active", badge: null } };
    else if (path === "/api/admin/notifications") data = [{ id: 1, title: "Fixture announcement", body: "Fixture body", type: "Pengumuman", status: "draft", audience: "All", preset: "None", path: null, cta_label: null, level: null }];
    else if (path === "/api/admin/certificate-templates") data = [{ id: 1, program: "JLPT N5", title: "Fixture certificate", description: "Fixture template", sort_order: 1, status: "draft", image: null }];
    else {
      errors.push(`Missing fixture: ${path}`);
      return route.fulfill({ status: 501, json: {} });
    }
    await route.fulfill({ json: { data } });
  });
  return {
    reset() { entries.clear(); errors.length = 0; epoch = clock.now(); },
    async measure(label: string, action: () => Promise<unknown>, ready: () => Promise<void>, maxRequests: number) {
      this.reset();
      await action();
      await ready();
      const readyMs = since();
      await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)').filter({ hasText: /\S/ })).toHaveCount(0);
      await expect.poll(() => [...entries.values()].filter(e => e.endMs === undefined).length).toBe(0);
      const waterfall = [...entries.values()];
      const counts = Object.fromEntries([...new Set(waterfall.map(e => e.path))].map(path => [path, waterfall.filter(e => e.path === path).length]));
      const slowest = waterfall.reduce<Entry | null>((best, entry) => !best || (entry.endMs! - entry.startMs) > (best.endMs! - best.startMs) ? entry : best, null);
      const result = { label, userId: id, latencyMs: latency, readyMs, apiCount: waterfall.length, counts, slowest, waterfall, errors: [...errors, ...waterfall.filter(e => e.error || (e.status ?? 0) >= 400).map(e => `${e.path}: ${e.error ?? e.status}`)] };
      console.log(`PERF ${JSON.stringify(result)}`);
      await test.info().attach(label, { body: JSON.stringify(result, null, 2), contentType: "application/json" });
      expect(result.errors).toEqual([]);
      expect(waterfall.length).toBeLessThanOrEqual(maxRequests);
    },
  };
}

async function ready(page: Page, path: string) {
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\?|$)`));
  if (path === "/practice") {
    await expect(page.getByRole("heading", { name: "JLPT N1 | Fixture JLPT N1 Chapter 3 | Kosakata", exact: true })).toBeVisible();
    await expect(page.locator(".practice-journey-card")).toHaveCount(75);
  } else if (path === "/mini-checkpoint") {
    await expect(page.getByRole("heading", { name: "JLPT N2 • Mini Checkpoint Chapter 3", exact: true })).toBeVisible();
    await expect(page.locator(".mini-checkpoint-card")).toHaveCount(12);
  } else if (path.endsWith("/flashcards")) {
    await expect(page.locator(".flash-front ruby")).toContainText(/猫|犬/);
    await expect(page.getByRole("button", { name: "Ulangi Kartu Sulit" })).toBeVisible();
  } else if (path.startsWith("/learn/")) {
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Fixture JLPT N5 Chapter 1");
    await expect(page.locator('a[href="/learn/n5/chapter-1/flashcards"]')).toBeVisible();
  } else if (path === "/dashboard") {
    await expect(page.getByRole("heading", { name: /^Halo, Fixture User/ })).toBeVisible();
    await expect(page.getByText("123 XP", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Papan Peringkat", exact: true })).toBeVisible();
  } else {
    await expect(page.getByRole("cell", { name: path.endsWith("notifikasi") ? "Fixture announcement" : "Fixture certificate", exact: true })).toBeVisible();
  }
  await expect(page.getByRole("status").filter({ hasText: /Memuat/ })).toHaveCount(0);
}

async function clickLink(page: Page, path: string) {
  const link = page.locator(`a[href="${path}"], a[href^="${path}?"]`).filter({ visible: true }).first();
  if (!(await link.count()) && ["/practice", "/mini-checkpoint"].includes(path)) await page.getByRole("button", { name: "Kelas Saya", exact: true }).first().click();
  await expect(link).toBeVisible();
  await link.click();
}

for (const id of [71, 72]) {
  for (const path of ["/practice", "/mini-checkpoint", "/learn/n5/chapter-1", "/learn/n5/chapter-1/flashcards", "/dashboard"]) {
    test(`cold ${path} user ${id}`, async ({ page }) => {
      const perf = await harness(page, id);
      await perf.measure(`cold ${path}`, () => page.goto(path), () => ready(page, path), path === "/practice" ? 8 : path === "/mini-checkpoint" ? 19 : path === "/dashboard" ? 5 : 6);
    });
  }
  test(`Link navigation and repeat visits user ${id}`, async ({ page }) => {
    const perf = await harness(page, id);
    await perf.measure("cold navigation source /dashboard", () => page.goto("/dashboard"), () => ready(page, "/dashboard"), 5);
    for (const [index, path] of ["/practice", "/mini-checkpoint", "/dashboard", "/learn/n5/chapter-1", "/learn/n5/chapter-1/flashcards", "/learn/n5/chapter-1", "/practice", "/mini-checkpoint", "/dashboard"].entries()) {
      const documentCount = await page.evaluate(() => performance.getEntriesByType("navigation").length);
      const documentStart = await page.evaluate(() => performance.timeOrigin);
      await perf.measure(`Link ${index + 1} ${path}`, () => clickLink(page, path), () => ready(page, path), path === "/practice" ? 7 : path === "/mini-checkpoint" ? 18 : path === "/dashboard" ? 4 : 5);
      expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentStart);
      expect(await page.evaluate(() => performance.getEntriesByType("navigation").length)).toBe(documentCount);
    }
  });
}

test("admin cold and Link repeat visits", async ({ page }) => {
  const perf = await harness(page, 91, true);
  await perf.measure("cold /admin/notifikasi", () => page.goto("/admin/notifikasi"), () => ready(page, "/admin/notifikasi"), 2);
  for (const path of ["/admin/sertifikat", "/admin/notifikasi", "/admin/sertifikat"]) {
    const origin = await page.evaluate(() => performance.timeOrigin);
    await perf.measure(`Link ${path}`, () => clickLink(page, path), () => ready(page, path), 1);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
  }
});
