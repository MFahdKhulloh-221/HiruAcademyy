import { expect, test, type Page } from "@playwright/test";
import type { LearningAccess } from "../src/lib/learning-api";
import { dashboardFixture } from "./canonical-fixture";

async function setupStudentApiMocks(page: Page) {
  let user = { id: 901, name: "Sakura Tanaka", email: "sakura@example.test", whatsapp: "081234567890", role: "student", avatar_resolved_url: null as string | null };
  const items = Array.from({ length: 103 }, (_, index) => ({ id: 103 - index, type: "Akun", title: `Notification ${103 - index}`, body: "Notification body", cta_label: "Lihat Profil", path: "/profile", read: false }));
  const programs = ["n5", "n4", "n3"].map((code, index) => ({ id: index + 1, code, slug: code, name: `JLPT ${code.toUpperCase()}`, family: "jlpt" }));
  const chapters = [1, 2].map(number => ({ id: number, chapter_number: number, title: `Chapter ${number}`, sort_order: number, access: "full", video_lessons: [], modules: [], flashcards: [], mini_checkpoint: { exists: false } }));
  const access: LearningAccess = { learning: { n5: "full", n4: "full" }, replay_levels: ["n5", "n4"], source_grants: [{ plan_code: "sensei", program_code: "n5" }] };

  await page.context().addCookies([{ name: "XSRF-TOKEN", value: "test-token", url: "http://localhost:3000" }]);
  await page.route(/\/(api\/|sanctum\/csrf-cookie)/, async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const current = new URL(page.url());
    const membership = current.searchParams.get("membership") ?? "lms";

    if (path === "/sanctum/csrf-cookie") {
      await route.fulfill({ status: 204 });
      return;
    }
    if (path === "/api/me") {
      await route.fulfill({ json: { data: user } });
      return;
    }
    if (path === "/api/public/programs") {
      await route.fulfill({ json: { data: programs } });
      return;
    }
    if (path === "/api/student/access") {
      await route.fulfill({ json: { data: access } });
      return;
    }
    if (path === "/api/student/notifications") {
      await route.fulfill({ json: { data: items } });
      return;
    }
    if (path.endsWith("/read-all")) {
      items.forEach(item => { item.read = true; });
      await route.fulfill({ status: 204 });
      return;
    }
    if (path.includes("/notifications/") && path.endsWith("/read")) {
      const id = Number(path.split("/").at(-2));
      const found = items.find(item => item.id === id);
      if (found) found.read = true;
      await route.fulfill({ json: { data: {} } });
      return;
    }
    if (path === "/api/student/dashboard") {
      await route.fulfill({ json: { data: dashboardFixture(programs, access, () => chapters, chapter_id => ({ chapter_id, activities: {}, mini_unlocked: false })) } });
      return;
    }
    if (path.endsWith("/chapters")) {
      await route.fulfill({ json: { data: chapters } });
      return;
    }
    if (/\/chapters\/\d+$/.test(path)) {
      await route.fulfill({ json: { data: chapters[0] } });
      return;
    }
    if (path.endsWith("/progress")) {
      await route.fulfill({ json: { data: { chapter_id: 1, activities: {}, mini_unlocked: false } } });
      return;
    }
    if (path === "/api/student/affiliate") {
      await route.fulfill({ json: { data: { code: null, affiliate: null, totals: { pending: 0, approved: 0, paid: 0 } } } });
      return;
    }
    if (path === "/api/student/classes/schedule" || path === "/api/student/class-schedules") {
      await route.fulfill({ json: { data: [] } });
      return;
    }
    if (path === "/api/student/leaderboard") {
      await route.fulfill({ json: { data: { scope: "all", week_start: "2026-10-05T00:00:00+07:00", week_end: "2026-10-12T00:00:00+07:00", entries: [], self: null } } });
      return;
    }
    if (path === "/api/student/gamification") {
      await route.fulfill({ json: { data: { streak_days: 0, weekly_xp: 0, challenge: { active_days: 0, target_days: 5, total_days: 7, starts_on: "2026-10-08", ends_on: "2026-10-14", status: "active", badge: null } } } });
      return;
    }
    await route.fulfill({ json: { data: [] } });
  });
}

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

async function assertHeaderPlacement(page: Page, viewportWidth: number) {
  const burger = page.getByRole("button", { name: "Buka navigasi" });
  const bell = page.getByRole("button", { name: "Notifikasi", exact: true });
  const profile = page.getByRole("button", { name: "Profil akun", exact: true });

  await expect(bell).toBeVisible();
  await expect(profile).toBeVisible();

  const bellBox = (await bell.boundingBox())!;
  const profileBox = (await profile.boundingBox())!;
  expect(bellBox).not.toBeNull();
  expect(profileBox).not.toBeNull();

  // 44px minimum touch target
  expect(bellBox.width).toBeGreaterThanOrEqual(44);
  expect(bellBox.height).toBeGreaterThanOrEqual(44);
  expect(profileBox.width).toBeGreaterThanOrEqual(44);
  expect(profileBox.height).toBeGreaterThanOrEqual(44);

  // Bell is positioned to the left of profile
  expect(bellBox.x).toBeLessThan(profileBox.x);

  if (viewportWidth < 1024) {
    // Burger visible on far left
    await expect(burger).toBeVisible();
    const burgerBox = (await burger.boundingBox())!;
    expect(burgerBox).not.toBeNull();
    expect(burgerBox.width).toBeGreaterThanOrEqual(44);
    expect(burgerBox.height).toBeGreaterThanOrEqual(44);
    expect(burgerBox.x).toBeLessThanOrEqual(20);

    // Bell and profile are to the right of burger
    expect(bellBox.x).toBeGreaterThan(burgerBox.x + burgerBox.width);

    // Profile is near the right edge of viewport
    expect(profileBox.x + profileBox.width).toBeGreaterThan(viewportWidth - 120);
  } else {
    // Burger hidden on desktop
    await expect(burger).not.toBeVisible();
    const desktopNav = page.locator(".student-nav-desktop");
    await expect(desktopNav).toBeVisible();
    const navBox = (await desktopNav.boundingBox())!;
    expect(navBox.x).toBeLessThanOrEqual(20);

    // Actions are to the right of desktop nav and towards right edge
    expect(bellBox.x).toBeGreaterThan(navBox.x + navBox.width);
    expect(profileBox.x + profileBox.width).toBeGreaterThan(viewportWidth - 300);
  }
}

const headerRoutes = [
  "/dashboard",
  "/journey",
  "/learn/n5/chapter-1",
  "/schedule",
  "/profile",
];

for (const width of [390, 768, 1440]) {
  test(`student header positions burger left and actions right at ${width}px across routes`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await setupStudentApiMocks(page);

    for (const route of headerRoutes) {
      await page.goto(route);
      await assertHeaderPlacement(page, width);
    }
  });
}

test("student header semantic keyboard interaction and drawer / dropdown focus", async ({ page }) => {
  await setupStudentApiMocks(page);

  // Mobile viewport: test burger keyboard trigger & focus return
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/dashboard");

  const burger = page.getByRole("button", { name: "Buka navigasi" });
  await burger.focus();
  await expect(burger).toBeFocused();
  await page.keyboard.press("Enter");

  const mobileNav = page.locator("#student-mobile-panel");
  await expect(mobileNav).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(mobileNav).toHaveCount(0);
  await expect(burger).toBeFocused();

  // Desktop viewport: test bell and profile keyboard interaction
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard");

  const bell = page.getByRole("button", { name: "Notifikasi", exact: true });
  await bell.focus();
  await expect(bell).toBeFocused();
  await page.keyboard.press("Enter");

  const notifDropdown = page.getByRole("region", { name: "Notifikasi terbaru" });
  await expect(notifDropdown).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(notifDropdown).toHaveCount(0);
  await expect(bell).toBeFocused();

  const profile = page.getByRole("button", { name: "Profil akun", exact: true });
  await profile.focus();
  await expect(profile).toBeFocused();
  await page.keyboard.press("Enter");

  const profileDropdown = page.getByRole("region", { name: "Profil akun", exact: true });
  await expect(profileDropdown).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(profileDropdown).toHaveCount(0);
  await expect(profile).toBeFocused();
});

test("student header maintains layout across route navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await setupStudentApiMocks(page);

  await page.goto("/dashboard");
  await assertHeaderPlacement(page, 390);

  // Navigate using mobile drawer links
  const burger = page.getByRole("button", { name: "Buka navigasi" });
  await burger.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Kelas Saya" }).click();
  await page.getByRole("link", { name: "Perjalanan Level", exact: true }).click();
  await expect(page).toHaveURL(/\/journey/);
  await assertHeaderPlacement(page, 390);

  await page.goto("/learn/n5/chapter-1");
  await assertHeaderPlacement(page, 390);

  await burger.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Kelas Saya" }).click();
  await page.getByRole("link", { name: "Jadwal", exact: true }).click();
  await expect(page).toHaveURL(/\/schedule/);
  await assertHeaderPlacement(page, 390);

  // Navigate to profile from header actions dropdown
  const profile = page.getByRole("button", { name: "Profil akun", exact: true });
  await profile.click();
  await page.getByRole("link", { name: "Lihat Profil", exact: true }).click();
  await expect(page).toHaveURL(/\/profile/);
  await assertHeaderPlacement(page, 390);
});
