import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

const longQuote = `${"Materi mudah dipahami dan latihan membantu saya belajar secara terarah. ".repeat(6)}\nBagian akhir tetap terbaca.`;
const fixtures = [
  { id: 1, type: "text", name: "Siswa Singkat", context: "LMS N5", quote: "Belajar jadi lebih terarah.", image: "http://localhost:3000/test-avatar.png", landing: true, show_on_testimonials: true },
  { id: 2, type: "text", name: "Nama Pembelajar Panjang dengan Identitas Lengkap", context: "LMS dengan Sensei untuk persiapan JLPT N4", quote: longQuote, landing: true, show_on_testimonials: true },
  { id: 3, type: "text", name: "Siswa Ketiga", context: "LMS N3", quote: "KataTanpaSpasi".repeat(35), image: "http://localhost:3000/broken-avatar.png", landing: true, show_on_testimonials: true },
  { id: 4, type: "video", name: "Siswa Video Singkat", context: "LMS N5", title: "Video singkat", quote: "Sangat membantu.", video_url: "https://youtu.be/dQw4w9WgXcQ", video_thumbnail: "http://localhost:3000/test-avatar.png", landing: true, show_on_testimonials: true },
  { id: 5, type: "video", name: "Siswa Video Panjang", context: "LMS N4", title: "Video pengalaman belajar dengan judul panjang", quote: longQuote, video_url: "https://youtu.be/dQw4w9WgXcQ", landing: true, show_on_testimonials: true },
  { id: 6, type: "text", name: "Khusus Landing", context: "LMS N4", quote: longQuote, landing: true, show_on_testimonials: false },
  { id: 7, type: "text", name: "Khusus Halaman Testimoni", context: "LMS N3", quote: "Komentar lengkap.", landing: false, show_on_testimonials: true },
];

for (const width of [390, 768, 1440]) {
  test(`public testimonial short/long layout ${width}px`, async ({ page, baseURL }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (/hydration|hydrating/i.test(message.text())) errors.push(message.text()); });
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/testimonials") return route.fulfill({ headers: { "Access-Control-Allow-Origin": baseURL!, "Access-Control-Allow-Credentials": "true" }, json: { data: fixtures.filter(item => url.searchParams.has("landing") ? item.landing : item.show_on_testimonials) } });
      if (url.pathname === "/test-avatar.png") return route.fulfill({ path: resolve("tests/fixtures/sample.png"), contentType: "image/png" });
      if (url.pathname === "/broken-avatar.png") return route.fulfill({ status: 404 });
      if (url.pathname === "/api/auth/me") return route.fulfill({ status: 401, json: { message: "Unauthenticated." } });
      if (url.pathname.startsWith("/api/")) return route.fulfill({ json: { data: [] } });
      if (["localhost", "127.0.0.1"].includes(url.hostname)) return route.continue();
      return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Offline player</title>" });
    });
    for (const path of ["/", "/testimoni"]) {
      if (path === "/") {
        await page.goto(path, { waitUntil: "domcontentloaded" });
      } else {
        await page.locator("#testimoni-2").getByRole("link", { name: "Baca selengkapnya" }).click();
        await expect(page).toHaveURL(/\/testimoni#testimoni-2$/);
        const target = page.locator("#testimoni-2");
        await expect(target.getByRole("button", { name: "Tampilkan lebih sedikit" })).toHaveAttribute("aria-expanded", "true");
        await expect.poll(() => target.evaluate(element => { const rect = element.getBoundingClientRect(); return rect.top >= 0 && rect.top < innerHeight; })).toBe(true);
        const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === "/api/testimonials" && response.status() === 200);
        await page.reload({ waitUntil: "domcontentloaded" });
        await (await refreshed).finished();
        await expect(page.locator(".testimonial-card")).toHaveCount(4);
        await expect(target.getByRole("button", { name: "Tampilkan lebih sedikit" })).toBeVisible();
        await target.getByRole("button", { name: "Tampilkan lebih sedikit" }).click();
      }
      const cards = page.locator(".testimonial-card");
      await expect(cards).toHaveCount(4);
      await cards.first().scrollIntoViewIfNeeded();
      for (const item of fixtures.filter(item => item.type === "text" && (path === "/" ? item.landing : item.show_on_testimonials))) {
        const card = page.locator(`#testimoni-${item.id}`);
        await expect(card.locator("header strong")).toHaveText(item.name);
        await expect(card.locator("header small")).toHaveText(item.context);
        await expect(card.getByRole("blockquote")).toHaveText(item.quote);
      }
      const geometry = await cards.evaluateAll(elements => elements.map(element => {
        const card = element.getBoundingClientRect();
        const avatar = element.querySelector(".testimonial-avatar")!.getBoundingClientRect();
        const identity = element.querySelector("header > div")!.getBoundingClientRect();
        const quote = element.querySelector("blockquote")!;
        const text = quote.getBoundingClientRect();
        const style = getComputedStyle(quote);
        return { top: card.top, height: card.height, avatarBottom: avatar.bottom, identityBottom: identity.bottom, identityLeft: identity.left, avatarRight: avatar.right, centerDelta: Math.abs((identity.top + identity.bottom - avatar.top - avatar.bottom) / 2), textTop: text.top, textBottom: text.bottom, bottom: card.bottom, clamp: style.webkitLineClamp, overflow: style.overflow, textHeight: text.height, lineHeight: parseFloat(style.lineHeight), columns: getComputedStyle(element.parentElement!).gridTemplateColumns.split(" ").length };
      }));
      for (const box of geometry) {
        expect(box.textTop).toBeGreaterThanOrEqual(Math.max(box.avatarBottom, box.identityBottom));
        expect(box.identityLeft).toBeGreaterThan(box.avatarRight);
        expect(box.centerDelta).toBeLessThan(1);
        expect(box.textBottom).toBeLessThanOrEqual(box.bottom);
        expect(box.textHeight).toBeLessThanOrEqual(box.lineHeight * (path === "/" ? 4 : 5) + 1);
        expect(box.clamp).toBe(path === "/" ? "4" : "5");
        expect(box.overflow).toBe("hidden");
        expect(box.columns).toBe(width < 640 ? 1 : path === "/testimoni" ? 2 : width < 1024 ? 2 : 3);
      }
      if (width >= 640) {
        expect(Math.abs(geometry[0].top - geometry[1].top)).toBeLessThan(1);
        expect(Math.abs(geometry[0].height - geometry[1].height)).toBeLessThan(1);
      }
      await expect(cards.first().locator("img")).toBeVisible();
      await expect.poll(() => cards.first().locator("img").evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      await expect(cards.nth(1).locator(".testimonial-avatar")).toHaveText("NP");
      await expect(cards.nth(2).locator(".testimonial-avatar")).toHaveText("SK");
      const expandable = page.locator(path === "/" ? "#testimoni-6" : "#testimoni-2");
      await expect(expandable.getByRole("link")).toHaveCount(0);
      const toggle = expandable.getByRole("button", { name: "Baca selengkapnya" });
      await toggle.click();
      await expect(expandable.getByRole("button", { name: "Tampilkan lebih sedikit" })).toHaveAttribute("aria-expanded", "true");
      await expect.poll(() => expandable.locator("blockquote").evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
      await expandable.getByRole("button", { name: "Tampilkan lebih sedikit" }).click();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      const videos = page.locator(".testimonial-video-card");
      await expect(videos).toHaveCount(2);
      await expect(videos.first().locator("img")).toBeVisible();
      await videos.first().getByRole("button", { name: "Putar Video singkat" }).click();
      await expect(videos.first().locator("iframe")).toHaveAttribute("src", /youtube.*\/embed\//);
      const link = videos.last().getByRole("link", { name: "Buka video", exact: true });
      await expect(link).toHaveAttribute("href", /youtu/);
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
      // Seed previous control, then reach link through real keyboard navigation.
      await videos.last().getByRole("button").focus();
      await page.keyboard.press("Tab");
      await expect(link).toBeFocused();
      await expect(link).toHaveJSProperty("tabIndex", 0);
      expect(await link.evaluate(element => element.matches(":focus-visible"))).toBe(true);
      expect(await link.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    expect(errors).toEqual([]);
  });
}

// Read-only local API/browser check. No fixture writes or database mutations.
test("development testimonials match API on desktop and mobile", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (/hydration|hydrating/i.test(message.text())) errors.push(message.text()); });
  const api = "http://localhost:8000";
  const payloads = new Map();
  for (const path of ["/", "/testimoni"]) {
    const response = await request.get(`${api}/api/testimonials${path === "/" ? "?landing=true" : ""}`);
    expect(response.ok()).toBe(true);
    payloads.set(path, (await response.json()).data);
  }
  for (const path of ["/", "/testimoni"]) {
      const data = payloads.get(path);
      // Snapshot showed loading still active at former five-second card assertion.
      // Wait for actual browser response, not a fixed delay or request-context preflight.
      const browserResponse = page.waitForResponse(response => response.url() === `${api}/api/testimonials${path === "/" ? "?landing=true" : ""}` && response.request().method() === "GET");
      await page.goto(path, { waitUntil: "domcontentloaded" });
      const loaded = await browserResponse;
      expect(loaded.ok()).toBe(true);
      expect((await loaded.json()).data).toEqual(data);
      await expect(page.getByRole("status").filter({ hasText: "Memuat testimoni" })).toHaveCount(0);
      const texts = data.filter((item: { type: string }) => item.type === "text");
      const videos = data.filter((item: { type: string }) => item.type === "video");
      if (path === "/") expect(data.length).toBeLessThanOrEqual(6);
      await expect(page.locator(".testimonial-card")).toHaveCount(texts.length);
      await expect(page.locator(".testimonial-video-card")).toHaveCount(videos.length);
      for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => page.locator(".testimonial-card").evaluateAll(cards => cards.map(card => ({
        id: Number(card.id.replace("testimoni-", "")),
        name: card.querySelector("header strong")?.textContent,
        context: card.querySelector("header small")?.textContent,
        quote: card.querySelector("blockquote")?.textContent,
      })))).toEqual(texts.map((item: { id: number; name: string; context: string; quote: string }) => ({ id: item.id, name: item.name, context: item.context, quote: item.quote })));
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      console.log(`${width}px ${path}: ${texts.length} text, ${videos.length} video`);
    }
  }
  expect(errors).toEqual([]);
});
