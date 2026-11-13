import { expect, test } from "@playwright/test";

for (const width of [390, 768, 1440]) {
  test(`Landing excludes latest articles at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const blogRequests: string[] = [];
    await page.route("**/api/**", route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/blog") blogRequests.push(path);
      if (path === "/api/me") return route.fulfill({ status: 401, json: {} });
      return route.fulfill({ json: { data: [] } });
    });

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Belum tahu harus mulai dari level mana?", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Artikel Terbaru", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Lihat Semua Artikel", exact: true })).toHaveCount(0);
    await expect(page.locator("a.blog-card")).toHaveCount(0);
    expect(blogRequests).toEqual([]);
  });
}
