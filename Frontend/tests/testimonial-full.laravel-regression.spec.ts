import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const api = "http://localhost:8001";
const thumbnail = "https://testimonials.example.test/thumbnail.png";
const consent = "Saya mengizinkan Hiru Academy menampilkan testimoni ini secara publik beserta nama, foto profil, dan informasi program saya.";

async function headers(page: Page) {
  expect((await page.request.get(`${api}/sanctum/csrf-cookie`)).status()).toBe(204);
  const token = (await page.context().cookies(api)).find(cookie => cookie.name === "XSRF-TOKEN");
  expect(token).toBeDefined();
  return { Accept: "application/json", Origin: "http://localhost:3020", "X-XSRF-TOKEN": decodeURIComponent(token!.value) };
}

async function login(page: Page, role: "student" | "admin") {
  const response = await page.request.post(`${api}/api/auth/login`, {
    headers: await headers(page), data: { identity: `browser.${role}@example.test`, password: "BrowserTesting123!" },
  });
  expect(response.status(), await response.text()).toBe(200);
}

async function externalOnly(context: BrowserContext) {
  const requested: string[] = [];
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return route.continue();
    requested.push(url.href);
    if (url.hostname === "testimonials.example.test") {
      if (url.pathname === "/playable.mp4") return route.fulfill({ body: await readFile(resolve("tests/fixtures/playable.mp4")), contentType: "video/mp4" });
      if (url.pathname === "/broken.mp4") return route.fulfill({ status: 404, body: "Not found" });
      if (url.pathname === "/thumbnail.png") return route.fulfill({ path: resolve("tests/fixtures/sample.png"), contentType: "image/png" });
    }
    return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>External provider fixture</title><p>Offline provider fixture</p>" });
  });
  return requested;
}

async function own(page: Page, type: "text" | "video") {
  const response = await page.request.get(`${api}/api/student/testimonial?type=${type}`, { headers: { Accept: "application/json" } });
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()).data;
}

async function patch(admin: Page, id: number, data: Record<string, unknown>) {
  const response = await admin.request.patch(`${api}/api/admin/testimonials/${id}`, { headers: await headers(admin), data });
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()).data;
}

async function publicVisibility(guest: Page, quote: string, title: string, textVisible: boolean, videoVisible: boolean, route: "/" | "/testimoni") {
  const content = guest.waitForResponse(response => new URL(response.url()).pathname === "/api/testimonials");
  await guest.goto(route);
  expect((await content).status()).toBe(200);
  await expect(guest.getByText(quote, { exact: true })).toHaveCount(textVisible ? 1 : 0);
  await expect(guest.getByRole("button", { name: `Putar ${title}`, exact: true })).toHaveCount(videoVisible ? 1 : 0);
}

test("student independent text/video submissions, consent, approval, channels, inactive repeat approval and single deletion", async ({ browser, page }) => {
  test.setTimeout(180000);
  const adminContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const ids: number[] = [];
  const quote = "Independent text testimonial from browser student, approved through real Laravel.";
  const title = "Independent student video lifecycle";
  try {
    await externalOnly(page.context());
    await externalOnly(adminContext);
    await externalOnly(guestContext);
    const admin = await adminContext.newPage();
    const guest = await guestContext.newPage();
    await login(page, "student");
    await login(admin, "admin");
    // Only seeded browser student's own rows; dedicated test schema, never production.
    for (const type of ["text", "video"] as const) {
      const previous = await own(page, type);
      if (previous) expect((await admin.request.delete(`${api}/api/admin/testimonials/${previous.id}`, { headers: await headers(admin) })).status()).toBe(204);
    }
    await page.goto("/profile/testimoni");
    const types = page.getByRole("tablist", { name: "Jenis testimoni" });
    await expect(types.getByRole("tab", { name: "Testimoni Tertulis", exact: true })).toHaveAttribute("aria-selected", "true");
    await page.getByLabel("Program / Pengalaman Belajar").fill("Independent text program");
    await page.getByLabel("Ceritakan Pengalamanmu").fill(quote);
    await page.getByRole("button", { name: "Kirim Testimoni", exact: true }).click();
    expect(await own(page, "text")).toBeNull();
    await page.getByRole("checkbox", { name: consent }).check();
    const textSave = page.waitForResponse(response => response.url().endsWith("/api/student/testimonial") && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Kirim Testimoni", exact: true }).click();
    const textResponse = await textSave;
    expect(textResponse.status(), await textResponse.text()).toBe(200);
    expect(textResponse.request().postDataJSON()).toMatchObject({ type: "text", quote, consent_public: true });
    const text = (await textResponse.json()).data;
    ids.push(text.id);
    expect(text).toMatchObject({ type: "text", moderation_status: "pending", published: false, landing: false, show_on_testimonials: false });
    await expect(page.getByText("Menunggu Review", { exact: true })).toBeVisible();

    await types.getByRole("tab", { name: "Testimoni Video", exact: true }).click();
    await expect(page.getByLabel("Program / Pengalaman Belajar")).toHaveValue("");
    await expect(page.getByRole("checkbox", { name: consent })).not.toBeChecked();
    await page.getByLabel("Program / Pengalaman Belajar").fill("Independent video program");
    await page.getByLabel("Judul video", { exact: true }).fill(title);
    await page.getByLabel("URL video", { exact: true }).fill("https://youtu.be/dQw4w9WgXcQ");
    await page.getByLabel("Thumbnail", { exact: true }).fill(thumbnail);
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Kirim Testimoni", exact: true }).click();
    expect(await own(page, "video")).toBeNull();
    await page.getByRole("checkbox", { name: consent }).check();
    const videoSave = page.waitForResponse(response => response.url().endsWith("/api/student/testimonial") && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Kirim Testimoni", exact: true }).click();
    const videoResponse = await videoSave;
    expect(videoResponse.status(), await videoResponse.text()).toBe(200);
    expect(videoResponse.request().postDataJSON()).toMatchObject({ type: "video", title, video_thumbnail: thumbnail, consent_public: true });
    const video = (await videoResponse.json()).data;
    ids.push(video.id);
    expect(video).toMatchObject({ type: "video", moderation_status: "pending", published: false });
    expect(video.id).not.toBe(text.id);
    await types.getByRole("tab", { name: "Testimoni Tertulis", exact: true }).click();
    await expect(page.getByLabel("Ceritakan Pengalamanmu")).toHaveValue(quote);
    await page.reload();
    await expect(page.getByLabel("Ceritakan Pengalamanmu")).toHaveValue(quote);
    await types.getByRole("tab", { name: "Testimoni Video", exact: true }).click();
    await expect(page.getByLabel("Judul video", { exact: true })).toHaveValue(title);
    for (const route of ["/", "/testimoni"] as const) await publicVisibility(guest, quote, title, false, false, route);

    await admin.goto("/admin/testimoni");
    for (const [type, fixture] of [["Testimoni Biasa", text], ["Testimoni Video", video]] as const) {
      await admin.getByRole("tab", { name: type, exact: true }).click();
      const row = admin.getByRole("row").filter({ hasText: fixture.context });
      const approval = admin.waitForResponse(response => response.url().endsWith(`/api/admin/testimonials/${fixture.id}`) && response.request().method() === "PATCH");
      await row.getByRole("button", { name: "Setujui", exact: true }).click();
      const response = await approval;
      expect(response.status(), await response.text()).toBe(200);
      expect((await response.json()).data).toMatchObject({ moderation_status: "approved", published: true, landing: true, show_on_testimonials: true });
    }
    for (const route of ["/", "/testimoni"] as const) await publicVisibility(guest, quote, title, true, true, route);
    await page.reload();
    await types.getByRole("tab", { name: "Testimoni Video", exact: true }).click();
    await expect(page.getByLabel("Judul video", { exact: true })).toHaveAttribute("readonly", "");
    await expect(page.getByRole("button", { name: "Perbarui Testimoni", exact: true })).toHaveCount(0);
    await types.getByRole("tab", { name: "Testimoni Tertulis", exact: true }).click();
    await expect(page.getByLabel("Ceritakan Pengalamanmu")).toHaveAttribute("readonly", "");

    // Toggle channel through Admin UI; adapter must send snake-case Student patch.
    const row = admin.getByRole("row").filter({ hasText: video.context });
    await row.getByRole("button", { name: "Edit testimoni Browser student", exact: true }).click();
    const dialog = admin.getByRole("dialog");
    await dialog.locator("label", { hasText: "Halaman Testimoni" }).locator("select").selectOption("no");
    const channelSave = admin.waitForResponse(response => response.url().endsWith(`/api/admin/testimonials/${video.id}`) && response.request().method() === "PATCH");
    await dialog.getByRole("button", { name: "Simpan Testimoni", exact: true }).click();
    const channelResponse = await channelSave;
    expect(channelResponse.status(), await channelResponse.text()).toBe(200);
    expect((await channelResponse.json()).data).toMatchObject({ published: true, landing: true, show_on_testimonials: false });
    await publicVisibility(guest, quote, title, true, true, "/");
    await publicVisibility(guest, quote, title, true, false, "/testimoni");
    expect(await patch(admin, video.id, { landing: false, show_on_testimonials: true })).toMatchObject({ landing: false, show_on_testimonials: true });
    await publicVisibility(guest, quote, title, true, false, "/");
    await publicVisibility(guest, quote, title, true, true, "/testimoni");
    await patch(admin, video.id, { published: false, landing: false, show_on_testimonials: false });
    for (let repeat = 0; repeat < 2; repeat++) {
      expect(await patch(admin, video.id, { moderation_status: "approved" })).toMatchObject({ moderation_status: "approved", published: false, landing: false, show_on_testimonials: false });
    }
    for (const route of ["/", "/testimoni"] as const) await publicVisibility(guest, quote, title, true, false, route);

    await admin.reload();
    await admin.getByRole("tab", { name: "Testimoni Video", exact: true }).click();
    await admin.getByRole("row").filter({ hasText: video.context }).getByRole("button", { name: "Hapus testimoni Browser student (Video)", exact: true }).click();
    const deletion = admin.waitForResponse(response => response.url().endsWith(`/api/admin/testimonials/${video.id}`) && response.request().method() === "DELETE");
    await admin.getByRole("dialog").getByRole("button", { name: "Hapus Testimoni", exact: true }).click();
    expect((await deletion).status()).toBe(204);
    ids.splice(ids.indexOf(video.id), 1);
    expect(await own(page, "video")).toBeNull();
    expect(await own(page, "text")).toMatchObject({ id: text.id, quote, moderation_status: "approved" });
    for (const route of ["/", "/testimoni"] as const) await publicVisibility(guest, quote, title, true, false, route);
  } finally {
    const admin = adminContext.pages()[0];
    if (admin) for (const id of ids) expect((await admin.request.delete(`${api}/api/admin/testimonials/${id}`, { headers: await headers(admin) })).status()).toBe(204);
    await adminContext.close();
    await guestContext.close();
  }
});

for (const width of [390, 768, 1440]) {
  test(`real public provider cards: lazy playback, fallback and keyboard at ${width}px`, async ({ page }) => {
    test.setTimeout(300000);
    await page.setViewportSize({ width, height: 900 });
    const requested = await externalOnly(page.context());
    await login(page, "admin");
    const fixturesByWidth: Record<number, Array<{ title: string; url: string; kind: string }>> = {
      390: [
        { title: `Native ${width}`, url: "https://testimonials.example.test/playable.mp4", kind: "native" },
        { title: `Broken ${width}`, url: "https://testimonials.example.test/broken.mp4", kind: "broken" },
      ],
      768: [
        { title: `YouTube ${width}`, url: "https://youtu.be/dQw4w9WgXcQ", kind: "youtube" },
        { title: `Drive ${width}`, url: "https://drive.google.com/file/d/browserfixture123/view", kind: "drive" },
      ],
      1440: [
        { title: `Instagram ${width}`, url: "https://www.instagram.com/reel/browserfixture123/", kind: "instagram" },
        { title: `Native ${width}`, url: "https://testimonials.example.test/playable.mp4", kind: "native" },
      ],
    };
    const fixtures = fixturesByWidth[width];
    const ids: number[] = [];
    try {
      for (const fixture of fixtures) {
        const response = await page.request.post(`${api}/api/admin/testimonials`, {
          headers: await headers(page),
          data: { type: "video", title: fixture.title, name: fixture.title, context: "Provider regression fixture", quote: "Offline provider browser coverage.", video_url: fixture.url, video_title: fixture.title, video_thumbnail: thumbnail, published: true, landing: true, show_on_testimonials: true, sort_order: 1 },
        });
        expect(response.status(), await response.text()).toBe(201);
        const data = (await response.json()).data;
        ids.push(data.id);
        expect(data).toMatchObject({ type: "video", video_thumbnail: thumbnail, show_on_testimonials: true });
      }
      for (const route of ["/", "/testimoni"]) {
        requested.length = 0;
        const content = page.waitForResponse(response => new URL(response.url()).pathname === "/api/testimonials");
        await page.goto(route);
        expect((await content).status()).toBe(200);
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        for (const fixture of fixtures) {
          const card = page.getByRole("article").filter({ has: page.getByText(fixture.title, { exact: true }).first() });
          await expect(card).toBeVisible();
          await expect(card.locator("video, iframe")).toHaveCount(0);
          const link = card.getByRole("link");
          await expect(link).toHaveAttribute("target", "_blank");
          await expect(link).toHaveAttribute("rel", /noopener/);
          if (fixture.kind === "instagram") {
            await expect(link).toHaveAccessibleName("Tonton di Instagram");
            await expect(link).toHaveAttribute("href", fixture.url);
            await expect(card.getByRole("button")).toHaveCount(0);
            continue;
          }
          expect(requested.some(url => url === fixture.url || url.includes("youtube-nocookie.com") || url.includes("drive.google.com"))).toBe(false);
          const play = card.getByRole("button", { name: `Putar ${fixture.title}`, exact: true });
          await play.scrollIntoViewIfNeeded();
          await play.focus();
          await expect(play).toBeFocused();
          expect(await play.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
          const box = await play.boundingBox();
          expect(box!.width).toBeGreaterThanOrEqual(44);
          expect(box!.height).toBeGreaterThanOrEqual(44);
          await page.keyboard.press("Enter");
          if (fixture.kind === "broken") {
            await expect(card.getByRole("status")).toHaveText("Video tidak dapat diputar.");
            await expect(link).toHaveAttribute("href", fixture.url);
            await expect(card.locator("video")).toHaveCount(0);
          } else if (fixture.kind === "native") {
            const video = card.locator("video");
            await expect(video).toHaveAttribute("src", fixture.url);
            await expect(video).toHaveAttribute("controls", "");
            await video.evaluate(async (element: HTMLVideoElement) => { element.muted = true; await element.play(); });
            await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState >= 2 && !element.paused && element.currentTime > 0)).toBe(true);
            await video.evaluate((element: HTMLVideoElement) => element.pause());
          } else {
            const iframe = card.locator("iframe");
            await expect(iframe).toHaveAttribute("title", fixture.title);
            await expect(iframe).toHaveAttribute("src", fixture.kind === "youtube" ? "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" : "https://drive.google.com/file/d/browserfixture123/preview");
            await expect(iframe).toHaveAttribute("sandbox", "allow-scripts allow-same-origin allow-presentation");
            await expect(iframe).toHaveAttribute("referrerpolicy", "strict-origin-when-cross-origin");
            await expect.poll(() => requested.some(url => url.includes(fixture.kind === "youtube" ? "youtube-nocookie.com/embed/" : "drive.google.com/file/d/"))).toBe(true);
          }
          // Already played providers must not affect next card's lazy assertion.
          requested.length = 0;
        }
        expect(requested.some(url => new URL(url).hostname.includes("instagram"))).toBe(false);
      }
    } finally {
      for (const id of ids) expect((await page.request.delete(`${api}/api/admin/testimonials/${id}`, { headers: await headers(page) })).status()).toBe(204);
    }
  });
}
