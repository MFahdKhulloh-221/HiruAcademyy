import { expect, test } from "@playwright/test";

test("renewal payment check shows loading, unchanged, updated and failed status", async ({ page }) => {
  const invoice = { id: 42, program_id: 1, program_code: "n4", plan_code: "lms", base_price: 99000, discount_amount: 0, total_price: 99000, status: "awaiting_payment" };
  let fail = false;
  let release: (() => void) | undefined;
  await page.route("**/api/**", route => route.fulfill({ json: { data: [] } }));
  await page.route("**/api/me", route => route.fulfill({ json: { data: { id: 7, name: "Siswa", email: "student@example.test", whatsapp: "6281234567890", role: "student", account_status: "active" } } }));
  await page.route("**/api/student/dashboard", route => route.fulfill({ json: { data: { programs: [], access: { learning: {}, replay_levels: [], source_grants: [] } } } }));
  await page.route("**/api/student/invoices/42", async route => {
    if (release) await new Promise<void>(resolve => { release = resolve; });
    if (fail) return route.abort("failed");
    return route.fulfill({ json: { data: invoice } });
  });
  await page.goto("/renewal?membership=lms&invoice=42");
  const check = page.getByRole("button", { name: "Cek Status Pembayaran" });
  await expect(check).toBeVisible();
  release = () => {};
  await check.click();
  await expect(page.getByRole("button", { name: "Mengecek Status…" })).toBeDisabled();
  release!();
  release = undefined;
  await expect(page.getByRole("status").filter({ hasText: "Status pembayaran belum berubah: Menunggu Pembayaran." })).toBeVisible();
  invoice.status = "active";
  await check.click();
  await expect(page.getByRole("status").filter({ hasText: "Status pembayaran diperbarui: Sudah Bayar." })).toBeVisible();
  fail = true;
  await check.click();
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await expect(check).toBeEnabled();
});
