import { expect, test } from "@playwright/test";

const user = { id: 7, name: "Siswa", email: "student@example.test", whatsapp: "6281234567890", role: "student", account_status: "active" };

for (const plan of ["lms", "sensei"]) {
  test(`bare register resumes ${plan} checkout and existing invoice without registering again`, async ({ page, context }) => {
    let authenticated = false;
    let registrations = 0;
    let invoices = 0;
    const invoice = { id: 42, user_id: 7, program_id: 1, program_code: "n4", plan_code: plan, base_price: 99000, total_price: 99000, discount_amount: 0, duration_months: 3, status: "awaiting_payment", created_at: "2026-10-01T00:00:00Z" };
    await context.addCookies([{ name: "XSRF-TOKEN", value: "test", url: "http://localhost:3000" }]);
    await page.route("**/api/**", route => route.fulfill({ json: { data: [] } }));
    await page.route("**/sanctum/csrf-cookie", route => route.fulfill({ status: 204 }));
    await page.route("**/api/me", route => route.fulfill({ status: authenticated ? 200 : 401, json: authenticated ? { data: user } : {} }));
    await page.route("**/api/public/offers", route => route.fulfill({ json: { data: [{ id: 1, program_id: 1, program: { code: "n4", name: "JLPT N4" }, plan_code: plan, base_price: 99000, effective_price: 99000, duration_months: 3 }] } }));
    await page.route("**/api/auth/register", route => {
      registrations++;
      authenticated = true;
      return route.fulfill({ status: 201, json: { data: user } });
    });
    await page.route("**/api/student/dashboard", route => route.fulfill({ json: { data: { programs: [], chapters: [], access: { source_grants: [], learning: {}, replay_levels: [] } } } }));
    await page.route("**/api/student/referral-quote", route => route.fulfill({ json: { data: { total_price: 99000, available_credit: 0 } } }));
    await page.route("**/api/student/invoices", route => {
      invoices++;
      return route.fulfill({ json: { data: invoice } });
    });
    await page.route("**/api/student/invoices/42", route => route.fulfill({ json: { data: invoice } }));
    await page.goto("/program");
    await page.goto("/register");
    await page.getByLabel("Nama Lengkap", { exact: true }).fill(user.name);
    await page.getByLabel("Email", { exact: true }).fill(user.email);
    await page.getByLabel("Nomor WhatsApp", { exact: true }).fill(user.whatsapp);
    await page.getByLabel("Kata Sandi", { exact: true }).fill("password123");
    await page.getByLabel("Target Ujian").selectOption("N4");
    await page.getByLabel("Cara Belajar").selectOption(plan === "lms" ? "Belajar Mandiri" : "Belajar dengan Sensei");
    await page.getByRole("button", { name: "Buat Akun", exact: true }).click();
    await expect(page).toHaveURL(`/checkout?program=N4&plan=${plan}`);
    await page.goBack();
    await expect(page).toHaveURL(/\/program$/);
    // Public CTA uses bare /register: existing account must resume purchase, not sign up again.
    await page.goto("/register");
    await expect(page).toHaveURL(`/checkout?program=N4&plan=${plan}`);
    await page.getByRole("button", { name: "Buat Invoice", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Akun baru tetap Free");
    await page.goBack();
    await page.goto("/register");
    await expect(page).toHaveURL("/invoice?id=42");
    await expect(page.getByRole("heading", { name: "Selesaikan pembayaran" })).toBeVisible();
    expect(registrations).toBe(1);
    expect(invoices).toBe(1);
    await page.goto("/register?plan=free");
    await expect(page).toHaveURL(/\/dashboard\?membership=free$/);
  });
}
