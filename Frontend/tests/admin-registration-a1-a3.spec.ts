import { expect, test } from "@playwright/test";
import { studentWhatsAppUrl } from "../src/lib/admin-whatsapp";

const duplicateEmail = "Email ini sudah terdaftar. Silakan masuk dengan akun tersebut atau gunakan email lain.";
const students = [
  { id: 7, name: "Siswa Sakura", email: "sakura@example.test", whatsapp: "0812-3456-7890", account_status: "active" },
  { id: 8, name: "Siswa Tanpa WA", email: "other@example.test", whatsapp: "invalid", account_status: "active" },
];
const invoice = { id: 42, user_id: 7, program_id: 1, program_code: "n4", plan_code: "lms", base_price: 99000, discount_amount: 0, total_price: 99000, status: "paid", created_at: "2026-10-01T00:00:00Z" };

for (const width of [390, 1440]) {
  test(`A1 A2 admin names and contact ${width}, API mock`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const writes: string[] = [];
    await page.route("**/api/**", route => {
      if (route.request().method() !== "GET") writes.push(route.request().url());
      const path = new URL(route.request().url()).pathname;
      const data = path === "/api/me" ? { id: 1, name: "Admin", email: "admin@example.test", whatsapp: "6281234567890", role: "admin", account_status: "active" }
        : path === "/api/admin/users" ? students
        : path === "/api/admin/invoices" ? [invoice, { ...invoice, id: 43, user_id: 999 }]
        : path === "/api/admin/invoices/42" ? invoice : [];
      return route.fulfill({ json: { data } });
    });
    await page.goto("/admin/invoice");
    await expect(page.getByRole("cell", { name: "Siswa Sakura", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Nama siswa tidak tersedia", exact: true })).toBeVisible();
    const search = page.getByRole("searchbox", { name: "Cari invoice" });
    for (const term of ["Sakura", "42", "N4"]) {
      await search.fill(term);
      await expect(page.getByRole("cell", { name: "Siswa Sakura", exact: true })).toBeVisible();
    }
    await search.fill("Sakura");
    await expect(page.getByRole("cell", { name: "43", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Detail", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Siswa Sakura");
    await page.getByRole("button", { name: "Tutup", exact: true }).click();
    await page.goto("/admin/pengguna-akses");
    const row = page.getByRole("row").filter({ has: page.getByRole("cell", { name: "Siswa Sakura", exact: true }) });
    await expect(row).toContainText("0812-3456-7890");
    const contact = row.getByRole("link", { name: "Hubungi via WhatsApp" });
    await expect(contact).toHaveAttribute("href", "https://wa.me/6281234567890?text=");
    await expect(contact).toHaveAttribute("target", "_blank");
    // Intercept navigation; never contact WhatsApp during test.
    await page.context().route("https://wa.me/**", route => route.fulfill({ body: "WhatsApp navigation mocked" }));
    const popup = page.waitForEvent("popup");
    await contact.click();
    const tab = await popup;
    await tab.waitForLoadState();
    expect(tab.url()).toBe("https://wa.me/6281234567890?text=");
    await tab.close();
    const invalid = page.getByRole("row").filter({ has: page.getByRole("cell", { name: "Siswa Tanpa WA", exact: true }) });
    await expect(invalid).toContainText("Belum tersedia");
    await expect(invalid.getByRole("link")).toHaveCount(0);
    expect(writes).toEqual([]);
  });
}

test("WhatsApp normalization rejects unusable input", () => {
  for (const phone of [null, "", "invalid", "https://evil.test", "123", "+081234567890"]) expect(studentWhatsAppUrl(phone)).toBeNull();
  expect(studentWhatsAppUrl("+62 812 3456 7890")).toBe("https://wa.me/6281234567890?text=");
});

test("A3 email and WhatsApp errors separate, clear on edit, new email succeeds; API mock", async ({ page }) => {
  await page.route("**/api/me", route => route.fulfill({ status: 401, json: {} }));
  await page.route("**/api/public/**", route => route.fulfill({ json: { data: [] } }));
  await page.context().addCookies([{ name: "XSRF-TOKEN", value: "test", url: "http://localhost:3000" }]);
  let attempts = 0;
  await page.route("**/api/auth/register", route => {
    attempts++;
    return attempts === 1 ? route.fulfill({ status: 422, json: { errors: { email_normalized: [duplicateEmail], whatsapp_normalized: ["Nomor WhatsApp sudah digunakan. Silakan gunakan nomor lain."] } } })
      : route.fulfill({ json: { data: { id: 9, name: "Siswa Baru", email: "new@example.test", whatsapp: "628987654321", role: "student", account_status: "active" } } });
  });
  await page.goto("/register");
  await page.getByLabel("Nama Lengkap", { exact: true }).fill("Siswa Baru");
  await page.getByLabel("Email", { exact: true }).fill("used@example.test");
  await page.getByLabel("Nomor WhatsApp", { exact: true }).fill("081234567890");
  await page.getByLabel("Kata Sandi", { exact: true }).fill("ValidPassword123!");
  await page.getByRole("button", { name: "Buat Akun", exact: true }).click();
  await expect(page.locator("#register-email-error")).toHaveText(duplicateEmail);
  await expect(page.locator("#register-whatsapp-error")).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("new@example.test");
  await expect(page.locator("#register-email-error")).toHaveCount(0);
  await expect(page.locator("#register-whatsapp-error")).toBeVisible();
  await page.getByLabel("Nomor WhatsApp", { exact: true }).fill("08987654321");
  await expect(page.locator("#register-whatsapp-error")).toHaveCount(0);
  await page.getByRole("button", { name: "Buat Akun", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  expect(attempts).toBe(2);
});
