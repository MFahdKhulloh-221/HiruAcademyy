import { expect, test } from "@playwright/test";

const origin = "https://hiruacademy.id";
test.beforeEach(async ({ request }) => { await request.post("http://127.0.0.1:3412/mode?value=normal"); });
test.afterEach(async ({ request }) => { await request.post("http://127.0.0.1:3412/mode?value=normal"); });

test("initial HTML, metadata, structured data, all article links and visibility", async ({ request, page }) => {
  const catalog = await request.get("/blog");
  expect(catalog.status()).toBe(200);
  const html = await catalog.text();
  for (const text of ["Artikel QA 1", "Pengantar editorial 1.", "Penulis QA 1", "2026-01-02", "Artikel terbaru", 'href="/blog/qa-artikel-2"']) expect(html).toContain(text);
  expect(html).not.toContain("Draft rahasia QA");
  expect(html).not.toContain("Scheduled rahasia QA");
  for (let i = 1; i <= 14; i++) {
    const response = await request.get(`/blog/qa-artikel-${i}`);
    expect(response.status()).toBe(200);
    const body = await response.text();
    for (const text of [`Artikel QA ${i}`, `Pengantar editorial ${i}.`, `Penulis QA ${i}`, `Pembahasan nyata fixture ${i}.`, "Memahami materi", "Contoh penggunaan", 'href="/blog/qa-artikel-2"']) expect(body).toContain(text);
    if (i > 2) continue;
    // Parse response HTML itself; no hydration or client fetch needed.
    await page.setContent(body.replace(/<script(?![^>]*type="application\/ld\+json")[\s\S]*?<\/script>/gi, ""));
    await expect(page.locator("html")).toHaveAttribute("lang", "id");
    expect(await page.locator("title").textContent()).toBe(`${i === 2 ? "Artikel" : "SEO Artikel"} QA ${i} | HIRU Academy`);
    const description = i === 2 ? "Pengantar editorial 2." : "Deskripsi SEO 1.";
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", description);
    for (const selector of ['link[rel="canonical"]', 'meta[property="og:url"]']) await expect(page.locator(selector)).toHaveAttribute(selector.startsWith("link") ? "href" : "content", `${origin}/blog/qa-artikel-${i}`);
    for (const name of ["og:title", "og:description", "og:image"]) await expect(page.locator(`meta[property="${name}"]`)).toHaveAttribute("content", /.+/);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
    for (const name of ["twitter:title", "twitter:description", "twitter:image"]) await expect(page.locator(`meta[name="${name}"]`)).toHaveAttribute("content", /.+/);
    const schemas = (await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap(text => { const parsed: unknown = JSON.parse(text); return Array.isArray(parsed) ? parsed : [parsed]; });
    for (const type of ["Organization", "WebSite", "BlogPosting", "BreadcrumbList"]) expect(schemas.filter(item => item["@type"] === type)).toHaveLength(1);
    const posting = schemas.find(item => item["@type"] === "BlogPosting");
    expect(posting.author.name).toBe(`Penulis QA ${i}`);
    expect(posting.datePublished).toBe("2026-01-02T03:00:00.000Z");
    expect(posting.mainEntityOfPage).toBe(`${origin}/blog/qa-artikel-${i}`);
    expect(posting.image).toMatch(/^https:\/\//);
  }
  for (const slug of ["missing", "qa-draft", "qa-scheduled"]) expect((await request.get(`/blog/${slug}`)).status()).toBe(404);
  const redirect = await request.get("/blog/article?slug=qa-artikel-1", { maxRedirects: 0 });
  expect(redirect.status()).toBe(308);
  expect(redirect.headers().location).toBe("/blog/qa-artikel-1");
});

test("catalog filters, pagination, featured, reader navigation and thumbnails", async ({ page, request }) => {
  await page.goto("/blog");
  await expect(page.locator(".editorial-featured h2")).toHaveText("Artikel QA 1");
  await expect(page.locator(".editorial-card")).toHaveCount(12);
  const search = page.getByRole("searchbox");
  await search.fill("Artikel QA 14");
  await expect(page.locator(".editorial-card h3")).toHaveText("Artikel QA 14");
  await search.fill("");
  for (const [category, count] of [["Tips Belajar", 4], ["Grammar / Bunpou", 4], ["Listening / Choukai", 3], ["JLPT", 3]] as const) {
    await page.getByRole("button", { name: category, exact: true }).click();
    await expect(page.locator(".editorial-card")).toHaveCount(count);
  }
  await page.getByRole("button", { name: "Semua", exact: true }).click();
  await page.getByRole("navigation", { name: "Halaman artikel" }).getByRole("link", { name: "2", exact: true }).click();
  await expect(page.locator(".editorial-card")).toHaveCount(2);
  expect(await (await request.get("/blog?page=2")).text()).toContain('href="/blog/qa-artikel-14"');
  await page.goto("/blog?category=Grammar%20%2F%20Bunpou");
  await expect(page.locator(".editorial-card")).toHaveCount(4);
  await page.getByRole("button", { name: "Semua", exact: true }).click();
  await expect(page.locator(".editorial-card")).toHaveCount(12);
  for (const image of await page.locator(".editorial-card img").all()) {
    await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
    await expect(image).toHaveAttribute("alt", /Artikel QA/);
  }
  await page.locator(".editorial-card").first().getByRole("link", { name: "Baca Artikel" }).click();
  await expect(page).toHaveURL(/\/blog\/qa-artikel-1$/);
  await page.getByRole("navigation", { name: "Daftar isi" }).getByRole("link", { name: "Memahami materi" }).click();
  await expect(page).toHaveURL(/#section-2$/);
  await expect(page.locator("#section-2")).toHaveText("Memahami materi");
  const related = page.locator(".editorial-sidebar section").filter({ has: page.getByRole("heading", { name: "Artikel terkait" }) });
  await expect(related.getByRole("link")).toHaveCount(3);
  expect(await related.getByRole("link").evaluateAll(nodes => nodes.map(node => node.getAttribute("href")))).not.toContain("/blog/qa-artikel-1");
  await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Tips Belajar", exact: true }).click();
  await expect(page.locator(".editorial-card")).toHaveCount(4);
  await page.goto("/blog/qa-artikel-2");
  await expect.poll(() => page.locator(".editorial-article img").evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
  await page.getByRole("link", { name: "Kembali ke Blog", exact: false }).click();
  await expect(page).toHaveURL(/\/blog$/);
});

test("sitemap, robots, empty, unavailable and timeout", async ({ request, page }) => {
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  for (let i = 1; i <= 14; i++) expect(xml).toContain(`<loc>${origin}/blog/qa-artikel-${i}</loc>`);
  expect(xml).not.toMatch(/qa-draft|qa-scheduled|localhost|backend:|127\.0\./);
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain(`Sitemap: ${origin}/sitemap.xml`);
  expect(await robots.text()).not.toMatch(/Disallow: \/blog/);
  await request.post("http://127.0.0.1:3412/mode?value=empty");
  await page.goto("/blog");
  await expect(page.getByRole("status")).toHaveText("Artikel tidak ditemukan.");
  await expect(page.locator(".editorial-featured")).toHaveCount(0);
  await request.post("http://127.0.0.1:3412/mode?value=error");
  await page.goto("/blog");
  await expect(page.getByRole("heading", { name: "Artikel belum dapat dimuat" })).toBeVisible();
  const failedSitemap = await request.get("/sitemap.xml");
  expect(failedSitemap.status()).toBe(200);
  expect(await failedSitemap.text()).toContain(`<loc>${origin}/blog</loc>`);
  expect(await failedSitemap.text()).not.toContain("qa-artikel");
  await request.post("http://127.0.0.1:3412/mode?value=timeout");
  const start = Date.now();
  await page.goto("/blog");
  await expect(page.getByRole("heading", { name: "Artikel belum dapat dimuat" })).toBeVisible();
  expect(Date.now() - start).toBeLessThan(15000);
});

test("defensive visibility when upstream returns unpublished records", async ({ request }) => {
  await request.post("http://127.0.0.1:3412/mode?value=leaky");
  const html = await (await request.get("/blog")).text();
  expect(html).not.toContain("Draft rahasia QA");
  expect(html).not.toContain("Scheduled rahasia QA");
  for (const slug of ["qa-draft", "qa-scheduled"]) expect((await request.get(`/blog/${slug}`)).status()).toBe(404);
});

test("JSON-LD hostile text stays data; production hydration has no errors", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await request.post("http://127.0.0.1:3412/mode?value=security");
  try {
    const response = await page.goto("/blog/qa-security");
    expect(response?.status()).toBe(200);
    const unsafe = 'QA < > " </script><script>globalThis.qaInjected=true</script>';
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(unsafe);
    const scripts = await page.locator('script[type="application/ld+json"]').allTextContents();
    const schemas = scripts.flatMap(text => {
      expect(text).not.toContain("</script>");
      return JSON.parse(text);
    });
    expect(schemas.find(item => item["@type"] === "BlogPosting").headline).toBe(unsafe);
    expect(await page.evaluate(() => Reflect.get(globalThis, "qaInjected"))).toBeUndefined();
    await page.goto("/blog");
    await page.getByRole("searchbox").fill("Artikel QA 2");
    await expect(page.locator(".editorial-card h3")).toHaveText("Artikel QA 2");
    expect(errors).toEqual([]);
  } finally { await request.post("http://127.0.0.1:3412/mode?value=normal"); }
});

test("detail failures preserve HTTP error and omit invented metadata or secrets", async ({ request }) => {
  try {
    for (const mode of ["unavailable", "500", "timeout"]) {
      await request.post(`http://127.0.0.1:3412/mode?value=${mode}`);
      const start = Date.now();
      // Bot user agent forces blocking metadata, making response status observable before streaming.
      const response = await request.get("/blog/qa-artikel-1", { headers: { "User-Agent": "Twitterbot" } });
      expect(response.status()).toBe(500);
      // Metadata and page rendering can each incur one 8s fetch timeout.
      expect(Date.now() - start).toBeLessThan(22000);
      const html = await response.text();
      expect(html).not.toContain('"@type":"BlogPosting"');
      expect(html).not.toContain("SEO Artikel QA 1");
      expect(html).not.toMatch(/API_INTERNAL_URL|backend:10000|127\.0\.0\.1:3412|at publicBlog|blog-server\.ts/);
    }
  } finally { await request.post("http://127.0.0.1:3412/mode?value=normal"); }
});

test("reading progress follows body scroll with stable desktop layout", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/blog/qa-artikel-1");
  const progress = page.getByRole("progressbar", { name: "Progress membaca" });
  await expect(progress).toHaveAttribute("value", "0");
  for (const fraction of [0.5, 1]) {
    await page.locator(".editorial-body").evaluate((body, fraction) => {
      const header = document.querySelector(".public-header")!.getBoundingClientRect().bottom;
      const rect = body.getBoundingClientRect();
      window.scrollTo(0, scrollY + rect.top + rect.height * fraction - (header + (innerHeight - header) / 2));
    }, fraction);
    await expect.poll(async () => Number(await progress.getAttribute("value"))).toBeGreaterThanOrEqual(fraction * 100 - 1);
    if (fraction === 0.5) {
      await expect.poll(async () => Number(await progress.getAttribute("value"))).toBeLessThanOrEqual(51);
      await page.screenshot({ path: "C:/Users/Tulo/AppData/Local/Temp/opencode/blog-desktop-progress-middle.png" });
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
