import { expect, test } from "@playwright/test";

const longQuote = `${"Materi mudah dipahami dan latihan membantu saya belajar secara terarah. ".repeat(6)}\nBagian akhir tetap terbaca.`;
const fixtures = [
  { id: 1, type: "text", name: "Siswa Singkat", context: "LMS N5", quote: "Belajar jadi lebih terarah.", published: true, landing: true, show_on_testimonials: true },
  { id: 2, type: "text", name: "Nama Pembelajar Panjang dengan Identitas Lengkap", context: "LMS dengan Sensei untuk persiapan JLPT N4", quote: longQuote, published: true, landing: true, show_on_testimonials: true },
  { id: 3, type: "text", name: "Siswa Ketiga", context: "LMS N3", quote: "KataTanpaSpasi".repeat(35), published: true, landing: true, show_on_testimonials: true },
  { id: 4, type: "video", name: "Siswa Video Singkat", context: "LMS N5", title: "Video singkat", quote: "Sangat membantu.", video_url: "https://youtu.be/dQw4w9WgXcQ", video_thumbnail: "https://video.example.test/thumbnail.png", published: true, landing: true, show_on_testimonials: true },
  { id: 5, type: "video", name: "Siswa Video Panjang", context: "LMS N4", title: "Video pengalaman belajar dengan judul panjang", quote: longQuote, video_url: "https://youtu.be/dQw4w9WgXcQ", video_thumbnail: "https://video.example.test/thumbnail.png", published: true, landing: true, show_on_testimonials: true },
];

for (const width of [390, 768, 1440]) {
  test(`public testimonial short/long layout ${width}px`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/testimonials") return route.fulfill({ headers: { "Access-Control-Allow-Origin": "http://localhost:3000", "Access-Control-Allow-Credentials": "true" }, json: { data: fixtures } });
      if (url.pathname === "/api/auth/me") return route.fulfill({ status: 401, json: { message: "Unauthenticated." } });
      if (url.pathname.startsWith("/api/")) return route.fulfill({ json: { data: [] } });
      if (["localhost", "127.0.0.1"].includes(url.hostname)) return route.continue();
      return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Offline</title>" });
    });
    for (const path of ["/", "/testimoni"]) {
      await page.goto(path);
      const cards = page.locator(".testimonial-card");
      await expect(cards.first()).toBeVisible();
      await expect(cards).toHaveCount(3);
      await cards.first().scrollIntoViewIfNeeded();
      const geometry = await cards.evaluateAll(elements => elements.map(element => {
        const card = element.getBoundingClientRect();
        const avatar = element.querySelector(".testimonial-avatar")!.getBoundingClientRect();
        const footer = element.querySelector("footer")!.getBoundingClientRect();
        const quote = element.querySelector("blockquote")!;
        const text = quote.getBoundingClientRect();
        const style = getComputedStyle(quote);
        return { top: card.top, height: card.height, avatarBottom: avatar.bottom, footerBottom: footer.bottom, identityTop: footer.top, avatarTop: avatar.top, textTop: text.top, textBottom: text.bottom, bottom: card.bottom, fits: quote.scrollHeight <= quote.clientHeight + 1, clamp: style.webkitLineClamp, overflow: style.overflow, columns: getComputedStyle(element.parentElement!).gridTemplateColumns.split(" ").length };
      }));
      for (const box of geometry) {
        expect(box.textTop).toBeGreaterThanOrEqual(Math.max(box.avatarBottom, box.footerBottom));
        expect(box.identityTop).toBeGreaterThanOrEqual(box.avatarTop - 1);
        expect(box.textBottom).toBeLessThanOrEqual(box.bottom);
        expect(box.fits).toBe(true);
        expect(box.clamp).toBe("none");
        expect(box.overflow).toBe("visible");
        expect(box.columns).toBe(width < 640 ? 1 : width < 1024 ? 2 : 3);
      }
      if (width >= 640) {
        expect(Math.abs(geometry[0].top - geometry[1].top)).toBeLessThan(1);
        expect(Math.abs(geometry[0].height - geometry[1].height)).toBeLessThan(1);
      }
      await expect(cards.nth(1).getByRole("blockquote")).toHaveText(longQuote);
      const videos = page.locator(".testimonial-video-card");
      await expect(videos).toHaveCount(2);
      if (width >= 768) {
        const links = await videos.locator("footer a").evaluateAll(elements => elements.map(element => element.getBoundingClientRect().top));
        expect(Math.abs(links[0] - links[1])).toBeLessThan(1);
      }
      const link = videos.last().getByRole("link", { name: "Buka video", exact: true });
      await link.focus();
      await expect(link).toBeFocused();
      expect(await link.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}
