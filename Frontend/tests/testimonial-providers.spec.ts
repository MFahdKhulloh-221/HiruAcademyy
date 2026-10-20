import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

for (const width of [390, 768, 1440]) {
  test(`public provider fixtures lazy keyboard playback and fallback ${width}px`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 900 });
    const seen: string[] = [];
    const sources = [
      { title: "Native fixture", url: "https://video.example.test/playable.mp4", kind: "native" },
      { title: "Broken fixture", url: "https://video.example.test/broken.mp4", kind: "broken" },
      { title: "YouTube fixture", url: "https://youtu.be/dQw4w9WgXcQ", kind: "youtube" },
      { title: "Drive fixture", url: "https://drive.google.com/file/d/browserfixture123/view", kind: "drive" },
      { title: "Instagram fixture", url: "https://www.instagram.com/reel/browserfixture123/", kind: "instagram" },
    ];
    const testimonials = sources.map((source, index) => ({ id: index + 1, type: "video", title: source.title, name: `Provider student ${index}`, context: "Browser fixture", quote: "Provider description", video_title: source.title, video_url: source.url, video_thumbnail: "https://video.example.test/thumbnail.png", published: true, landing: true, show_on_testimonials: true }));
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/testimonials") return route.fulfill({ headers: { "Access-Control-Allow-Origin": "http://localhost:3000", "Access-Control-Allow-Credentials": "true" }, json: { data: testimonials } });
      if (url.pathname === "/api/auth/me") return route.fulfill({ status: 401, json: { message: "Unauthenticated." } });
      if (url.pathname.startsWith("/api/")) return route.fulfill({ json: { data: [] } });
      if (["localhost", "127.0.0.1"].includes(url.hostname)) return route.continue();
      seen.push(url.href);
      if (url.pathname === "/thumbnail.png") return route.fulfill({ path: resolve("tests/fixtures/sample.png"), contentType: "image/png" });
      if (url.pathname === "/playable.mp4") return route.fulfill({ body: await readFile(resolve("tests/fixtures/playable.mp4")), contentType: "video/mp4" });
      if (url.pathname === "/broken.mp4") return route.fulfill({ status: 404, body: "Not found" });
      return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Offline provider</title>" });
    });
    for (const path of ["/", "/testimoni"]) {
      seen.length = 0;
      await page.goto(path);
      await expect(page.getByRole("button", { name: "Putar Native fixture", exact: true })).toBeVisible();
      await expect(page.locator("video, iframe")).toHaveCount(0);
      expect(seen.some(url => /youtube|drive\.google|instagram|\.mp4/.test(url))).toBe(false);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const source of sources) {
        const card = page.getByRole("article").filter({ has: page.getByText(source.title, { exact: true }) });
        const link = card.getByRole("link");
        await expect(link).toHaveAttribute("target", "_blank");
        await expect(link).toHaveAttribute("rel", /noopener/);
        if (source.kind === "instagram") {
          await expect(link).toHaveAccessibleName("Tonton di Instagram");
          await expect(link).toHaveAttribute("href", source.url);
          await expect(card.locator("iframe, video, button")).toHaveCount(0);
          await link.focus();
          await expect(link).toBeFocused();
          continue;
        }
        const play = card.getByRole("button", { name: `Putar ${source.title}`, exact: true });
        await play.scrollIntoViewIfNeeded();
        await play.focus();
        await expect(play).toBeFocused();
        expect(await play.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
        const box = await play.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
        await page.keyboard.press("Enter");
        if (source.kind === "broken") {
          await expect(card.getByRole("status")).toHaveText("Video tidak dapat diputar.");
          await expect(link).toHaveAttribute("href", source.url);
        } else if (source.kind === "native") {
          const video = card.locator("video");
          await expect(video).toHaveAttribute("src", source.url);
          await video.evaluate(async (element: HTMLVideoElement) => { element.muted = true; await element.play(); });
          await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState >= 2 && !element.paused && element.currentTime > 0)).toBe(true);
          await video.evaluate((element: HTMLVideoElement) => element.pause());
        } else {
          await expect(card.locator("iframe")).toHaveAttribute("src", source.kind === "youtube" ? "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" : "https://drive.google.com/file/d/browserfixture123/preview");
          await expect(card.locator("iframe")).toHaveAttribute("title", source.title);
          await expect.poll(() => seen.some(url => url.includes(source.kind === "youtube" ? "youtube-nocookie.com/embed/" : "drive.google.com/file/d/"))).toBe(true);
        }
      }
      expect(seen.some(url => new URL(url).hostname.includes("instagram"))).toBe(false);
    }
  });
}
