import { expect, test } from "@playwright/test";

const student = { id: 901, name: "Sakura Tanaka", email: "sakura@example.test", whatsapp: "081234567890", role: "student" };

test("current student identity replaces fixtures without changing membership", async ({ page }) => {
  await page.route("**/api/me", (route) => route.fulfill({ json: { data: student } }));
  await page.goto("/dashboard?membership=lms");
  await expect(page.getByRole("heading", { name: /Halo, Sakura Tanaka/ })).toBeVisible();
  await expect(page.locator(".dash-avatar")).toHaveText("ST");
  await expect(page.getByText("Sakura Tanaka (Kamu)", { exact: true })).toBeVisible();
  await page.goto("/profile?membership=lms");
  await expect(page.getByRole("heading", { name: student.name, exact: true })).toBeVisible();
  await expect(page.getByText(student.email, { exact: true })).toBeVisible();
  await expect(page.locator(".profile-identity > span")).toHaveText("ST");
  await expect(page.getByText("Akses aktif hingga 31 Desember 2026. Seluruh progres belajar tersimpan.")).toBeVisible();
  await page.goto("/certificate?membership=lms");
  await expect(page.getByText("Sakura Tanaka • Program JLPT N5", { exact: true })).toBeVisible();
});

for (const mobile of [false, true]) {
  test(`student logout ${mobile ? "mobile" : "desktop"} posts once and redirects`, async ({ page, context }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    let loggedOut = false;
    let requests = 0;
    await context.addCookies([{ name: "XSRF-TOKEN", value: "test-token", url: "http://localhost:3000" }]);
    await page.route("**/api/me", (route) => route.fulfill(loggedOut ? { status: 401, json: {} } : { json: { data: student } }));
    await page.route("**/sanctum/csrf-cookie", (route) => route.fulfill({ status: 204 }));
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    await page.route("**/api/auth/logout", async (route) => {
      requests += 1;
      expect(route.request().method()).toBe("POST");
      await pending;
      loggedOut = true;
      await route.fulfill({ status: 204 });
    });
    await page.goto("/dashboard?membership=free");
    if (mobile) await page.getByRole("button", { name: "Buka navigasi", exact: true }).click();
    await page.getByRole("button", { name: "Keluar", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Memuat...");
    finish();
    await expect(page).toHaveURL(/\/login$/);
    expect(requests).toBe(1);
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/login$/);
  });
}

test("logout failure shows provider error without claiming success", async ({ page, context }) => {
  await context.addCookies([{ name: "XSRF-TOKEN", value: "test-token", url: "http://localhost:3000" }]);
  await page.route("**/api/me", (route) => route.fulfill({ json: { data: student } }));
  await page.route("**/sanctum/csrf-cookie", (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/auth/logout", (route) => route.fulfill({ status: 500, json: {} }));
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Keluar", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Permintaan belum berhasil. Silakan coba lagi." })).toContainText("Permintaan belum berhasil. Silakan coba lagi.");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("button", { name: "Coba Lagi", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Halo, Sakura Tanaka/ })).toBeVisible();
});

test("admin profile reads identity without local profile writes or shell changes", async ({ page }) => {
  await page.route("**/api/me", (route) => route.fulfill({ json: { data: { ...student, role: "admin" } } }));
  await page.goto("/admin/pengaturan-integrasi?tab=Profil%20Admin");
  await expect(page.getByLabel("Nama tampilan", { exact: true })).toHaveValue(student.name);
  await expect(page.getByLabel("Nama tampilan", { exact: true })).not.toBeEditable();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(student.email);
  await expect(page.getByLabel("Email", { exact: true })).not.toBeEditable();
  await expect(page.getByLabel("URL avatar", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("URL avatar", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Simpan Profil Admin", exact: true })).toBeDisabled();
  await expect(page.getByText("Admin Console", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Pratinjau frontend", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Keluar", exact: true })).toHaveCount(0);
});
