import { expect, test } from "@playwright/test";
import { invoiceWhatsAppUrl } from "../src/lib/admin-whatsapp";

const invoice = { id: 42, user_id: 7, program_id: 1, program_code: "n4", plan_code: "lms" as const, base_price: 99000, discount_amount: 0, total_price: 99000, duration_months: 3, status: "draft", created_at: "2026-10-01T00:00:00Z" };
const user = { id: 7, name: "Siswa", email: "student@example.test", whatsapp: "6281234567890", role: "student", account_status: "active" };

test("invoice WhatsApp uses approved number and actual order", () => {
  const url = new URL(invoiceWhatsAppUrl(invoice));
  expect(url.origin + url.pathname).toBe("https://wa.me/6285194564214");
  expect(url.searchParams.get("text")).toContain("invoice 42, paket Belajar Mandiri, level N4");
  expect(new URL(invoiceWhatsAppUrl(invoice, user.email)).searchParams.get("text")).toContain(`email akun ${user.email}`);
  const missingProgram = new URL(invoiceWhatsAppUrl({ id: 42, plan_code: "lms" }, user.email)).searchParams.get("text");
  expect(missingProgram).toContain("invoice 42");
  expect(missingProgram).not.toMatch(/undefined|null|level/);
});

for (const lostSubmitResponse of [false, true]) {
  test(`checkout submits invoice and offers WhatsApp or dashboard; lost response ${lostSubmitResponse}`, async ({ page }) => {
    let writes = 0;
    let submits = 0;
    let status = "draft";
    await page.route("**/api/**", route => route.fulfill({ json: { data: [] } }));
    await page.route("**/api/me", route => route.fulfill({ json: { data: user } }));
    await page.route("**/api/public/offers", route => route.fulfill({ json: { data: [{ id: 1, program_id: 1, program: { code: "n4", name: "JLPT N4", slug: "n4" }, plan_code: "lms", base_price: 99000, effective_price: 99000, duration_months: 3 }] } }));
    await page.route("**/api/student/referral-quote", route => route.fulfill({ json: { data: { base_price: 99000, referral_discount: 0, credit_discount: 0, promo_discount: 0, total_price: 99000, available_credit: 0 } } }));
    await page.route("**/sanctum/csrf-cookie", route => route.fulfill({ status: 204, headers: { "set-cookie": "XSRF-TOKEN=test; Path=/; SameSite=Lax" } }));
    await page.route("**/api/student/invoices", route => {
      writes++;
      expect(route.request().postDataJSON().credit_request_key).toMatch(/^[0-9a-f-]{36}$/);
      return route.fulfill({ json: { data: { ...invoice, status } } });
    });
    await page.route("**/api/student/invoices/42", route => route.fulfill({ json: { data: { ...invoice, status } } }));
    await page.route("**/api/student/invoices/42/submit", route => {
      submits++;
      status = "awaiting_payment";
      return lostSubmitResponse ? route.abort("failed") : route.fulfill({ json: { data: { ...invoice, status } } });
    });
    await page.goto("/checkout?program=N4&plan=lms");
    await page.getByRole("button", { name: "Buat Invoice", exact: true }).click();
    await expect(page).toHaveURL(/\/checkout\?program=N4&plan=lms$/);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Invoice berhasil dibuat");
    await expect(dialog).toContainText("Menunggu Pembayaran");
    await expect(dialog).toContainText("Akun baru tetap Free");
    await expect(dialog.getByRole("link", { name: "Lanjut ke Dashboard" })).toHaveAttribute("href", "/dashboard");
    await expect(dialog.getByRole("link", { name: "Hubungi Admin via WhatsApp" })).toHaveAttribute("href", invoiceWhatsAppUrl(invoice, user.email));
    await dialog.getByRole("button", { name: "Tutup dialog" }).click();
    await page.getByRole("button", { name: "Buat Invoice", exact: true }).click();
    await expect(dialog).toBeVisible();
    expect(writes).toBe(1);
    expect(submits).toBe(1);
  });
}

test("checkout retry after reload preserves invoice request key", async ({ page }) => {
  const keys: string[] = [];
  await page.route("**/api/**", route => route.fulfill({ json: { data: [] } }));
  await page.route("**/api/me", route => route.fulfill({ json: { data: user } }));
  await page.route("**/api/public/offers", route => route.fulfill({ json: { data: [{ id: 1, program_id: 1, program: { code: "n4", name: "JLPT N4", slug: "n4" }, plan_code: "lms", base_price: 99000, effective_price: 99000, duration_months: 3 }] } }));
  await page.route("**/api/student/referral-quote", route => route.fulfill({ json: { data: { total_price: 99000, available_credit: 0 } } }));
  await page.route("**/sanctum/csrf-cookie", route => route.fulfill({ status: 204, headers: { "set-cookie": "XSRF-TOKEN=test; Path=/; SameSite=Lax" } }));
  await page.route("**/api/student/invoices", route => {
    keys.push(route.request().postDataJSON().credit_request_key);
    return route.abort("failed");
  });
  await page.goto("/checkout?program=N4&plan=lms");
  await page.getByRole("button", { name: "Buat Invoice", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Buat Invoice", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
});
