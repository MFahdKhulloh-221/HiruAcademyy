import { expect, test } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`summary geometry stays consistent across plans and promotions ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    let discounted = false;
    await page.route(/\/api\//, async route => {
      const path = new URL(route.request().url()).pathname;
      expect(route.request().method()).toBe("GET");
      const program = { id: 1, code: "n5", name: "JLPT N5", family: "jlpt" };
      const data = path === "/api/public/programs" ? [program] : path === "/api/public/offers" ? ["lms", "sensei"].map(plan_code => ({ program, plan_code, base_price: 350000, effective_price: discounted ? 315000 : 350000, discount_percent: discounted ? 10 : 0, duration_months: 1, currency: "IDR" })) : [];
      await route.fulfill({ status: path === "/api/me" ? 401 : 200, json: { data } });
    });
    let baseline: number[] | undefined;
    for (const promo of [false, true]) {
      discounted = promo;
      for (const plan of ["free", "lms", "sensei"]) {
        await page.goto(`/program?level=N5&plan=${plan}`);
        const summary = page.getByRole("complementary", { name: "Ringkasan pilihan program dan level" });
        await expect(summary.locator(".pricing-amount")).toHaveText(plan === "free" ? "Gratis" : promo ? "Rp315K" : "Rp350K");
        await expect(summary.locator(".pricing-discount-row")).toHaveCount(plan !== "free" && promo ? 1 : 0);
        await expect(summary.locator(".summary-meta-card")).toHaveCount(3);
        const geometry = await summary.evaluate(el => {
          const top = el.getBoundingClientRect().top;
          return [".summary-meta-grid", ".pricing-amount", ".summary-action-box"].map(selector => Math.round(el.querySelector(selector)!.getBoundingClientRect().top - top));
        });
        baseline ??= geometry;
        expect(geometry).toEqual(baseline);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await summary.screenshot({ path: testInfo.outputPath(`${plan}-${promo ? "discount" : "normal"}-${width}.png`) });
      }
    }
  });
}
