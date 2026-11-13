import { expect, test } from "@playwright/test";

for (const width of [390, 768, 1440]) {
  test(`R03 Placement navbar stays visible and expires once while scrolling ${width}`, async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.context().addCookies([{ name: "XSRF-TOKEN", value: "fixture", url: baseURL! }]);
    await page.clock.install({ time: new Date("2035-01-01T00:00:00Z") });
    await page.clock.pauseAt(new Date("2035-01-01T00:00:01Z"));
    const serverNow = "2026-10-28T00:00:00Z";
    const expires = "2026-10-28T00:00:04Z";
    const result = { correct: 0, wrong: 0, unanswered: 1, percentage: 0, recommendation_level: "N5", areas: [] };
    let submissions = 0;
    let completed = false;
    await page.route("**/api/me", route => route.fulfill({ status: 401, json: {} }));
    await page.route("**/api/public/offers", route => route.fulfill({ json: { data: [] } }));
    await page.route("**/api/placement/attempts/12**", async route => {
      if (route.request().url().endsWith("/submit")) {
        submissions++;
        expect(route.request().postDataJSON()).toEqual({ answers: { "41": "A" }, revision: 1 });
        completed = true;
      }
      await route.fulfill({ json: { data: {
        id: 12, status: completed ? "completed" : "in_progress", scoring_version: "percentage-v1", revision: 1,
        answers: { "41": "A" }, result: completed ? result : null, expires_at: expires, server_now: serverNow,
        questions: [{ id: 41, category: "Dokkai", prompt: "Scroll question", reading_passage: "Bacaan panjang untuk pemeriksaan scroll.\n".repeat(80), options: { A: "First", B: "Second", C: "Third", D: "Fourth" } }],
      } } });
    });
    await page.goto("/placement/question?attempt=12");
    const header = page.locator(".placement-topbar-custom");
    const timer = page.getByRole("timer");
    const heading = page.getByRole("heading", { name: "Scroll question" });
    await expect(heading).toBeVisible();
    await expect(timer).toContainText("00:04");
    await page.clock.runFor(1000);
    await expect(timer).toContainText("00:03");
    const initial = await header.boundingBox();
    const question = await heading.boundingBox();
    expect(initial).not.toBeNull();
    expect(question!.y).toBeGreaterThanOrEqual(initial!.y + initial!.height);
    await page.evaluate(() => window.scrollTo({ top: 600, behavior: "instant" }));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    const scrolled = await header.boundingBox();
    expect(Math.abs(scrolled!.y)).toBeLessThanOrEqual(1);
    expect(scrolled!.height).toBe(initial!.height);
    await expect(timer).toBeInViewport({ ratio: 1 });
    await expect(timer).toContainText("00:03");
    await page.clock.runFor(1000);
    await expect(timer).toContainText("00:02");
    await expect(header.getByText("PLACEMENT TEST", { exact: true })).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`placement-sticky-${width}.png`) });
    expect(submissions).toBe(0);
    const submitted = page.waitForResponse(response => response.url().endsWith("/submit"));
    await page.clock.runFor(3000);
    expect((await (await submitted).json()).data.result).toEqual(result);
    await expect(page).toHaveURL(/placement\/result\?attempt=12/, { timeout: 20000 });
    await page.reload();
    await expect(page.getByRole("heading", { name: /Rekomendasi Level.*N5/ })).toBeVisible();
    await page.clock.runFor(3000);
    expect(submissions).toBe(1);
  });
}
