import { expect, test } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`C1 profile avatar and navigation ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.context().addCookies([{ name: "XSRF-TOKEN", value: "fixture", url: "http://localhost:3000" }]);
    let avatar: string | null = null;
    let failure = 0;
    let uploads = 0;
    let deletes = 0;
    await page.route(/\/(api\/|sanctum\/csrf-cookie)/, async route => {
      const path = new URL(route.request().url()).pathname;
      const headers = { "access-control-allow-origin": "http://localhost:3000", "access-control-allow-credentials": "true", "access-control-allow-methods": "GET, POST, DELETE, OPTIONS", "access-control-allow-headers": "accept, content-type, x-xsrf-token" };
      const reply = (data: unknown, status = 200) => route.fulfill({ status, headers, json: { data } });
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      if (path === "/api/me") return reply({ id: 901, name: "Sakura Tanaka", email: "sakura@example.test", whatsapp: "081234567890", role: "student", account_status: "active", avatar_resolved_url: avatar });
      if (path === "/api/student/dashboard") return reply({ programs: [{ id: 1, code: "n5", name: "JLPT N5", family: "jlpt" }], access: { learning: { n5: "full" }, replay_levels: [], source_grants: [{ plan_code: "lms", program_code: "n5" }] }, chapters: [] });
      if (path === "/api/student/access") return reply({ learning: { n5: "full" }, replay_levels: [], source_grants: [{ plan_code: "lms", program_code: "n5" }] });
      if (path === "/api/student/profile/avatar") {
        if (route.request().method() === "POST") uploads++; else deletes++;
        if (failure) return reply(null, failure);
        avatar = route.request().method() === "POST" ? "/profile-fixture.png" : null;
        return route.fulfill({ status: 204, headers });
      }
      return reply([]);
    });
    await page.route("**/profile-fixture.png", route => route.fulfill({ path: "tests/fixtures/sample.png", contentType: "image/png" }));
    await page.goto("/profile?membership=lms");
    await expect(page.getByRole("heading", { name: "Profil", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ganti Foto", exact: true })).toHaveCount(1);
    const navigation = width === 390 ? page.getByRole("complementary", { name: "Navigasi siswa seluler" }) : page.locator(".student-nav-desktop");
    if (width === 390) await page.getByRole("button", { name: "Buka navigasi" }).click();
    await expect(navigation.getByRole("link", { name: "Profil Saya", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(navigation.getByRole("link", { name: "Pengaturan", exact: true })).toHaveCount(0);
    await testInfo.attach(`navigation-${width}`, { body: await page.screenshot({ path: testInfo.outputPath(`navigation-${width}.png`) }), contentType: "image/png" });
    await navigation.getByRole("link", { name: "Profil Saya", exact: true }).click();
    if (width === 390) await expect(navigation).toHaveCount(0);
    await page.getByRole("button", { name: "Profil akun", exact: true }).click();
    await expect(page.getByRole("button", { name: "Ganti Foto", exact: true })).toHaveCount(1);
    await page.getByRole("link", { name: "Kelola Foto Profil" }).click();
    await expect(page).toHaveURL(/#foto-profil$/);
    const input = page.locator("#profile-photo");
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Ganti Foto", exact: true }).click();
    await (await chooser).setFiles({ name: "bad.txt", mimeType: "text/plain", buffer: Buffer.from("bad") });
    await expect(page.getByRole("alert").filter({ hasText: "format JPEG" })).toBeVisible();
    expect(uploads).toBe(0);
    for (const status of [413, 422, 503]) {
      failure = status;
      await input.setInputFiles("tests/fixtures/sample.png");
      await expect(page.locator(".profile-settings-error")).toBeVisible();
      await expect(page.getByRole("button", { name: "Ganti Foto", exact: true })).toBeEnabled();
    }
    failure = 0;
    await page.getByRole("button", { name: "Ubah Profil", exact: true }).click();
    await page.getByLabel("Nama Lengkap", { exact: true }).fill("Draft tetap ada");
    await input.setInputFiles("tests/fixtures/sample.png");
    await expect(page.locator(".profile-settings-success")).toBeVisible();
    await expect(page.locator(".profile-identity img")).toHaveAttribute("src", /profile-fixture.png$/);
    await expect(page.getByLabel("Nama Lengkap", { exact: true })).toHaveValue("Draft tetap ada");
    await page.reload();
    await expect(page.locator(".profile-identity img")).toHaveAttribute("src", /profile-fixture.png$/);
    await expect(page.getByRole("button", { name: "Hapus Foto", exact: true })).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath(`profile-${width}.png`), fullPage: true });
    await page.locator("#foto-profil").screenshot({ path: testInfo.outputPath(`avatar-${width}.png`) });
    await page.getByRole("button", { name: "Hapus Foto", exact: true }).click();
    await expect(page.locator(".profile-identity img")).toHaveCount(0);
    expect(deletes).toBe(1);
    await expect(page.locator(".profile-settings-success")).toBeVisible();
    await page.getByRole("button", { name: "Ubah Profil", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Data Pribadi", exact: true })).toHaveAttribute("aria-selected", "true");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
