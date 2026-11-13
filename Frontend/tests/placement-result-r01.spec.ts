import { expect, test, type Page } from "@playwright/test";

async function mockResult(page: Page) {
  const state = { offersStatus: 200, emptyOffers: false, attemptStatus: 200, result: true, recommended: true, adaptive: true, publicProgram: true };
  const writes: string[] = [];
  page.on("request", request => { if (request.url().includes("/api/") && !["GET", "OPTIONS"].includes(request.method())) writes.push(request.url()); });
  await page.route("**/api/public/programs", route => route.fulfill({ json: { data: state.publicProgram ? [{ code: "n4", slug: "n4", name: "JLPT N4", family: "jlpt" }] : [] } }));
  await page.route("**/api/public/landing", route => route.fulfill({ json: { data: {} } }));
  const assertNoWrites = () => expect(writes).toEqual([]);
  const attempt = { id: 12, status: "completed", adaptive: true, questions: [], answers: {}, result: { correct: 8, wrong: 2, unanswered: 0, total: 10, percentage: 80, recommendation_level: "N4", recommended_program: { code: "n4", title: "JLPT N4", path: "/program/n4?source=placement" }, areas: [] } };
  await page.route("**/api/me", route => route.fulfill({ status: 401, json: {} }));
  await page.route("**/api/placement/attempts/12", route => {
    expect(route.request().method()).toBe("GET");
    return route.fulfill({ status: state.attemptStatus, json: { data: state.attemptStatus === 200 ? { ...attempt, adaptive: state.adaptive, result: state.result ? { ...attempt.result, recommended_program: state.recommended ? attempt.result.recommended_program : null } : null } : null } });
  });
  await page.route("**/api/public/offers", route => route.fulfill({ status: state.offersStatus, json: { data: state.emptyOffers ? [] : ["sensei", "lms"].map(plan_code => ({ plan_code, program: { code: "n4", name: "JLPT N4", slug: "n4" }, effective_price: 123456, base_price: 123456, currency: "IDR", duration_months: 1, discount_percent: 0 })) } }));
  return Object.assign(state, { assertNoWrites });
}

for (const width of [390, 768, 1440]) {
  test(`R01 placement recommendation UI and navigation ${width}`, async ({ page }, testInfo) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 1000 });
    const state = await mockResult(page);
    await page.goto("/placement/result?attempt=12");
    const grid = page.locator(".placement-recommendation-grid");
    const cards = grid.locator("article");
    await expect(cards).toHaveCount(3);
    const badge = grid.getByLabel("Paket paling populer");
    await expect(badge).toHaveCount(1);
    await expect(cards.first()).toContainText("Paling Populer");
    await expect(badge).toHaveClass("pricing-floating-badge");
    expect(await badge.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14);
    const badgeBox = (await badge.boundingBox())!;
    const cardBox = (await cards.first().boundingBox())!;
    const titleBox = (await cards.first().getByRole("heading").boundingBox())!;
    expect(badgeBox.x).toBeGreaterThanOrEqual(cardBox.x);
    expect(badgeBox.x + badgeBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
    expect(Math.abs(badgeBox.x + badgeBox.width / 2 - (cardBox.x + cardBox.width / 2))).toBeLessThan(2);
    expect(Math.abs(badgeBox.y + badgeBox.height / 2 - cardBox.y)).toBeLessThan(2);
    expect(badgeBox.y + badgeBox.height).toBeLessThanOrEqual(titleBox.y);
    const catalog = page.getByRole("link", { name: "Lihat Program Lainnya", exact: true });
    await expect(catalog).toHaveCount(1);
    await expect(catalog).toHaveAttribute("href", "/program");
    const gridBox = (await grid.boundingBox())!;
    expect((await catalog.boundingBox())!.y).toBeGreaterThanOrEqual(gridBox.y + gridBox.height);
    expect((await catalog.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const links = [
      ["Pilih Kelas bersama Sensei →", "/program?program=n4&plan=sensei"],
      ["Pilih Belajar Mandiri →", "/program?program=n4&plan=lms"],
      ["Mulai Coba Gratis →", "/program?program=n4&plan=free"],
    ];
    for (const [name, href] of links) await expect(grid.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
    await catalog.scrollIntoViewIfNeeded();
    await expect(catalog).toBeInViewport();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`placement-r01-${width}.png`), fullPage: true });
    for (const [name, href] of links) {
      await grid.getByRole("link", { name, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"));
      const summary = page.getByRole("complementary", { name: "Ringkasan pilihan program dan paket" });
      await expect(summary).toContainText("JLPT N4");
      await expect(summary.getByRole("link")).toHaveAttribute("href", `/register?program=n4&plan=${new URLSearchParams(href.split("?")[1]).get("plan")}`);
      await expect(summary).toBeInViewport();
      if (!href.endsWith("free")) {
        await expect(summary).toContainText("1 bulan");
        await expect(summary.locator(".pricing-amount")).toContainText("Rp123.456");
      }
      await page.goBack();
      await expect(cards).toHaveCount(3);
    }
    await catalog.click();
    await expect(page).toHaveURL(/\/program$/);
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Rekomendasi Level yang disarankan adalah N4" })).toBeVisible();
    await expect(cards).toHaveCount(3);
    state.assertNoWrites();
  });
}

test("R01 existing empty and error states do not invent recommendations", async ({ page }) => {
  const state = await mockResult(page);
  state.emptyOffers = true;
  await page.goto("/placement/result?attempt=12");
  await expect(page.getByRole("heading", { name: "Paket belajar N4 belum tersedia" })).toBeVisible();
  await expect(page.locator(".placement-recommendation-grid article")).toHaveCount(1);
  await expect(page.getByLabel("Paket paling populer")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Lihat Program Lainnya", exact: true })).toBeVisible();
  state.adaptive = false;
  state.recommended = false;
  await page.reload();
  await expect(page.locator(".placement-recommendation-grid article")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Lihat katalog program", exact: true })).toHaveAttribute("href", "/program");
  state.offersStatus = 503;
  await page.reload();
  await expect(page.locator("main").getByRole("alert")).toBeVisible();
  await expect(page.locator(".placement-recommendation-grid article")).toHaveCount(0);
  state.result = false;
  await page.reload();
  await expect(page.locator("main").getByRole("alert")).toBeVisible();
  await expect(page.locator(".placement-recommendation-grid")).toHaveCount(0);
  state.attemptStatus = 404;
  await page.reload();
  await expect(page.locator("main").getByRole("alert")).toBeVisible();
  await expect(page.getByRole("link", { name: "Lihat Program Lainnya", exact: true })).toHaveCount(0);
});
