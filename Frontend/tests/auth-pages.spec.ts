import { expect, test } from "@playwright/test";

const student = { id: 1, name: "Test Student", email: "student@example.test", whatsapp: "6281234567890", role: "student", account_status: "active" };

test.beforeEach(async ({ page, context }) => {
  await context.addCookies([{ name: "XSRF-TOKEN", value: "test-csrf", url: "http://localhost:3000" }]);
  await page.route("**/sanctum/csrf-cookie", route => route.fulfill({ status: 204 }));
  await page.route("**/api/me", route => route.fulfill({ status: 401, json: {} }));
});

for (const role of ["admin", "student"] as const) {
  test(`login uses ${role} destination after real response`, async ({ page }) => {
    await page.route("**/api/auth/login", async route => {
      expect(route.request().postDataJSON()).toEqual({ identity: "student@example.test", password: "password123" });
      await route.fulfill({ json: { data: { ...student, role } } });
    });
    await page.goto("/login");
    await page.getByLabel("Email / WhatsApp").fill(student.email);
    await page.getByLabel("Kata Sandi", { exact: true }).fill("password123");
    await page.getByRole("button", { name: "Masuk", exact: true }).click();
    await expect(page).toHaveURL(role === "admin" ? /\/admin$/ : /\/dashboard\?membership=free$/);
  });
}

test("login guards pending submission and reports invalid credentials", async ({ page }) => {
  let requests = 0;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/auth/login", async route => {
    requests += 1;
    await pending;
    await route.fulfill({ status: 422, json: {} });
  });
  await page.goto("/login");
  await page.getByLabel("Email / WhatsApp").fill(student.email);
  await page.getByLabel("Kata Sandi", { exact: true }).fill("incorrect");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page.getByRole("button", { name: "Memuat..." })).toBeDisabled();
  await page.locator("form").evaluate(form => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  release();
  await expect(page.locator("form").getByRole("alert")).toHaveText("Email/WhatsApp atau kata sandi tidak sesuai.");
  expect(requests).toBe(1);
  await expect(page).toHaveURL(/\/login$/);
});

for (const plan of ["free", "lms", "sensei"]) {
  test(`register whitelists payload and preserves ${plan} redirect`, async ({ page }) => {
    await page.route("**/api/auth/register", async route => {
      expect(route.request().postDataJSON()).toEqual({ name: student.name, email: student.email, whatsapp: student.whatsapp, password: "password123", password_confirmation: "password123", target_jlpt: "N3" });
      await route.fulfill({ status: 201, json: { data: student } });
    });
    await page.goto(`/register?placement=N3&plan=${plan}`);
    await page.getByLabel("Nama Lengkap").fill(student.name);
    await page.getByLabel("Email", { exact: true }).fill(student.email);
    await page.getByLabel("Nomor WhatsApp").fill(student.whatsapp);
    await page.getByLabel("Kata Sandi", { exact: true }).fill("password123");
    if (plan !== "free") await page.getByLabel("Kode Referral (Opsional)").fill("VISUAL-ONLY");
    await page.getByRole("button", { name: "Buat Akun", exact: true }).click();
    await expect(page).toHaveURL(plan === "free" ? /\/dashboard\?membership=free$/ : new RegExp(`/checkout\\?level=n3&plan=${plan}$`));
  });
}

test("forgot handles failure, real success and resend without fake reset link", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/auth/forgot-password", async route => {
    expect(route.request().postDataJSON()).toEqual({ email: student.email });
    requests += 1;
    await route.fulfill({ status: requests === 1 ? 429 : 200, json: {} });
  });
  await page.goto("/forgot-password");
  await page.getByLabel("Email", { exact: true }).fill(student.email);
  await page.getByRole("button", { name: "Kirim Tautan Reset", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("Terlalu banyak percobaan");
  await expect(page.getByRole("heading", { name: "Tautan pemulihan sudah dikirim" })).toHaveCount(0);
  await page.getByRole("button", { name: "Kirim Tautan Reset", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tautan pemulihan sudah dikirim" })).toBeVisible();
  await expect(page.locator('a[href*="reset-password"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Kirim Ulang", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill(student.email);
  await page.getByRole("button", { name: "Kirim Tautan Reset", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tautan pemulihan sudah dikirim" })).toBeVisible();
  expect(requests).toBe(3);
});

test("reset requires URL credentials and matching passwords, redirects only on success", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/auth/reset-password", async route => {
    requests += 1;
    expect(route.request().postDataJSON()).toEqual({ email: student.email, token: "test-reset-token", password: "password123", password_confirmation: "password123" });
    await route.fulfill({ status: requests === 1 ? 500 : 200, json: {} });
  });
  await page.goto("/reset-password");
  await expect(page.getByRole("heading", { name: "Tautan reset sudah tidak berlaku" })).toBeVisible();
  expect(requests).toBe(0);
  await page.goto(`/reset-password?email=${encodeURIComponent(student.email)}&token=test-reset-token`);
  await page.getByLabel("Kata Sandi Baru", { exact: true }).fill("password123");
  await page.getByLabel("Konfirmasi Kata Sandi", { exact: true }).fill("different123");
  await page.getByRole("button", { name: "Simpan Kata Sandi" }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText("Konfirmasi kata sandi tidak sama.");
  expect(requests).toBe(0);
  await page.getByLabel("Konfirmasi Kata Sandi", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Simpan Kata Sandi" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("Permintaan belum berhasil");
  await page.getByRole("button", { name: "Simpan Kata Sandi" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("reset rejects expired token response", async ({ page }) => {
  await page.route("**/api/auth/reset-password", route => route.fulfill({ status: 422, json: {} }));
  await page.goto(`/reset-password?email=${encodeURIComponent(student.email)}&token=expired-test-token`);
  await page.getByLabel("Kata Sandi Baru", { exact: true }).fill("password123");
  await page.getByLabel("Konfirmasi Kata Sandi", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Simpan Kata Sandi" }).click();
  await expect(page.getByRole("heading", { name: "Tautan reset sudah tidak berlaku" })).toBeVisible();
});
