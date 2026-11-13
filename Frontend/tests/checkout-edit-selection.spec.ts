import { expect, test } from "@playwright/test";

test("checkout selection keeps account fields, changes purchase without signup, and resumes new intent", async ({ page, context }) => {
  const user = { id: 7, name: "Siswa Checkout", email: "student@example.test", whatsapp: "6281234567890", target_jlpt: "N3", role: "student", account_status: "active" };
  let registrations = 0;
  let profileWrites = 0;
  let invoices = 0;
  let releaseInvoice: () => void = () => {};
  const invoiceResponse = new Promise<void>(resolve => { releaseInvoice = resolve; });
  await context.addCookies([{ name: "XSRF-TOKEN", value: "test", url: "http://localhost:3000" }]);
  await page.route("**/api/**", route => route.fulfill({ json: { data: [] } }));
  await page.route("**/api/me", route => {
    if (route.request().method() !== "GET") profileWrites++;
    return route.fulfill({ json: { data: user } });
  });
  await page.route("**/api/auth/register", route => { registrations++; return route.fulfill({ status: 409 }); });
  await page.route("**/api/public/offers", route => route.fulfill({ json: { data: [
    { id: 1, program_id: 1, program: { code: "n4", name: "JLPT N4" }, plan_code: "lms", base_price: 99000, effective_price: 99000, duration_months: 3 },
    { id: 2, program_id: 2, program: { code: "n5", name: "JLPT N5" }, plan_code: "sensei", base_price: 199000, effective_price: 199000, duration_months: 3 },
  ] } }));
  await page.route("**/api/student/referral-quote", route => route.fulfill({ json: { data: { total_price: 199000, available_credit: 0 } } }));
  await page.route("**/api/student/affiliate/validate", route => route.fulfill({ json: { data: { valid: true } } }));
  await page.route("**/api/student/invoices", async route => {
    if (route.request().method() !== "POST") return route.fulfill({ json: { data: [] } });
    invoices++;
    expect(route.request().postDataJSON().program_offer_id).toBe(2);
    await invoiceResponse;
    await route.fulfill({ json: { data: { id: 42, program_id: 2, program_code: "n5", plan_code: "sensei", base_price: 199000, total_price: 199000, duration_months: 3, status: "awaiting_payment" } } });
  });
  await page.goto("/checkout?program=N4&plan=lms&referral=FRIEND");
  await page.getByRole("link", { name: "Kembali ke Pilihan Belajar" }).click();
  await expect(page).toHaveURL(/\/register\?.*edit=selection/);
  for (const [label, value] of [["Nama Lengkap", user.name], ["Email", user.email], ["Nomor WhatsApp", user.whatsapp]]) {
    const input = page.getByLabel(label, { exact: true });
    await expect(input).toHaveValue(value);
    await expect(input).toHaveAttribute("readonly", "");
  }
  await expect(page.getByText("Akun Anda sudah terdaftar.", { exact: false })).toBeVisible();
  await expect(page.locator('input[name="password"]')).toHaveCount(0);
  await expect(page.getByLabel("Target Ujian")).toHaveValue("N3");
  await expect(page.getByLabel("Target Ujian")).toBeDisabled();
  await expect(page.getByLabel("Cara Belajar")).toHaveValue("Belajar Mandiri");
  await expect(page.getByLabel("Program", { exact: true })).toHaveValue("N4");
  await expect(page.getByLabel("Kode Referral (Opsional)")).toHaveValue("FRIEND");
  await page.getByLabel("Cara Belajar").selectOption("Belajar dengan Sensei");
  await page.getByLabel("Program", { exact: true }).selectOption("N5");
  await page.getByRole("button", { name: "Lanjut ke Checkout" }).click();
  await expect(page).toHaveURL("/checkout?program=N5&plan=sensei&referral=FRIEND");
  expect(registrations).toBe(0);
  expect(profileWrites).toBe(0);
  expect(invoices).toBe(0);
  await page.goto("/register");
  await expect(page).toHaveURL("/checkout?program=N5&plan=sensei&referral=FRIEND");
  await page.getByRole("button", { name: "Buat Invoice", exact: true }).click();
  await expect(page.getByRole("button", { name: "Memproses...", exact: true })).toBeDisabled();
  await expect(page.getByRole("link", { name: "Kembali ke Pilihan Belajar" })).toHaveCount(0);
  releaseInvoice();
  await expect(page.getByRole("dialog")).toContainText("Invoice berhasil dibuat");
  await expect(page.getByRole("link", { name: "Kembali ke Pilihan Belajar" })).toHaveCount(0);
  expect(invoices).toBe(1);
  expect(registrations).toBe(0);
  expect(profileWrites).toBe(0);
});
