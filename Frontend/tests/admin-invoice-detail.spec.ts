import { expect, test } from "@playwright/test";

for (const width of [360, 1440]) {
  test(`invoice detail scrolls inside modal at ${width}px and preserves transition`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const invoice = { id: 71, user_id: 9, program_id: 3, program_code: "n3", plan_code: "sensei", base_price: 600000, discount_amount: 0, total_price: 600000, status: "paid", created_at: "2026-10-12T08:00:00Z", note: "Catatan pembayaran panjang ".repeat(250) };
    await page.context().addCookies([{ name: "XSRF-TOKEN", value: "test-token", url: "http://localhost:3000" }]);
    await page.route("**/sanctum/csrf-cookie", route => route.fulfill({ status: 204 }));
    await page.route("**/api/me", route => route.fulfill({ json: { data: { id: 1, name: "Admin", email: "admin@example.test", whatsapp: "628123456789", role: "admin" } } }));
    await page.route("**/api/admin/settings", route => route.fulfill({ json: { data: { contact: { whatsappNumber: "6285194564214" } } } }));
    await page.route("**/api/admin/offers", route => route.fulfill({ json: { data: [] } }));
    await page.route("**/api/admin/users", route => route.fulfill({ json: { data: [{ id: 9, name: "Pembeli Asli", email: "buyer@example.test", whatsapp: "628123456789" }] } }));
    await page.route("**/api/admin/invoices", route => route.fulfill({ json: { data: [invoice] } }));
    await page.route("**/api/admin/invoices/71", route => route.fulfill({ json: { data: invoice } }));
    let transitions = 0;
    await page.route("**/api/admin/invoices/71/transition", async route => {
      expect(route.request().postDataJSON()).toEqual({ status: "verified" });
      transitions++;
      invoice.status = "verified";
      await route.fulfill({ json: { data: invoice } });
    });
    await page.goto("/admin/invoice");
    await page.getByRole("button", { name: "Detail", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Detail Invoice", exact: true });
    await expect(dialog.getByText("Pembeli Asli", { exact: true })).toBeVisible();
    await expect(dialog.getByText("buyer@example.test", { exact: true })).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box!.height).toBeLessThanOrEqual(900 * 0.85 + 1);
    expect(box!.width).toBeLessThanOrEqual(Math.min(800, width - 16));
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await dialog.locator(".admin-dialog-content").evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    await dialog.getByRole("button", { name: "Diverifikasi", exact: true }).click();
    await page.getByRole("dialog", { name: "Ubah Status Invoice?", exact: true }).getByRole("button", { name: "Konfirmasi", exact: true }).click();
    await expect.poll(() => transitions).toBe(1);
    await expect(dialog.getByText("Diverifikasi", { exact: true }).first()).toBeVisible();
    await dialog.getByRole("button", { name: "Tutup", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: "Detail", exact: true }).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });
}
