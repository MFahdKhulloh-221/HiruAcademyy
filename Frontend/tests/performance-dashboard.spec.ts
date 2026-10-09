import { expect, test, type Page, type Request } from "@playwright/test";
import { performance as clock } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { dashboardFixture } from "./canonical-fixture";

const baseline = process.env.HIRU_PERF_BUILD_PORT === "3027";
const latency = 100;
const chapterCount = 20;
const programs = ["n5", "n4", "n3", "n2", "n1"].map((code, index) => ({ id: index + 1, code, name: `JLPT ${code.toUpperCase()}`, family: "jlpt" }));
const users = Array.from({ length: 30 }, (_, index) => ({ id: index + 1, name: `Fixture Student ${index + 1}`, email: `student-${index + 1}@example.test`, whatsapp: "081234567890", account_status: "active" }));
type Entry = { path: string; startMs: number; endMs?: number; status?: number; error?: string };

async function harness(page: Page, membership: "free" | "lms" | "sensei" | "admin") {
  let epoch = clock.now();
  const entries = new Map<Request, Entry>();
  const errors: string[] = [];
  const since = () => Number((clock.now() - epoch).toFixed(2));
  const api = (request: Request) => /^\/(api\/|sanctum\/)/.test(new URL(request.url()).pathname);
  const access = { learning: Object.fromEntries(programs.map(p => [p.code, membership === "free" ? "preview" as const : "full" as const])), source_grants: membership === "free" ? [] : programs.map(p => ({ plan_code: membership === "admin" ? "sensei" : membership, program_code: p.code, ends_at: "2027-01-01T00:00:00Z" })), replay_levels: [] };
  const chapters = (id: number) => Array.from({ length: chapterCount }, (_, index) => ({ id: id * 100 + index + 1, chapter_number: index + 1, title: `Fixture ${programs[id - 1].name} Chapter ${index + 1}`, sort_order: index, access: membership === "free" && index > 0 ? "locked" : "full", mini_checkpoint: { exists: true } }));
  page.on("request", request => { if (api(request)) entries.set(request, { path: new URL(request.url()).pathname, startMs: since() }); });
  page.on("response", response => { const entry = entries.get(response.request()); if (entry) entry.status = response.status(); });
  page.on("requestfinished", request => { const entry = entries.get(request); if (entry) entry.endMs = since(); });
  page.on("requestfailed", request => { const entry = entries.get(request); if (entry) { entry.endMs = since(); entry.error = request.failure()?.errorText; } });
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
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) { errors.push(`Nonlocal API: ${url.origin}`); return route.abort(); }
    await delay(latency);
    if (request.method() !== "GET") { errors.push(`Unexpected mutation: ${request.method()} ${path}`); return route.fulfill({ status: 405, json: {} }); }
    let data: unknown;
    if (path === "/api/me") data = { id: 71, name: "Fixture User 71", email: "fixture@example.test", whatsapp: "081234567890", role: membership === "admin" ? "admin" : "student", account_status: "active", target_jlpt: "N5" };
    else if (path === "/api/public/programs") data = programs;
    else if (path === "/api/student/access" || /^\/api\/admin\/users\/\d+\/effective-access$/.test(path)) data = access;
     else if (path === "/api/student/dashboard") data = dashboardFixture(programs, access, chapters, chapter_id => ({ chapter_id, activities: { flashcard: { total: 2, completed: 0, complete: false }, module: { total: 1, completed: 0, complete: false } }, mini_unlocked: false }));
     else if (path === "/api/admin/users") {
       expect(url.searchParams.get("include")).toBe(!baseline && new URL(page.url()).pathname === "/admin" ? "effective_access" : null);
       data = url.searchParams.get("include") === "effective_access" ? users.map(user => ({ ...user, effective_access: access })) : users;
     }
    else if (path === "/api/admin/offers") data = programs.flatMap(program => ["lms", "sensei"].map(plan_code => ({ id: program.id * 10 + (plan_code === "sensei" ? 1 : 0), program_id: program.id, program, plan_code, effective_price: 123456, base_price: 123456, currency: "IDR", duration_months: 1 })));
    else if (path === "/api/admin/users/1/access") data = [];
    else if (/^\/api\/student\/programs\/\d+\/chapters$/.test(path)) data = chapters(Number(path.split("/")[4]));
    else if (/^\/api\/student\/programs\/\d+\/chapters\/\d+(\/progress)?$/.test(path)) {
      const programId = Number(path.split("/")[4]);
      const chapterId = Number(path.split("/")[6]);
      data = path.endsWith("/progress") ? { chapter_id: chapterId, activities: { flashcard: { total: 2, completed: 0, complete: false }, module: { total: 1, completed: 0, complete: false } }, mini_unlocked: false }
        : { ...chapters(programId).find(chapter => chapter.id === chapterId), flashcards: [{ id: 1010, japanese: "猫", reading: "ねこ", meaning: "Cat", example: "猫です。", sort_order: 0 }], video_lessons: [], modules: [] };
    } else if (path === "/api/student/leaderboard") data = { scope: "all", week_start: "2026-10-05", week_end: "2026-10-11", entries: [{ user_id: 71, rank: 1, name: "Fixture User 71", avatar_url: null, category: membership, weekly_xp: 123, streak_days: 2, is_current_user: true }], self: null };
    else if (path === "/api/student/gamification") data = { streak_days: 2, weekly_xp: 123, challenge: { active_days: 2, target_days: 5, total_days: 7, starts_on: "2026-10-05", ends_on: "2026-10-11", status: "active", badge: null } };
    else { errors.push(`Missing fixture: ${path}`); return route.fulfill({ status: 501, json: {} }); }
    await route.fulfill({ json: { data } });
  });
  return async (label: string, action: () => Promise<unknown>, ready: () => Promise<void>, budget: number) => {
    entries.clear(); errors.length = 0; epoch = clock.now();
    await action(); await ready();
    const readyMs = since();
    await expect.poll(() => [...entries.values()].filter(entry => entry.endMs === undefined).length).toBe(0);
    const waterfall = [...entries.values()];
    const slowest = waterfall.reduce<Entry | null>((best, entry) => !best || entry.endMs! - entry.startMs > best.endMs! - best.startMs ? entry : best, null);
    const result = { label, membership, latencyMs: latency, programs: programs.length, chaptersPerProgram: chapterCount, users: users.length, readyMs, apiCount: waterfall.length, slowest, waterfall, errors };
    console.log(`DASHBOARD_PERF ${JSON.stringify(result)}`);
    await test.info().attach(label, { body: JSON.stringify(result, null, 2), contentType: "application/json" });
    expect(errors).toEqual([]);
    expect(waterfall.filter(entry => entry.error || entry.status !== 200)).toEqual([]);
    expect(waterfall.length).toBeLessThanOrEqual(budget);
    if (!baseline && label.endsWith("/dashboard")) {
      expect(waterfall.filter(entry => entry.path === "/api/student/dashboard")).toHaveLength(1);
      expect(waterfall.filter(entry => entry.path === "/api/public/programs" || entry.path === "/api/student/access" || entry.path.startsWith("/api/student/programs/"))).toEqual([]);
    }
    if (!baseline && label.endsWith("/admin")) expect(waterfall.filter(entry => entry.path.endsWith("/effective-access"))).toEqual([]);
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toHaveCount(0);
  };
}

async function ready(page: Page, path: string) {
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\?|$)`));
  if (path === "/dashboard") {
    await expect(page.getByRole("heading", { name: /^Halo, Fixture User 71/ })).toBeVisible();
    await expect(page.getByText("123 XP", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Papan Peringkat", exact: true })).toBeVisible();
  } else if (path.startsWith("/admin")) {
    await expect(page.getByRole("cell", { name: "Fixture Student 30", exact: true })).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(30);
  } else {
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Fixture JLPT N5 Chapter 1");
    await expect(page.locator('a[href="/learn/n5/chapter-1/flashcards"]')).toBeVisible();
  }
  await expect(page.getByRole("status").filter({ hasText: /Memuat/ })).toHaveCount(0);
}

async function link(page: Page, path: string) {
  await page.locator(`a[href="${path}"], a[href^="${path}?"]`).filter({ visible: true }).first().click();
}

for (const membership of ["free", "lms", "sensei"] as const) {
  test(`${membership} dashboard cold and repeat navigation`, async ({ page }) => {
    const measure = await harness(page, membership);
    await measure("cold /dashboard", () => page.goto("/dashboard"), () => ready(page, "/dashboard"), baseline ? membership === "free" ? 15 : 110 : 4);
    const origin = await page.evaluate(() => performance.timeOrigin);
    for (const path of ["/learn/n5/chapter-1", "/dashboard", "/learn/n5/chapter-1", "/dashboard"]) {
      await measure(`Link ${path}`, () => link(page, path), () => ready(page, path), path === "/dashboard" ? baseline ? membership === "free" ? 14 : 109 : 3 : 5);
      expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
    }
  });
}
for (const source of ["/admin", "/admin/pengguna-akses"]) {
  test(`admin cold ${source} and repeat navigation`, async ({ page }) => {
    const measure = await harness(page, "admin");
    await measure(`cold ${source}`, () => page.goto(source), () => ready(page, source), source === "/admin" ? baseline ? 32 : 2 : 3);
    const origin = await page.evaluate(() => performance.timeOrigin);
    for (const path of source === "/admin" ? ["/admin/pengguna-akses", "/admin", "/admin/pengguna-akses"] : ["/admin", "/admin/pengguna-akses", "/admin"]) {
      await measure(`Link ${path}`, () => link(page, path), () => ready(page, path), path === "/admin" ? baseline ? 31 : 1 : 2);
      expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
    }
    if ((await page.url()).includes("pengguna-akses")) await measure("user detail", () => page.getByRole("row").filter({ hasText: "student-1@example.test" }).getByRole("button", { name: "Detail", exact: true }).click(), async () => { await expect(page.getByRole("heading", { name: "Akses efektif", exact: true })).toBeVisible(); }, 2);
  });
}
