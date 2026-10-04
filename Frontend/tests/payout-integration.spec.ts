import { expect, test } from "@playwright/test";

test("payout selects only approved snapshots and persists server settlement without amount authority", async ({ page }) => {
  const commissions = [{ id: 1, affiliate_id: 7, amount: 1200, status: "approved" }, { id: 2, affiliate_id: 7, amount: 300, status: "pending" }, { id: 3, affiliate_id: 7, amount: 500, status: "paid" }];
  const payouts: { id: number; affiliate_id: number; amount: number; paid_at: string }[] = [];
  await page.route(/\/(api\/|sanctum\/csrf-cookie)/, async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/sanctum/csrf-cookie") { await route.fulfill({ status: 204, headers: { "set-cookie": "XSRF-TOKEN=test; Path=/" } }); return; }
    if (path === "/api/admin/payouts" && route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      expect(body).toMatchObject({ affiliate_id: 7, commission_ids: [1], paid_at: "2026-10-01" });
      expect(body).not.toHaveProperty("amount");
      expect(body.request_key).toMatch(/^[0-9a-f-]{36}$/);
      commissions[0].status = "paid";
      payouts.push({ id: 42, affiliate_id: 7, amount: 1200, paid_at: body.paid_at });
      await route.fulfill({ json: { data: payouts[0] } }); return;
    }
    const data = path === "/api/me" ? { id: 91, name: "Admin", email: "admin@example.test", whatsapp: "6281999000011", role: "admin", account_status: "active" } : path === "/api/admin/commissions" ? commissions : path === "/api/admin/payouts" ? payouts : [];
    await route.fulfill({ json: { data } });
  });
  await page.goto("/admin/pencairan-komisi");
  await page.getByRole("button", { name: "Tambah Pencairan" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Affiliate", exact: true }).selectOption("7");
  await expect(dialog.getByRole("checkbox")).toHaveCount(1);
  await dialog.getByRole("checkbox").check();
  await dialog.getByLabel("Tanggal", { exact: true }).fill("2026-10-01");
  await dialog.getByRole("button", { name: "Tandai Sudah Dicairkan" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("row").filter({ hasText: "42" })).toContainText("Sudah Dicairkan");
  await page.reload();
  await expect(page.getByRole("row").filter({ hasText: "42" })).toContainText("1.200");
  await page.getByRole("button", { name: "Tambah Pencairan" }).click();
  await expect(dialog.getByRole("checkbox")).toHaveCount(0);
});
