import { expect, test, type BrowserContext } from "@playwright/test";

for (const width of [1440, 768, 390]) test(`placement same account across devices ${width}`, async ({ browser, baseURL }) => {
  test.setTimeout(120000);
  const a = await browser.newContext({ baseURL, viewport: { width, height: 1000 } });
  const b = await browser.newContext({ baseURL, viewport: { width, height: 1000 } });
  const other = await browser.newContext({ baseURL });
  let started = false;
  let starts = 0;
  let completed = false;
  let revision = 0;
  let failSave = false;
  let submissions = 0;
  let answers: Record<string, string> = {};
  const deadline = new Date(Date.now() + 240000).toISOString();
  const payload = () => ({ id: 12, status: completed ? "completed" : "in_progress", scoring_version: "percentage-v1", revision, questions: [{ id: 41, category: "Bunpou", prompt: "Device question", options: { A: "First", B: "Second", C: "Third", D: "Fourth" } }], answers, result: completed ? { correct: 1, wrong: 0, unanswered: 0, percentage: 100, recommendation_level: "N1", areas: [] } : null, expires_at: deadline, server_now: new Date().toISOString() });
  async function mock(context: BrowserContext, owner: number) {
    await context.addCookies([{ name: "XSRF-TOKEN", value: "fixture", url: baseURL! }]);
    await context.route(/\/(api\/|sanctum\/csrf-cookie)/, async r => {
      const path = new URL(r.request().url()).pathname;
      const headers = { "access-control-allow-origin": baseURL!, "access-control-allow-credentials": "true", "access-control-allow-methods": "GET, POST, PUT, OPTIONS", "access-control-allow-headers": "accept, content-type, x-xsrf-token" };
      if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers });
      const reply = (data: unknown, status = 200) => r.fulfill({ status, headers, json: { data } });
      if (path === "/api/me") return reply({ id: owner, role: "student", account_status: "active", name: "Student", email: "student@example.test", whatsapp: "628123456789" });
      if (path === "/sanctum/csrf-cookie") return r.fulfill({ status: 204 });
      if (path === "/api/placement/attempts/current") return reply(started && owner === 1 && !completed ? payload() : null);
      if (path === "/api/placement/attempts" && r.request().method() === "POST") { starts++; started = true; return reply(payload(), 201); }
      if (path.startsWith("/api/placement/attempts/12")) {
        if (owner !== 1) return reply(null, 404);
        if (path.endsWith("/submit")) submissions++;
        if (["PUT", "POST"].includes(r.request().method()) && !completed) {
          if (failSave) { failSave = false; return reply(null, 503); }
          const body = r.request().postDataJSON();
          if (body.revision !== revision) return reply(null, 409);
          answers = body.answers;
          revision++;
          if (path.endsWith("/submit")) completed = true;
        }
        return reply(payload());
      }
      return reply([]);
    });
  }
  try {
    await Promise.all([mock(a, 1), mock(b, 1), mock(other, 2)]);
    const pa = await a.newPage();
    const pb = await b.newPage();
    // Start through existing API; discovery on both devices must not create another attempt.
    await pa.goto("/placement/question");
    await pa.evaluate(async () => { await fetch("/api/placement/attempts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Student", whatsapp: "628123456789", target: "N5", privacy: true }) }); });
    await pa.reload();
    await expect(pa.getByRole("heading", { name: "Device question" })).toBeVisible();
    const saveA = pa.waitForResponse(r => r.request().method() === "PUT");
    await pa.getByRole("radio").first().check();
    await saveA;
    const resumed = pb.waitForResponse(r => new URL(r.url()).pathname === "/api/placement/attempts/12");
    await pb.goto("/placement/question");
    expect((await (await resumed).json()).data).toMatchObject({ id: 12, revision: 1, answers: { "41": "A" }, expires_at: deadline });
    await expect(pb.getByRole("radio").first()).toBeChecked();
    await expect(pb.getByRole("timer")).toContainText(/\d{2}:\d{2}/);
    await expect(pb).toHaveURL(/attempt=12/);
    expect(starts).toBe(1);
    const saveB = pb.waitForResponse(r => r.request().method() === "PUT");
    await pb.getByRole("radio").nth(1).check();
    await saveB;
    const conflict = pa.waitForResponse(r => r.request().method() === "PUT" && r.status() === 409);
    await pa.getByRole("radio").nth(2).check();
    await conflict;
    await expect(pa.locator(".placement-assessment [role=alert]")).toBeVisible();
    expect(answers).toEqual({ "41": "B" });
    await pa.reload();
    await expect(pa.getByRole("radio").nth(1)).toBeChecked();
    failSave = true;
    await pa.getByRole("radio").nth(2).check();
    await expect(pa.locator(".placement-assessment [role=alert]")).toBeVisible();
    await pa.getByRole("button", { name: "Coba simpan lagi" }).click();
    await expect(pa.locator(".placement-assessment [role=alert]")).toHaveCount(0);
    const foreign = await other.newPage();
    await foreign.goto("/placement/question?attempt=12");
    await expect(foreign.locator(".placement-assessment [role=alert]")).toBeVisible();
    await expect(foreign.getByRole("heading", { name: "Device question" })).toHaveCount(0);
    const submitted = pa.waitForResponse(r => r.url().endsWith("/submit"));
    await pa.getByRole("button", { name: "Selesaikan Test" }).click();
    const result = (await (await submitted).json()).data;
    expect(result).toMatchObject({ id: 12, status: "completed", revision: 4, answers: { "41": "C" } });
    await expect(pa).toHaveURL(/placement\/result\?attempt=12/, { timeout: 20000 });
    await expect(pa.getByRole("heading", { name: /Rekomendasi Level/ })).toBeVisible();
    await pb.reload();
    await expect(pb.getByRole("heading", { name: /Rekomendasi Level/ })).toBeVisible();
    const canonical = await pb.evaluate(async () => (await (await fetch("http://localhost:8000/api/placement/attempts/12")).json()).data);
    expect(canonical.result).toEqual(result.result);
    expect(canonical).toMatchObject({ id: result.id, status: result.status, revision: result.revision, answers: result.answers, expires_at: deadline });
    expect(Date.parse(canonical.server_now)).toBeGreaterThanOrEqual(Date.parse(result.server_now));
    expect(submissions).toBe(1);
    expect(starts).toBe(1);
    expect(await pa.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await Promise.allSettled([a.close(), b.close(), other.close()]); }
});


test("placement server deadline expires despite wrong device clock and survives refresh", async ({ page, baseURL }) => {
  await page.context().addCookies([{ name: "XSRF-TOKEN", value: "fixture", url: baseURL! }]);
  await page.clock.install({ time: new Date("2035-01-01T00:00:00Z") });
  const serverNow = "2026-10-28T00:00:00Z";
  const expires = "2026-10-28T00:00:02Z";
  const result = { correct: 0, wrong: 0, unanswered: 1, percentage: 0, recommendation_level: "N5", areas: [] };
  let submissions = 0;
  let completed = false;
  await page.route("**/api/me", r => r.fulfill({ status: 401, json: {} }));
  await page.route("**/api/public/offers", r => r.fulfill({ json: { data: [] } }));
  await page.route("**/api/placement/attempts/12**", async r => {
    if (r.request().url().endsWith("/submit")) {
      submissions++;
      expect(r.request().postDataJSON()).toEqual({ answers: { "41": "A" }, revision: 1 });
      completed = true;
    }
    await r.fulfill({ json: { data: { id: 12, status: completed ? "completed" : "in_progress", scoring_version: "percentage-v1", revision: 1, questions: [{ id: 41, category: "Bunpou", prompt: "Timed question", options: { A: "First", B: "Second", C: "Third", D: "Fourth" } }], answers: { "41": "A" }, expires_at: expires, server_now: serverNow, result: completed ? result : null } } });
  });
  await page.goto("/placement/question?attempt=12");
  await expect(page.getByRole("heading", { name: "Timed question" })).toBeVisible();
  await expect(page.getByRole("timer")).toContainText("00:02");
  const submitted = page.waitForResponse(r => r.url().endsWith("/submit"));
  await page.clock.runFor(3000);
  expect((await (await submitted).json()).data.result).toEqual(result);
  await expect(page).toHaveURL(/placement\/result\?attempt=12/, { timeout: 20000 });
  await page.reload();
  await expect(page.getByRole("heading", { name: /Rekomendasi Level.*N5/ })).toBeVisible();
  expect(submissions).toBe(1);
});
