import { expect, test } from "@playwright/test";

test("referral from registration applies automatically before invoice creation", async ({ page }) => {
  let validations = 0;
  let invoicePayload: Record<string, unknown> | null = null;
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const reply = (data: unknown) => route.fulfill({ json: { data } });
    if (path === "/api/me") return reply({ id: 7, role: "student", name: "Siswa", email: "student@example.test", whatsapp: "6281234567890", account_status: "active" });
    if (path === "/api/public/offers") return reply([{ id: 1, program_id: 1, program: { code: "N4", name: "JLPT N4", slug: "n4" }, plan_code: "lms", base_price: 99000, effective_price: 99000, duration_months: 3 }]);
    if (path === "/api/student/affiliate/validate") { validations++; return reply({ valid: true }); }
    if (path === "/api/student/referral-quote") return reply({ total_price: 89000, available_credit: 0, referral_discount: 10000 });
    if (path === "/api/student/invoices") {
      invoicePayload = route.request().postDataJSON();
      return route.fulfill({ status: 422, json: { message: "Test stops before persistence" } });
    }
    return reply([]);
  });
  await page.route("**/sanctum/csrf-cookie", route => route.fulfill({ status: 204, headers: { "set-cookie": "XSRF-TOKEN=test; Path=/; SameSite=Lax" } }));
  await page.goto("/checkout?program=N4&plan=lms&referral=FRIEND");
  await expect(page.getByText("Kode referral valid. Server akan memeriksa ulang saat invoice dibuat.")).toBeVisible();
  await page.getByRole("button", { name: "Buat Invoice", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(validations).toBe(1);
  expect(invoicePayload).toMatchObject({ referral_code: "FRIEND", program_offer_id: 1 });
});
