import { expect, test } from "@playwright/test";

for (const width of [360, 1440]) {
  test(`student dropdowns persist photo and sync unread notifications at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let user = { id: 901, name: "Sakura Tanaka", email: "sakura@example.test", whatsapp: "081234567890", role: "student", avatar_resolved_url: null as string | null };
    const items = Array.from({ length: 103 }, (_, index) => ({ id: 103 - index, type: "Akun", title: `Notification ${103 - index}`, body: "Notification body", cta_label: "Lihat Profil", path: "/profile", read: false }));
    let writes = 0;
    let rejectPhoto = true;
    await page.context().addCookies([{ name: "XSRF-TOKEN", value: "test-token", url: "http://localhost:3000" }]);
    await page.route("**/sanctum/csrf-cookie", route => route.fulfill({ status: 204 }));
    await page.route("**/api/me", route => route.fulfill({ json: { data: user } }));
    await page.route("**/api/public/programs", route => route.fulfill({ json: { data: [] } }));
    await page.route("**/api/student/access", route => route.fulfill({ json: { data: { learning: { n5: "full" }, replay_levels: [], source_grants: [{ plan_code: "lms", program_code: "n5" }] } } }));
    await page.route("**/api/student/notifications", route => route.fulfill({ json: { data: items } }));
    await page.route("**/api/student/notifications/*/read", route => {
      const id = Number(route.request().url().split("/").at(-2));
      items.find(item => item.id === id)!.read = true;
      writes++;
      return route.fulfill({ json: { data: {} } });
    });
    await page.route("**/api/student/notifications/read-all", route => {
      items.forEach(item => { item.read = true; });
      writes++;
      return route.fulfill({ status: 204 });
    });
    await page.route("**/profile-fixture.png", route => route.fulfill({ path: "tests/fixtures/sample.png", contentType: "image/png" }));
    await page.route("**/api/student/profile/avatar", async route => {
      expect(route.request().method()).toBe("POST");
      expect(route.request().postData()).not.toContain("Sakura Tanaka");
      if (rejectPhoto) { await route.fulfill({ status: 422, json: {} }); return; }
      user = { ...user, avatar_resolved_url: "/profile-fixture.png" };
      await route.fulfill({ status: 204 });
    });
    await page.goto("/profile");
    const profile = page.getByRole("button", { name: "Profil akun", exact: true });
    const bell = page.getByRole("button", { name: "Notifikasi", exact: true });
    await expect(bell).toContainText("99+");
    await profile.click();
    const panel = page.getByRole("region", { name: "Profil akun", exact: true });
    await expect(panel).toContainText(user.name);
    await expect(panel).toContainText("Belajar Mandiri");
    await panel.getByRole("button", { name: "Ganti Foto Profil" }).click();
    await page.getByLabel("Ganti Foto Profil", { exact: true }).setInputFiles("tests/fixtures/sample.png");
    await expect(panel.getByRole("alert")).toContainText("Foto belum dapat digunakan.");
    await expect(profile.locator("img")).toHaveCount(0);
    rejectPhoto = false;
    await page.getByLabel("Ganti Foto Profil", { exact: true }).setInputFiles("tests/fixtures/sample.png");
    await expect(panel.getByRole("status")).toBeVisible();
    await expect(profile.locator("img")).toHaveAttribute("src", /profile-fixture\.png$/);
    await expect(page.locator(".profile-identity img")).toHaveAttribute("src", /profile-fixture\.png$/);
    await expect(page.getByLabel("Nama Lengkap", { exact: true })).toHaveValue(user.name);
    await page.keyboard.press("Escape");
    await expect(profile).toBeFocused();
    await expect(panel).toHaveCount(0);
    await profile.click();
    await page.getByRole("heading", { name: "Keamanan Akun" }).click();
    await expect(panel).toHaveCount(0);
    await bell.click();
    const notifications = page.getByRole("region", { name: "Notifikasi terbaru" });
    await expect(notifications.locator("article")).toHaveCount(5);
    await expect(notifications.locator("article").first()).toContainText("Notification 103");
    expect(writes).toBe(0);
    await notifications.getByRole("button", { name: "Tandai dibaca" }).first().click();
    await expect(page.getByLabel("102 notifikasi belum dibaca", { exact: true })).toBeVisible();
    await notifications.getByRole("link", { name: "Lihat Semua Notifikasi" }).click();
    await expect(page).toHaveURL(/\/notifikasi$/);
    await expect(page.locator(".notification-group article").first()).not.toHaveClass(/unread/);
    expect(await page.locator(".notification-page>header").evaluate(element => getComputedStyle(element).textAlign)).toBe("left");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Tandai semua dibaca" }).click();
    await expect(bell.getByLabel(/notifikasi belum dibaca/)).toHaveCount(0);
    await page.reload();
    await expect(profile.locator("img")).toHaveAttribute("src", /profile-fixture\.png$/);
    await expect(profile).toContainText(width < 640 ? "" : user.name);
    await page.route("**/api/auth/logout", route => route.fulfill({ status: 204 }));
    await page.route("**/api/auth/login", route => {
      user = { ...user, id: 902, name: "Second Student", avatar_resolved_url: null };
      items.splice(0);
      return route.fulfill({ json: { data: user } });
    });
    if (width < 640) {
      // Dev overlay overlaps mobile navigation trigger; keyboard exercises real control.
      await page.getByRole("button", { name: "Buka navigasi" }).focus();
      await page.keyboard.press("Enter");
    }
    await page.getByRole("button", { name: "Keluar", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("Email / WhatsApp").fill("second@example.test");
    await page.getByLabel("Kata Sandi", { exact: true }).fill("password123");
    await page.getByRole("button", { name: "Masuk", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto("/notifikasi");
    await profile.click();
    await expect(panel).toContainText("Second Student");
    await expect(panel).not.toContainText("Sakura Tanaka");
    await expect(profile.locator("img")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await bell.click();
    await expect(notifications).toContainText("Belum ada notifikasi");
    await expect(notifications.locator("article")).toHaveCount(0);
  });
}
