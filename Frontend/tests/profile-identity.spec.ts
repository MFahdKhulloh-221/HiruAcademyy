import { expect, test, type Page } from "@playwright/test";

const student = { id: 901, name: "Sakura Tanaka", email: "sakura@example.test", whatsapp: "081234567890", role: "student", avatar_resolved_url: null as string | null };

async function catalog(page: Page) {
  await page.route("**/api/public/programs", route => route.fulfill({ json: { data: [] } }));
  await page.route("**/api/student/access", route => route.fulfill({ json: { data: { learning: { n5: "full" }, replay_levels: [], source_grants: [{ plan_code: "lms", program_code: "n5" }] } } }));
  await page.route("**/api/student/notifications", route => route.fulfill({ json: { data: [] } }));
  await page.route("**/api/student/testimonial", route => route.fulfill({ json: { data: null } }));
  await page.route("**/sanctum/csrf-cookie", route => route.fulfill({ status: 204 }));
}

test("profile avatar refresh keeps draft, busy state and feedback; testimonial shares identity", async ({ page }) => {
  await catalog(page);
  await page.context().addCookies([{ name: "XSRF-TOKEN", value: "test-token", url: "http://localhost:3000" }]);
  await page.route("**/profile-fixture.png", route => route.fulfill({ path: "tests/fixtures/sample.png", contentType: "image/png" }));
  let user = { ...student };
  let finish: (() => void) | undefined;
  let refreshStarted = false;
  let expired = false;
  await page.route("**/api/me", async route => {
    if (finish) {
      refreshStarted = true;
      await new Promise<void>(resolve => { finish = resolve; });
    }
    await route.fulfill(expired ? { status: 401, json: {} } : { json: { data: user } });
  });
  await page.route("**/api/student/profile/avatar", async route => {
    user = { ...user, avatar_resolved_url: route.request().method() === "POST" ? "/profile-fixture.png" : null };
    await route.fulfill({ status: 204 });
  });
  await page.goto("/profile?membership=lms#pengaturan");
  await page.getByLabel("Nama Lengkap", { exact: true }).fill("Unsaved draft");
  const draft = await page.getByLabel("Nama Lengkap", { exact: true }).elementHandle();
  finish = () => undefined;
  await page.locator("#profile-photo").setInputFiles("tests/fixtures/sample.png");
  await expect.poll(() => refreshStarted).toBe(true);
  await expect(page.getByRole("button", { name: "Mengunggah..." })).toHaveCount(1);
  await expect(page.getByLabel("Nama Lengkap", { exact: true })).toHaveValue("Unsaved draft");
  expect(await draft!.evaluate(element => element.isConnected)).toBe(true);
  const release = finish;
  finish = undefined;
  release();
  await expect(page.getByRole("status").filter({ hasText: "Foto profil berhasil diperbarui." })).toBeVisible();
  await expect(page.locator(".profile-identity img")).toHaveAttribute("src", /\/profile-fixture\.png$/);
  await page.goto("/profile/testimoni?membership=free");
  await expect(page.locator(".testimonial-avatar img, img.testimonial-avatar")).toHaveAttribute("src", /\/profile-fixture\.png$/);
  await expect(page.getByRole("link", { name: "Kelola foto di Profil Saya", exact: true })).toHaveAttribute("href", "/profile?membership=lms#pengaturan");
  await page.getByRole("link", { name: "Kelola foto di Profil Saya", exact: true }).click();
  await expect(page.locator("#pengaturan")).toBeVisible();
  await page.getByRole("button", { name: "Hapus Foto", exact: true }).last().click();
  await expect(page.locator(".profile-identity img")).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Foto profil berhasil diperbarui." })).toBeVisible();
  expired = true;
  await page.locator("#profile-photo").setInputFiles("tests/fixtures/sample.png");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator(".profile-identity")).toHaveCount(0);
});

for (const width of [390, 768, 1280]) {
  test(`shared identity fits ${width}px with long name/email`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await catalog(page);
    const user = { ...student, name: "Sakura".repeat(20), email: `${"student".repeat(20)}@example.test` };
    await page.route("**/api/me", route => route.fulfill({ json: { data: user } }));
    for (const path of ["/profile/testimoni", "/profile"]) {
      await page.goto(path);
      if (path === "/profile/testimoni") {
        await expect(page.getByText(user.name, { exact: true }).first()).toBeVisible();
        await expect(page.getByRole("link", { name: "Kelola foto di Profil Saya" })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        continue;
      }
      const identity = page.locator(".profile-identity");
      await expect(identity.getByRole("heading", { name: user.name, exact: true })).toBeVisible();
      expect(await identity.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      const avatar = await identity.locator(".profile-avatar").boundingBox();
      expect(avatar!.width).toBeCloseTo(104, 0);
      expect(avatar!.height).toBeCloseTo(104, 0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });
}
