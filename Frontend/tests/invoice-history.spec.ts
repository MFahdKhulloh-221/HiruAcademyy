import { expect, test, type Page } from "@playwright/test";

const user = { id: 7, name: "Siswa", email: "student@example.test", whatsapp: "6281234567890", role: "student", account_status: "active" };
const invoice = { id: 42, user_id: 7, program_id: 1, plan_code: "lms", base_price: 99000, discount_amount: 0, total_price: 99000, duration_months: 3, due_date: "2026-12-01", status: "draft", created_at: "2026-11-01T00:00:00Z" };
async function mockIdentity(page: Page) {
  await page.route("**/api/**", route => route.fulfill({ json: { data: [] } }));
  await page.route("**/api/me", route => route.fulfill({ json: { data: user } }));
  await page.route("**/api/student/dashboard", route => route.fulfill({ json: { data: { programs: [], access: { source_grants: [] } } } }));
  await page.route("**/api/public/programs", route => route.fulfill({ json: { data: [{ id: 1, code: "n4" }] } }));
}

test("history retries, maps API programs, opens detail and handles empty history", async ({ page }) => {
  await mockIdentity(page);
  let fail = true;
  let empty = false;
  await page.route("**/api/student/invoices", route => fail ? route.abort("failed") : route.fulfill({ json: { data: empty ? [] : [invoice] } }));
  await page.route("**/api/student/invoices/42", route => route.fulfill({ json: { data: invoice } }));
  await page.goto("/invoice");
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Coba Lagi" }).click();
  await expect(page.getByRole("main")).toContainText("N4");
  await page.getByRole("link", { name: "Lihat Invoice #42" }).click();
  await expect(page.getByRole("heading", { name: "Lanjutkan pesananmu" })).toBeVisible();
  await expect(page.getByRole("main")).toContainText("3 bulan");
  await expect(page.getByRole("main")).toContainText("1 Desember 2026");
  empty = true;
  await page.getByRole("main").getByRole("link", { name: "Pesanan Saya", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Belum ada pesanan" })).toBeVisible();
});

test("mobile history keeps statuses readable without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockIdentity(page);
  await page.route("**/api/student/invoices", route => route.fulfill({ json: { data: [{ ...invoice, status: "active" }, { ...invoice, id: 43, status: "awaiting_payment" }] } }));
  await page.goto("/invoice");
  await expect(page.getByRole("heading", { name: "Pesanan Saya", exact: true })).toBeVisible();
  await expect(page.getByText("Sudah Bayar", { exact: true })).toBeVisible();
  await expect(page.getByText("Selesai:")).toHaveCount(1);
  await expect(page.getByText("Menunggu Pembayaran", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Lihat Invoice #43" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("draft submits; WhatsApp hands off to admin; refresh reveals activation", async ({ page }) => {
  await mockIdentity(page);
  let status = "draft";
  let submissions = 0;
  let declarations = 0;
  await page.route("**/sanctum/csrf-cookie", route => route.fulfill({ status: 204, headers: { "set-cookie": "XSRF-TOKEN=test; Path=/; SameSite=Lax" } }));
  await page.route("**/api/student/invoices/42", route => route.fulfill({ json: { data: { ...invoice, status } } }));
  await page.route("**/api/student/invoices/42/submit", route => { submissions++; status = "awaiting_payment"; return route.fulfill({ json: { data: { ...invoice, status } } }); });
  await page.route("**/api/student/invoices/42/mark-paid", route => { declarations++; status = "paid"; return route.fulfill({ json: { data: { ...invoice, status } } }); });
  await page.goto("/invoice?id=42");
  await page.getByRole("button", { name: "Ajukan Invoice" }).click();
  await expect(page.getByRole("heading", { name: "Selesaikan pembayaran" })).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Saya Sudah Bayar" })).toHaveCount(0);
  const whatsapp = page.getByRole("link", { name: "Hubungi Admin via WhatsApp" });
  const whatsappUrl = new URL((await whatsapp.getAttribute("href"))!);
  expect(whatsappUrl.searchParams.get("text")).toContain(user.email);
  await expect(page.getByText("Membuka WhatsApp tidak memverifikasi pembayaran atau mengaktifkan akses.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Mulai Belajar" })).toHaveCount(0);
  expect(submissions).toBe(1);
  expect(declarations).toBe(0);
  for (const legacyStatus of ["paid", "verified"]) {
    status = legacyStatus;
    await page.getByRole("button", { name: "Perbarui Status" }).click();
    await expect(page.getByRole("heading", { name: legacyStatus === "paid" ? "Pembayaran menunggu verifikasi" : "Pembayaran sudah diverifikasi" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Mulai Belajar" })).toHaveCount(0);
    await expect(page.getByText("Selesai:")).toHaveCount(0);
  }
  status = "active";
  await page.getByRole("button", { name: "Perbarui Status" }).click();
  await expect(page.getByRole("link", { name: "Mulai Belajar" })).toHaveAttribute("href", "/dashboard");
  await expect(page.getByText("Selesai:")).toHaveCount(1);
  await expect(page.getByText("Sudah Bayar", { exact: true })).toHaveCount(2);
  status = "cancelled";
  await page.getByRole("button", { name: "Perbarui Status" }).click();
  await expect(page.getByRole("heading", { name: "Pesanan dibatalkan" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Mulai Belajar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ajukan Invoice" })).toHaveCount(0);
});
