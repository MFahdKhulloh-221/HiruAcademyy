import { test, expect, dashboardFixture, type Page } from "./canonical-fixture";
import type { CanonicalChapter, ChapterProgress, LearningAccess, LearningProgram, LibraryModule } from "../src/lib/learning-api";
import type { ServerAttempt } from "../src/lib/assessment-attempt";

const active: LearningProgram = { id: 1, code: "n5", slug: "n5", name: "JLPT N5", family: "jlpt" };
// Inactive state is represented by public omission, not a made-up learning API field.
const inactive: LearningProgram = { id: 4, code: "n2", slug: "n2", name: "JLPT N2", family: "jlpt" };
const chapter: CanonicalChapter = { id: 49, chapter_number: 2, title: "Existing N2 chapter", sort_order: 0, access: "full", modules: [{ id: 51, title: "Existing N2 grammar", module_type: "grammar", file_url: null, sort_order: 0 }] };
const progress: ChapterProgress = { chapter_id: 49, activities: { module: { total: 1, completed: 0, complete: false }, reading: { total: 1, completed: 0, complete: false } }, mini_unlocked: false };
const material: LibraryModule = { id: "module-51", resource_id: 51, category: "Tata Bahasa", title: "Existing N2 grammar", description: "Material from existing grant", level: "N2", program: inactive, chapter: { id: 49, chapter_number: 2, title: chapter.title }, href: "/learn/n2/chapter-2/grammar", locked: false };
const attemptPath = "/api/student/programs/4/chapters/49/attempts";

async function mockInactiveProgram(page: Page, grant: "entitled" | "none" | "expired" = "entitled") {
  // Missing and expired grants share effective-access output; expiry calculation belongs to Laravel.
  const entitled = grant === "entitled";
  const access: LearningAccess = { learning: { n5: "preview", n2: entitled ? "full" : "none" }, replay_levels: [], source_grants: entitled ? [{ program_code: "n2", plan_code: "lms" }] : [] };
  const programs = entitled ? [active, inactive] : [active];
  const writes: string[] = [];
  let server: ServerAttempt = { id: 71, kind: "reading", chapter_id: 49, status: "in_progress", revision: 0, questions: [{ id: 81, question: "Existing grant question", options: { A: "First", B: "Second" } }], answers: {}, result: null };
  await page.route(/\/api\/(?:public\/(?:programs|offers)|student\/(?:dashboard|access|library|programs\/4\/chapters.*|invoices))$/, async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const headers = { "access-control-allow-origin": new URL(page.url()).origin, "access-control-allow-credentials": "true", "access-control-allow-methods": "GET, POST, PUT, OPTIONS", "access-control-allow-headers": "accept, content-type, x-xsrf-token" };
    const reply = (data: unknown, status = 200) => route.fulfill({ status, headers, json: { data } });
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (method !== "GET") writes.push(path);
    if (path === "/api/public/programs") return reply([active]);
    if (path === "/api/public/offers") return reply([]);
    if (path === "/api/student/access") return reply(access);
    if (path === "/api/student/dashboard") return reply(dashboardFixture(programs, access, id => id === inactive.id ? [chapter] : [], () => progress));
    if (path === "/api/student/library") return reply(entitled ? [material] : []);
    if (path === "/api/student/invoices") return reply(null, 422);
    // Mock backend denial only. These browser checks do not prove Laravel authorization.
    if (!entitled) return reply(null, 403);
    if (path === "/api/student/programs/4/chapters") return reply([chapter]);
    if (path.endsWith("/progress")) return reply(progress);
    if (path === "/api/student/programs/4/chapters/49") return reply(chapter);
    if (path === `${attemptPath}/71/answers` && method === "PUT") {
      const body = route.request().postDataJSON();
      expect(body).toEqual({ answers: { "81": "A" }, revision: server.revision });
      server = { ...server, answers: body.answers, revision: server.revision! + 1 };
      return reply(server);
    }
    if (path === `${attemptPath}/71` && method === "GET") return reply(server);
    throw new Error(`Unexpected inactive-program request: ${method} ${path}`);
  });
  return { writes, answers: () => server.answers };
}

for (const width of [1440, 768, 390]) {
  test(`inactive entitled program stays in journey and library at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockInactiveProgram(page);
    await page.goto("/journey");
    await expect(page.getByRole("heading", { name: "JLPT N2", exact: true })).toBeVisible();
    await page.goto("/journey/n2");
    await expect(page.getByRole("heading", { name: chapter.title, exact: true })).toBeVisible();
    await expect(page.locator('a[href="/learn/n2/chapter-2"]').first()).toBeVisible();
    await page.goto("/library");
    await expect(page.getByRole("heading", { name: material.title, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: `Tata Bahasa: ${material.title}`, exact: true })).toHaveAttribute("href", "/learn/n2/chapter-2/grammar?membership=lms");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("existing inactive-program grant opens chapter and resumes assessment answer saves", async ({ page }) => {
  const mock = await mockInactiveProgram(page);
  await page.goto("/learn/n2/chapter-2");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText(chapter.title);
  await page.goto("/learn/n2/chapter-2/reading?attempt=71");
  await expect(page.getByRole("heading", { name: "Existing grant question", exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "A. First", exact: true }).check();
  await expect(page.getByRole("status").filter({ hasText: /^Tersimpan$/ })).toBeVisible();
  expect(mock.answers()).toEqual({ "81": "A" });
  await page.reload();
  await expect(page.getByRole("radio", { name: "A. First", exact: true })).toBeChecked();
  expect(mock.writes).toEqual([`${attemptPath}/71/answers`]);
});

for (const grant of ["none", "expired"] as const) {
  test(`${grant} grant cannot expose inactive material or assessment with mocked denial`, async ({ page }) => {
    const mock = await mockInactiveProgram(page, grant);
    await page.goto("/journey");
    await expect(page.getByRole("heading", { name: "JLPT N5", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "JLPT N2", exact: true })).toHaveCount(0);
    await page.goto("/library");
    await expect(page.getByRole("heading", { name: "Materi yang kamu cari tidak ada", exact: true })).toBeVisible();
    await page.goto("/learn/n2/chapter-2/reading?attempt=71&membership=sensei");
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Existing grant question", exact: true })).toHaveCount(0);
    await expect(page.getByRole("radio")).toHaveCount(0);
    const deniedStatus = await page.evaluate(async path => (await fetch(`http://localhost:8000${path}`, { credentials: "include" })).status, `${attemptPath}/71`);
    expect(deniedStatus).toBe(403);
    expect(mock.writes).toEqual([]);
  });
}

test("inactive entitled program remains excluded from public catalog and checkout offer", async ({ page }) => {
  const mock = await mockInactiveProgram(page);
  await page.goto("/journey");
  await expect(page.getByRole("heading", { name: "JLPT N2", exact: true })).toBeVisible();
  await page.goto("/checkout?level=n2&plan=lms");
  await expect(page.getByRole("button", { name: "Buat Invoice", exact: true })).toBeDisabled();
  const publicPrograms = await page.evaluate(async () => (await fetch("http://localhost:8000/api/public/programs", { credentials: "include" })).json());
  expect(publicPrograms.data).toEqual([active]);
  expect(mock.writes).toEqual([]);
});
