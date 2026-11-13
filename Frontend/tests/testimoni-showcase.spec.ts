import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`Student Stories Showcase at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const records = [
      ...Array.from({ length: 7 }, (_, index) => ({
        id: index + 1, name: `Siswa ${index + 1}`, context: "JLPT N4", type: "text",
        quote: "Belajar dengan terarah membantu saya memahami bahasa Jepang. ".repeat(80),
        created_at: "2026-10-01T00:00:00Z", show_on_testimonials: true, published: true,
      })),
      ...Array.from({ length: 4 }, (_, index) => ({
        id: index + 20, name: `Siswa Video ${index + 1}`, type: "video", title: `Perjalanan ${index + 1}`,
        context: "JLPT N3", quote: "Cerita belajar", video_url: "https://www.youtube.com/watch?v=abcdefghijk",
        show_on_testimonials: true, published: true,
      })),
    ];
    await page.route("**/api/**", route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/me") return route.fulfill({ status: 401, json: {} });
      return route.fulfill({ json: { data: path === "/api/testimonials" ? records : [] } });
    });
    await page.goto("/testimoni");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Setiap perjalanan punya cerita hebat.");
    const featured = page.getByRole("button", { name: "Tonton Perjalanan 1", exact: true }).first();
    await expect(featured).toBeVisible();
    const featuredBox = await featured.boundingBox();
    expect(featuredBox!.y).toBeLessThan(900);
    const texts = page.getByRole("region", { name: "Ditulis oleh Siswa" });
    await expect(texts.getByRole("article")).toHaveCount(width < 640 ? 2 : 4);
    await texts.getByRole("button", { name: "Tampilkan Cerita Lainnya" }).click();
    await expect(texts.getByRole("article")).toHaveCount(width < 640 ? 4 : 7);
    const quote = texts.getByRole("blockquote").first();
    expect(await quote.evaluate(element => getComputedStyle(element).webkitLineClamp)).toBe("4");
    const collapsedHeight = (await quote.boundingBox())!.height;
    const expand = texts.getByRole("button", { name: "Baca selengkapnya", exact: true }).first();
    await expand.click();
    await expect(texts.getByRole("button", { name: "Tampilkan lebih sedikit", exact: true }).first()).toHaveAttribute("aria-expanded", "true");
    expect((await quote.boundingBox())!.height).toBeGreaterThan(collapsedHeight);
    expect((await quote.innerText()).trim().split(/\s+/)).toHaveLength(500);
    await expect(texts.getByRole("time").first()).toHaveText("1 Oktober 2026");
    const filters = page.getByRole("group", { name: "Jenis testimoni" });
    await filters.getByRole("button", { name: "Video", exact: true }).click();
    await expect(texts).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Galeri video siswa" }).getByRole("button")).toHaveCount(4);
    await featured.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Putar Perjalanan 1" }).click();
    await expect(dialog.locator("iframe")).toHaveAttribute("src", /youtube.*abcdefghijk/);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(featured).toBeFocused();
    await filters.getByRole("button", { name: "Cerita Teks", exact: true }).click();
    await expect(page.getByRole("region", { name: "Pilihan Video", exact: true })).toHaveCount(0);
    await expect(texts).toBeVisible();
    await filters.getByRole("button", { name: "Semua", exact: true }).click();
    await expect(page.getByRole("region", { name: "Pilihan Video", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Cek Level Gratis" })).toHaveAttribute("href", "/placement");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.goto("/testimoni#testimoni-7");
    await expect(page.getByRole("article", { name: "Testimoni Siswa 7", exact: true })).toBeVisible();
  });
}
