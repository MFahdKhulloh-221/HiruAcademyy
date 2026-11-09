import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) {
  for (const count of [0, 1, 2, 3, 4]) {
    test(`B3 ${count} articles at ${width}px, public API mocked`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const articles = Array.from({ length: count }, (_, index) => ({
        id: index + 1, slug: `artikel-${index + 1}`, title: `Artikel ${index + 1}`,
        excerpt: `Ringkasan artikel ${index + 1}.`, thumbnail: null,
        published: true, published_at: `2026-10-0${index + 1}T00:00:00Z`,
      }));
      await page.route("**/api/**", route => {
        const path = new URL(route.request().url()).pathname;
        if (path === "/api/me") return route.fulfill({ status: 401, json: {} });
        return route.fulfill({ json: { data: path === "/api/blog" ? articles : [] } });
      });
      // Destination documents mocked too: verify navigation, not server-side Blog rendering.
      await page.route("**/blog**", route => route.request().isNavigationRequest()
        ? route.fulfill({ contentType: "text/html", body: "<main>Blog destination mocked</main>" })
        : route.fallback());
      const blogResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/blog");
      await page.goto("/");
      await (await blogResponse).finished();
      const section = page.getByRole("region", { name: "Artikel Terbaru", exact: true });
      if (!count) {
        await expect(page.getByRole("heading", { name: "Artikel Terbaru", exact: true })).toHaveCount(0);
        return;
      }
      await expect(section).toBeVisible();
      await section.scrollIntoViewIfNeeded();
      const cards = section.locator("a.blog-card");
      await expect(cards).toHaveCount(Math.min(count, 3));
      await expect(section.getByRole("heading", { level: 3 })).toHaveText(
        articles.slice().reverse().slice(0, 3).map(article => article.title),
      );
      await expect(cards.first()).toContainText(`Ringkasan artikel ${count}.`);
      await expect(cards.first().getByRole("img")).toBeVisible();
      await expect.poll(() => cards.first().getByRole("img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
      const boxes = await cards.evaluateAll(elements => elements.map(element => ({ x: element.getBoundingClientRect().x, y: element.getBoundingClientRect().y })));
      if (boxes.length > 1) {
        if (width === 390) expect(boxes[1].y).toBeGreaterThan(boxes[0].y);
        else expect(boxes[1].y).toBe(boxes[0].y);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await section.evaluate(element => Boolean(element.nextElementSibling?.classList.contains("final-cta")))).toBe(true);
      if (count === 4) {
        await cards.first().click();
        await expect(page).toHaveURL(/\/blog\/artikel-4$/);
        await page.goto("/");
        await page.getByRole("link", { name: "Lihat Semua Artikel", exact: true }).click();
        await expect(page).toHaveURL(/\/blog$/);
      }
    });
  }
}
