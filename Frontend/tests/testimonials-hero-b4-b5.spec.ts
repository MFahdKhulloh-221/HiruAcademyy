import { expect, test } from "@playwright/test";

for (const width of [390, 768, 1440]) {
  test(`B4 preview and separate full lists ${width}px, API mocked`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let empty = false;
    let textCount = 23;
    const texts = Array.from({ length: 23 }, (_, index) => ({ id: index + 1, name: `Siswa ${index + 1}`, context: "JLPT N5", quote: "Belajar lebih terarah bersama Hiru.", type: "text", image: null }));
    const videos = Array.from({ length: 5 }, (_, index) => ({ id: index + 100, name: `Video ${index + 1}`, title: `Cerita ${index + 1}`, context: "JLPT N4", quote: "Pengalaman belajar", type: "video", video_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", video_thumbnail: null }));
    await page.route("**/api/**", route => {
      const path = new URL(route.request().url()).pathname;
      return path === "/api/me" ? route.fulfill({ status: 401, json: {} }) : route.fulfill({ json: { data: path === "/api/testimonials" && !empty ? [...texts.slice(0, textCount), ...videos] : [] } });
    });
    await page.goto("/testimoni");
    const comments = page.getByRole("region", { name: "Testimoni Komentar", exact: true });
    const videoSection = page.getByRole("region", { name: "Testimoni Video (5)", exact: true });
    await expect(comments.getByRole("heading")).toHaveText("Testimoni Komentar (23)");
    await expect(comments.locator(".testimonial-card:visible")).toHaveCount(width < 1024 ? 2 : 3);
    await expect(videoSection.getByRole("button", { name: /^Tonton/ })).toHaveCount(2);
    const commentBox = await comments.boundingBox();
    const videoBox = await videoSection.boundingBox();
    expect(commentBox).not.toBeNull(); expect(videoBox).not.toBeNull();
    if (width < 1024) expect(videoBox!.y).toBeGreaterThanOrEqual(commentBox!.y + commentBox!.height);
    else expect(videoBox!.y).toBe(commentBox!.y);
    await page.screenshot({ path: `test-results/b4-preview-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Lihat Semua Komentar", exact: true }).click();
    await expect(comments.locator(".testimonial-card:visible")).toHaveCount(23);
    await expect(videoSection).toHaveCount(0);
    await page.getByRole("button", { name: "Semua", exact: true }).click();
    await page.getByRole("button", { name: "Lihat Semua Video", exact: true }).click();
    await expect(page.getByRole("button", { name: /^Tonton/ })).toHaveCount(5);
    await expect(comments).toHaveCount(0);
    await page.locator(".public-footer").scrollIntoViewIfNeeded();
    await expect(page.locator(".public-footer")).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.goto("/testimoni#testimoni-23");
    await expect(page.locator("#testimoni-23")).toBeVisible();
    textCount = 1;
    await page.goto("/testimoni");
    await expect(comments.locator(".testimonial-card:visible")).toHaveCount(1);
    empty = true;
    await page.reload();
    await expect(page.getByText("Belum ada testimoni.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Lihat Semua/ })).toHaveCount(0);
    await page.screenshot({ path: `test-results/b4-empty-${width}.png`, fullPage: true });
  });

  test(`B5 hero spacing and CTA ${width}px, API mocked`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/**", route => new URL(route.request().url()).pathname === "/api/me"
      ? route.fulfill({ status: 401, json: {} }) : route.fulfill({ json: { data: [] } }));
    await page.goto("/");
    const hero = page.getByRole("region", { name: "Promosi Hiru Academy" });
    await expect(hero).not.toHaveAttribute("aria-busy", "true");
    const title = hero.getByRole("heading", { level: 1 });
    await expect(title).toBeVisible();
    await expect(hero.getByRole("link", { name: "Coba Gratis" })).toHaveAttribute("href", "/register");
    await expect(hero.getByRole("link", { name: "Lihat Program" })).toHaveAttribute("href", "/program");
    const layout = await hero.evaluate(element => {
      const box = (node: Element) => { const r = node.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
      const heading = element.querySelector("h1")!;
      const description = heading.nextElementSibling!;
      const actions = description.nextElementSibling!;
      return { hero: box(element), heading: box(heading), description: box(description), actions: box(actions), header: box(document.querySelector(".public-header")!), program: box(document.querySelector("#program")!) };
    });
    expect(layout.hero.top).toBeGreaterThanOrEqual(layout.header.bottom - 1);
    expect(layout.description.top - layout.heading.bottom).toBeGreaterThanOrEqual(17);
    expect(layout.actions.top - layout.description.bottom).toBeGreaterThanOrEqual(23);
    expect(layout.actions.bottom).toBeLessThanOrEqual(layout.hero.bottom);
    expect(layout.program.top).toBeGreaterThanOrEqual(layout.hero.bottom);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await hero.screenshot({ path: `test-results/b5-hero-${width}.png` });
  });
}
