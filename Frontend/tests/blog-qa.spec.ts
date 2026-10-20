import { expect, test } from "@playwright/test";
import { blogThumbnailFallback } from "../src/lib/blog-thumbnail";

test("blog fallback images stay consistent with article detail and slug redirect", async ({ page }) => {
  test.setTimeout(120000);
  const articles = [
    { id: 1, title: "Tips Belajar Demo", slug: "tips-belajar-demo", thumbnail: null, category: "Tips Belajar", featured: true },
    { id: 2, title: "Grammar Demo", slug: "grammar-demo", thumbnail: "http://localhost:8000/missing.png", category: "Grammar / Bunpou", featured: false },
    { id: 3, title: "JLPT Demo", slug: "jlpt-demo", thumbnail: "https://images.example.test/broken.png", category: "JLPT", featured: false },
    { id: 4, title: "Listening Demo", slug: "listening-demo", thumbnail: "/blog/tamnel4.png", category: "Listening / Choukai", featured: false },
  ].map(article => ({ ...article, body: "Konten fixture pengujian.", excerpt: "Fixture pengujian.", author: "QA", published_at: null }));
  await page.route("https://images.example.test/broken.png", route => route.fulfill({ status: 404, body: "" }));
  await page.route("**/api/blog", route => route.fulfill({ headers: { "Access-Control-Allow-Origin": "http://localhost:3000", "Access-Control-Allow-Credentials": "true" }, json: { data: articles } }));
  await page.route("**/api/blog/*", route => {
    const slug = new URL(route.request().url()).pathname.split("/").pop();
    return route.fulfill({ headers: { "Access-Control-Allow-Origin": "http://localhost:3000", "Access-Control-Allow-Credentials": "true" }, json: { data: articles.find(article => article.slug === slug) } });
  });
  await page.goto("/blog");
  for (const article of articles) {
    const image = page.getByRole("img", { name: article.title, exact: true }).first();
    await expect.poll(() => image.evaluate((node: HTMLImageElement) => new URL(node.src).pathname)).toBe(article.id === 4 ? "/blog/tamnel4.png" : blogThumbnailFallback(article.slug));
    await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
  }
  await page.getByRole("textbox", { name: "Cari materi, level, atau topik" }).fill("Grammar Demo");
  await expect(page.locator(".blog-card")).toHaveCount(1);
  await page.getByRole("textbox", { name: "Cari materi, level, atau topik" }).fill("");
  await page.getByRole("button", { name: "JLPT", exact: true }).click();
  await expect(page.locator(".blog-card")).toHaveCount(1);
  await expect(page.locator(".blog-card h3")).toHaveText("JLPT Demo");
  await page.getByRole("button", { name: "Semua", exact: true }).click();
  await expect(page.locator(".blog-card")).toHaveCount(4);
  await page.locator(".blog-card").filter({ hasText: "Grammar Demo" }).getByRole("link", { name: "Baca Artikel" }).click();
  await expect(page).toHaveURL(/\/blog\/grammar-demo$/);
  for (const article of articles) {
    await page.goto(`/blog/${article.slug}`);
    await expect(page).toHaveURL(new RegExp(`/blog/${article.slug}$`));
    const image = page.getByRole("img", { name: article.title, exact: true });
    await expect.poll(() => image.evaluate((node: HTMLImageElement) => new URL(node.src).pathname)).toBe(article.id === 4 ? "/blog/tamnel4.png" : blogThumbnailFallback(article.slug));
    await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
  }
});
