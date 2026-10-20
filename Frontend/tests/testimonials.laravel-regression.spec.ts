import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const api = "http://localhost:8001";

async function login(page: Page, role: "admin" | "student") {
  await page.goto("/login");
  await page.getByLabel("Email / WhatsApp").fill(`browser.${role}@example.test`);
  await page.getByLabel("Kata Sandi", { exact: true }).fill("BrowserTesting123!");
  const response = page.waitForResponse(res => res.url().endsWith("/api/auth/login") && res.request().method() === "POST");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page).toHaveURL(role === "admin" ? /\/admin$/ : /\/dashboard\?membership=free$/);
}

async function headers(page: Page) {
  expect((await page.request.get(`${api}/sanctum/csrf-cookie`)).status()).toBe(204);
  const cookie = (await page.context().cookies(api)).find(item => item.name === "XSRF-TOKEN");
  expect(cookie).toBeDefined();
  return { Accept: "application/json", Origin: "http://localhost:3020", "X-XSRF-TOKEN": decodeURIComponent(cookie!.value) };
}

async function assertAvatar(page: Page, src: string) {
  const images = page.locator('img[alt="Foto profil Browser student"]');
  await expect(images.first()).toBeVisible();
  for (const image of await images.all()) {
    await expect(image).toHaveAttribute("src", src);
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  }
}

test("focused testimonials: approved visible, pending hidden, uploaded video plays on both public pages", async ({ browser, page }) => {
  test.setTimeout(120000);
  await login(page, "student");
  const adminContext = await browser.newContext();
  let media: { path: string; url: string } | null = null;
  let created: { id: number; moderation_status: string } | null = null;
  let pending: { id: number; moderation_status: string } | null = null;
  let admin: Page | null = null;
  try {
    admin = await adminContext.newPage();
    const authenticated = await admin.request.post(`${api}/api/auth/login`, {
      headers: await headers(admin),
      data: { identity: "browser.admin@example.test", password: "BrowserTesting123!" },
    });
    expect(authenticated.status(), await authenticated.text()).toBe(200);
    const existing = await page.request.get(`${api}/api/student/testimonial?type=text`, { headers: { Accept: "application/json" } });
    if (existing.status() === 200 && (await existing.json()).data) {
      await admin.request.delete(`${api}/api/admin/testimonials/${(await existing.json()).data.id}`, { headers: await headers(admin) });
    }

    const pendingQuote = "Pending regression testimonial must remain private before approval.";
    const pendingResponse = await page.request.put(`${api}/api/student/testimonial`, {
      headers: await headers(page),
      data: { type: "text", context: "Focused pending fixture", quote: pendingQuote, consent_public: true },
    });
    expect(pendingResponse.status(), await pendingResponse.text()).toBe(200);
    pending = (await pendingResponse.json()).data;
    expect(pending?.moderation_status).toBe("pending");
    const upload = await admin.request.post(`${api}/api/admin/media`, {
      headers: await headers(admin),
      multipart: { kind: "video", file: { name: "playable.mp4", mimeType: "video/mp4", buffer: await readFile(resolve("tests/fixtures/playable.mp4")) } },
    });
    expect(upload.status(), await upload.text()).toBe(201);
    media = (await upload.json()).data;
    const approvedQuote = "Approved regression testimonial is publicly visible with native video.";
    const title = "Focused uploaded testimonial video";
    const createdResponse = await admin.request.post(`${api}/api/admin/testimonials`, {
      headers: await headers(admin),
      data: { type: "video", title, name: "Focused approved student", context: "Focused approved fixture", quote: approvedQuote, video_url: media?.path, video_title: title, video_thumbnail: "https://testimonials.example.test/thumbnail.png", published: true, landing: true, show_on_testimonials: true, sort_order: 1 },
    });
    expect(createdResponse.status(), await createdResponse.text()).toBe(201);
    created = (await createdResponse.json()).data;
    expect(created?.moderation_status).toBe("approved");
    const pendingUpdate = await admin.request.patch(`${api}/api/admin/testimonials/${pending?.id}`, {
      headers: await headers(admin),
      data: { moderation_status: "pending", published: true, landing: true },
    });
    expect(pendingUpdate.status(), await pendingUpdate.text()).toBe(200);
    expect((await pendingUpdate.json()).data).toMatchObject({ moderation_status: "pending", published: false, landing: true });

    const guestContext = await browser.newContext();
    try {
      const guest = await guestContext.newPage();
      await guest.route("https://testimonials.example.test/**", route => route.fulfill({ path: resolve("tests/fixtures/sample.png"), contentType: "image/png" }));
      for (const path of ["/", "/testimoni"]) {
        const contentResponse = guest.waitForResponse(res => new URL(res.url()).pathname === "/api/testimonials");
        await guest.goto(path);
        const response = await contentResponse;
        expect(response.status()).toBe(200);
        const content = (await response.json()).data;
        expect(content.some((item: { quote: string }) => item.quote === approvedQuote)).toBe(true);
        expect(content.some((item: { id: number }) => item.id === pending?.id)).toBe(false);
        await expect(guest.getByText(approvedQuote, { exact: true })).toBeVisible();
        await expect(guest.getByText(pendingQuote, { exact: true })).toHaveCount(0);
        await expect(guest.locator("video")).toHaveCount(0);
        await guest.getByRole("button", { name: `Putar ${title}`, exact: true }).click();
        const video = guest.getByLabel(title, { exact: true }).and(guest.locator("video"));
        await expect(video).toHaveCount(1);
        await expect(video).toHaveAttribute("aria-label", title);
        await expect(video).toHaveAttribute("src", media!.url);
        await video.scrollIntoViewIfNeeded();
        await video.evaluate(async (element: HTMLVideoElement) => {
          element.muted = true;
          await element.play();
        });
        await expect.poll(() => video.evaluate((element: HTMLVideoElement) => !element.paused && element.readyState >= 2 && element.currentTime > 0)).toBe(true);
        await video.evaluate((element: HTMLVideoElement) => element.pause());
      }
    } finally {
      await guestContext.close();
    }
  } finally {
    if (admin) {
      if (created?.id) await admin.request.delete(`${api}/api/admin/testimonials/${created.id}`, { headers: await headers(admin) });
      if (pending?.id) await admin.request.delete(`${api}/api/admin/testimonials/${pending.id}`, { headers: await headers(admin) });
      if (media?.path) await admin.request.delete(`${api}/api/admin/media`, { headers: await headers(admin), data: { path: media.path } });
    }
    await adminContext.close();
  }
});

test("focused avatar: local upload renders and persists through reload and logout/login", async ({ page }) => {
  test.setTimeout(120000);
  await login(page, "student");
  await page.goto("/profile#pengaturan");
  const uploadResponse = page.waitForResponse(res => res.url().endsWith("/api/student/profile/avatar") && res.request().method() === "POST");
  await page.getByRole("region", { name: "Foto Profil", exact: true }).getByLabel("Foto Profil", { exact: true }).setInputFiles(resolve("tests/fixtures/sample.png"));
  const response = await uploadResponse;
  expect(response.status(), await response.text()).toBe(200);
  const me = await page.request.get(`${api}/api/auth/me`, { headers: { Accept: "application/json" } });
  expect(me.status()).toBe(200);
  const user = (await me.json()).data;
  expect(user.avatar).toMatch(/^media\/image\//);
  const src = user.avatar_resolved_url;
  expect(src).toContain("/storage/media/image/");
  await assertAvatar(page, src);
  await page.reload();
  await assertAvatar(page, src);
  const logoutResponse = page.waitForResponse(res => res.url().endsWith("/api/auth/logout") && res.request().method() === "POST");
  await page.getByRole("button", { name: "Keluar", exact: true }).click();
  expect((await logoutResponse).status()).toBe(204);
  await expect(page).toHaveURL(/\/login$/);
  await login(page, "student");
  await assertAvatar(page, src);
  await page.goto("/profile#pengaturan");
  await assertAvatar(page, src);
});
