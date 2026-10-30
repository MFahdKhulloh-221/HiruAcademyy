import { expect, test } from "@playwright/test";

test("registration distinguishes duplicate WhatsApp, keeps inputs, and permits new number", async ({ page }) => {
  await page.route("**/api/me", route => route.fulfill({ status: 401, json: {} }));
  await page.route("**/api/public/**", route => route.fulfill({ json: { data: [] } }));
  await page.context().addCookies([{ name: "XSRF-TOKEN", value: "test-token", url: "http://localhost:3000" }]);
  await page.route("**/sanctum/csrf-cookie", route => route.fulfill({ status: 204 }));
  let attempt = 0;
  await page.route("**/api/auth/register", async route => {
    attempt++;
    if (attempt === 1) await route.fulfill({ status: 422, json: { errors: { whatsapp: ["Nomor WhatsApp sudah digunakan. Silakan gunakan nomor lain."] } } });
    else if (attempt === 2) await route.fulfill({ status: 422, json: { errors: { whatsapp: ["Invalid phone format."] } } });
    else if (attempt === 3) await route.fulfill({ status: 500, json: { message: 'SQLSTATE[42P01]: Undefined table: affiliate_settings' } });
    else await route.fulfill({ json: { data: { id: 991, role: "student", name: "Nama Asli", email: "student@example.test", whatsapp: "628987654321" } } });
  });
  await page.goto("/register");
  await page.getByLabel("Nama Lengkap", { exact: true }).fill("Nama Asli");
  await page.getByLabel("Email", { exact: true }).fill("student@example.test");
  await page.getByLabel("Nomor WhatsApp", { exact: true }).fill("08123456789");
  await page.getByLabel("Kata Sandi", { exact: true }).fill("valid-password");
  const submit = page.locator('button[type="submit"]');
  await submit.click();
  await expect(page.locator("#register-whatsapp-error")).toHaveText("Nomor WhatsApp sudah digunakan. Silakan gunakan nomor lain.");
  await expect(page.getByLabel("Nama Lengkap", { exact: true })).toHaveValue("Nama Asli");
  await expect(page.getByLabel("Nomor WhatsApp", { exact: true })).toHaveValue("08123456789");
  await page.getByLabel("Nomor WhatsApp", { exact: true }).fill("wrong-number");
  await submit.click();
  await expect(page.locator("#register-whatsapp-error")).toHaveText("Periksa nomor WhatsApp.");
  await page.getByLabel("Nomor WhatsApp", { exact: true }).fill("08987654321");
  await submit.click();
  await expect(page.getByText("Pendaftaran belum berhasil karena gangguan sistem. Silakan coba lagi nanti.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Nama Lengkap", { exact: true })).toHaveValue("Nama Asli");
  await expect(page.getByText(/SQLSTATE|affiliate_settings/)).toHaveCount(0);
  await submit.click();
  await expect(page).toHaveURL(/\/dashboard/);
  expect(attempt).toBe(4);
});
