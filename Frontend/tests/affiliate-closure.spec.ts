import { test, expect } from "./canonical-fixture";

const policy = { enabled: true, inviter_reward: 25000, friend_discount: 10000, minimum_purchase: 0, credit_limit: null, expiry_days: null, combine_promo: false, program_ids: [] as number[] };
for (const width of [1440, 768, 390]) {
  test(`referral credit student builder checkout ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.route("**/api/student/affiliate", route => route.fulfill({ json: { data: { affiliate: { id: 1, code: "HIRU-QATEST-123ABC", status: "active" }, policy, totals: { available: 25000, pending: 0, reserved: 0, used: 0 }, history: [{ id: 1, invoice_id: 1, created_at: "2026-10-29T01:00:00Z", reward: 25000, status: "verified", program: "JLPT N5", payment_status: "verified" }], usage: [] } } }));
    await page.goto("/affiliate");
    await expect(page.getByRole("heading", { name: "Ajak Teman, Kalian Berdua Hemat!" })).toBeVisible();
    await expect(page.getByText("HIRU-QATEST-123ABC", { exact: true })).toBeVisible();
    await expect(page.getByText("Belum ada penggunaan kredit.")).toBeVisible();
    await expect(page.getByText(/Tarik Saldo|Pencairan Uang|Transfer Komisi/)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `C:/Users/Tulo/AppData/Local/Temp/opencode/referral-credit-student-${width}.png`, fullPage: true });
    await page.route("**/api/admin/referral-program", async route => {
      if (route.request().method() === "PATCH") {
        const body = route.request().postDataJSON();
        expect(body.inviter_reward).toBe(30000); expect(body.friend_discount).toBe(10000); expect(body.confirmed).toBe(true);
        await route.fulfill({ json: { data: body } }); return;
      }
      await route.fulfill({ json: { data: { policy, programs: [{ id: 1, name: "JLPT N5" }], totals: { owners: 1, successful: 1, issued: 25000, used: 0, available: 25000 }, codes: [], history: [], credits: [], uses: [], audit: [] } } });
    });
    await page.goto("/admin/affiliate-komisi");
    await page.getByRole("button", { name: "Referral Builder", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Referral Builder", exact: true })).toBeVisible();
    await expect(page.getByLabel("Reward Pengundang", { exact: true })).toHaveValue("25000");
    await expect(page.getByLabel("Izinkan diskon referral bersama promo")).not.toBeChecked();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `C:/Users/Tulo/AppData/Local/Temp/opencode/referral-credit-builder-${width}.png`, fullPage: true });
    await page.getByLabel("Reward Pengundang", { exact: true }).fill("30000");
    await expect(page.getByText("Ada perubahan belum disimpan.")).toBeVisible();
    await page.getByLabel("Alasan perubahan").fill("QA prospective policy");
    await page.getByLabel("Saya mengonfirmasi perubahan kebijakan untuk transaksi baru.").check();
    await page.getByRole("button", { name: "Simpan Pengaturan" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Perubahan tersimpan." })).toBeVisible();
    await page.route("**/api/student/referral-quote", route => {
      const body = route.request().postDataJSON();
      return route.fulfill({ json: { data: { base_price: 99000, referral_discount: 10000, promo_discount: 0, credit_discount: body.use_credit ? 25000 : 0, total_price: body.use_credit ? 64000 : 89000, available_credit: 25000 } } });
    });
    await page.goto("/checkout?program=N5&plan=lms");
    await expect(page.getByRole("heading", { name: "Kredit Diskon Tersedia" })).toBeVisible();
    const useCredit = page.getByRole("button", { name: "Gunakan Kredit Diskon Saya", exact: true });
    await expect(useCredit).toHaveText("Gunakan");
    await useCredit.click();
    await expect(useCredit).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Rp 64.000", { exact: true })).toBeVisible();
    await useCredit.click();
    await expect(useCredit).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByText("Rp 89.000", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `C:/Users/Tulo/AppData/Local/Temp/opencode/referral-credit-checkout-${width}.png`, fullPage: true });
  });
}

test("referral credit honest empty and safe error states", async ({ page }) => {
  await page.route("**/api/student/affiliate", route => route.fulfill({ json: { data: { affiliate: { id: 1, code: "HIRU-EMPTY-123ABC", status: "active" }, policy, totals: { available: 0, pending: 0, reserved: 0, used: 0 }, history: [], usage: [] } } }));
  await page.goto("/affiliate");
  await expect(page.getByText("Belum ada riwayat referral.")).toBeVisible();
  await expect(page.getByText("Belum ada penggunaan kredit.")).toBeVisible();
  await page.route("**/api/student/affiliate", route => route.fulfill({ status: 500, json: { message: "Private error" } }));
  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: "Permintaan belum berhasil. Silakan coba lagi." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Coba Lagi", exact: true })).toBeVisible();
});
