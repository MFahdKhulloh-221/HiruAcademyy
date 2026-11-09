import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`R03 Placement navbar stays visible while scrolling ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/me", route => route.fulfill({ status: 401, json: {} }));
    await page.route("**/api/placement/attempts/12**", route => route.fulfill({ json: { data: {
      id: 12, status: "in_progress", answers: {}, result: null,
      expires_at: new Date(Date.now() + 240000).toISOString(),
      questions: [{ id: 41, category: "Dokkai", prompt: "Scroll question", reading_passage: "Bacaan panjang untuk pemeriksaan scroll.\n".repeat(80), options: { A: "First", B: "Second", C: "Third", D: "Fourth" } }],
    } } }));
    await page.goto("/placement/question?attempt=12");
    const header = page.locator(".placement-topbar-custom");
    const timer = page.getByRole("timer");
    const heading = page.getByRole("heading", { name: "Scroll question" });
    await expect(heading).toBeVisible();
    const initial = await header.boundingBox();
    const question = await heading.boundingBox();
    expect(initial).not.toBeNull();
    expect(question!.y).toBeGreaterThanOrEqual(initial!.y + initial!.height);
    await page.evaluate(() => window.scrollTo(0, 600));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    const scrolled = await header.boundingBox();
    expect(Math.abs(scrolled!.y)).toBeLessThanOrEqual(1);
    expect(scrolled!.height).toBe(initial!.height);
    await expect(timer).toBeInViewport({ ratio: 1 });
    await expect(header.getByText("PLACEMENT TEST", { exact: true })).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`placement-sticky-${width}.png`) });
  });
}
