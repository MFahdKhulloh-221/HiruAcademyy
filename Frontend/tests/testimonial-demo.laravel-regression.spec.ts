import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const api = "http://localhost:8001";

test("two labelled brand demo videos upload, preview and play publicly", async ({ page }) => {
  test.setTimeout(120000);
  await page.route("https://testimonials.example.test/**", route => route.fulfill({ path: resolve("tests/fixtures/sample.png"), contentType: "image/png" }));
  await page.request.get(`${api}/sanctum/csrf-cookie`);
  const token = (await page.context().cookies(api)).find(cookie => cookie.name === "XSRF-TOKEN");
  expect(token).toBeDefined();
  let headers = { Accept: "application/json", Origin: "http://localhost:3020", "X-XSRF-TOKEN": decodeURIComponent(token!.value) };
  const login = await page.request.post(`${api}/api/auth/login`, { headers, data: { identity: "browser.admin@example.test", password: "BrowserTesting123!" } });
  expect(login.status()).toBe(200);
  await page.request.get(`${api}/sanctum/csrf-cookie`);
  const refreshed = (await page.context().cookies(api)).find(cookie => cookie.name === "XSRF-TOKEN");
  headers = { ...headers, "X-XSRF-TOKEN": decodeURIComponent(refreshed!.value) };
  const fixtures: { id: number; path: string; title: string; url: string }[] = [];
  try {
    for (const [number, extension, mime] of [["01", "mp4", "video/mp4"], ["02", "webm", "video/webm"]]) {
      const title = `Demo / Preview untuk Evaluasi Client ${number}`;
      const upload = await page.request.post(`${api}/api/admin/media`, { headers, multipart: { kind: "video", file: { name: `hiru-demo-${number}.${extension}`, mimeType: mime, buffer: await readFile(resolve(`../assets/demo-testimonials/hiru-demo-${number}.${extension}`)) } } });
      expect(upload.status(), await upload.text()).toBe(201);
      const media = (await upload.json()).data;
      const create = await page.request.post(`${api}/api/admin/testimonials`, { headers, data: { type: "video", title, name: title, context: "Demo / Preview untuk Evaluasi Client", quote: "Placeholder brand lokal; bukan siswa dan bukan testimoni nyata.", video_url: media.path, video_title: title, video_thumbnail: "https://testimonials.example.test/thumbnail.png", published: true, landing: true, show_on_testimonials: true, sort_order: Number(number) } });
      expect(create.status(), await create.text()).toBe(201);
      fixtures.push({ id: (await create.json()).data.id, path: media.path, url: media.url, title });
    }
    await page.goto("/admin/testimoni");
    await page.getByRole("tablist", { name: "Jenis testimoni" }).getByRole("tab", { name: "Testimoni Video", exact: true }).click();
    for (const fixture of fixtures) {
      const row = page.getByRole("row").filter({ has: page.getByRole("cell", { name: fixture.title, exact: true }).first() });
      await expect(row.getByRole("link", { name: fixture.title, exact: true })).toHaveAttribute("href", fixture.url);
      await row.getByRole("button", { name: `Lihat testimoni ${fixture.title}` }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.locator("video")).toHaveCount(0);
      await dialog.getByRole("button", { name: `Putar ${fixture.title}`, exact: true }).click();
      await expect(dialog.locator("video")).toHaveAttribute("src", fixture.url);
      await page.keyboard.press("Escape");
    }
    for (const route of ["/testimoni", "/"]) {
      await page.goto(route);
      for (const fixture of fixtures) {
        await expect(page.locator(`video[src="${fixture.url}"]`)).toHaveCount(0);
        await page.getByRole("button", { name: `Putar ${fixture.title}`, exact: true }).click();
        const video = page.getByLabel(fixture.title, { exact: true }).and(page.locator(`video[src="${fixture.url}"]`));
        await expect(video).toBeVisible();
        await expect(video).toHaveAttribute("src", fixture.url);
        await video.evaluate(async (element: HTMLVideoElement) => { element.muted = true; await element.play(); });
        await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState >= 2 && !element.paused && element.currentTime > 0)).toBe(true);
        await video.evaluate((element: HTMLVideoElement) => element.pause());
      }
    }
  } finally {
    for (const fixture of fixtures) {
      expect((await page.request.delete(`${api}/api/admin/testimonials/${fixture.id}`, { headers })).status()).toBe(204);
      expect((await page.request.delete(`${api}/api/admin/media`, { headers, data: { path: fixture.path } })).status()).toBe(204);
    }
  }
});
