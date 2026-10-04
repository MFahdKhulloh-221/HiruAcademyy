import { expect, test } from "@playwright/test";
import { commercialId, commercialWhatsApp } from "../src/lib/commercial-api";

test("commercial IDs and configured WhatsApp reject unsafe values", () => {
  expect(commercialId("42")).toBe("42");
  for (const id of ["../me", "1?status=active", "INV-001", "", "-1"]) expect(() => commercialId(id)).toThrow();
  for (const phone of ["", "081234567890", "62812<script>", "https://evil.test", "62812?text=x"]) expect(commercialWhatsApp(phone, "Invoice 42")).toBeNull();
  expect(commercialWhatsApp("+6281234567890", "Invoice 42 & paid?")).toBe("https://wa.me/6281234567890?text=Invoice%2042%20%26%20paid%3F");
});

test("admin invoice transitions use backend and survive refresh", async ({ page }) => {
  const invoice = { id: 42, user_id: 7, program_id: 1, program_code: "n4", plan_code: "lms", base_price: 99000, discount_amount: 0, total_price: 99000, status: "paid", created_at: "2026-10-01T00:00:00Z" };
  let transitions = 0;
  await page.route("**/api/me", route => route.fulfill({ json: { data: { id: 1, name: "Admin", email: "admin@example.test", whatsapp: "6281234567890", role: "admin", account_status: "active" } } }));
  await page.route("**/api/admin/users", route => route.fulfill({ json: { data: [] } }));
  await page.route("**/api/admin/offers", route => route.fulfill({ json: { data: [] } }));
  await page.route("**/api/admin/invoices", route => route.fulfill({ json: { data: [invoice] } }));
  await page.route("**/sanctum/csrf-cookie", route => route.fulfill({ status: 204, headers: { "set-cookie": "XSRF-TOKEN=test; Path=/; SameSite=Lax" } }));
  await page.route("**/api/admin/invoices/42/transition", async route => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({ status: "verified" });
    transitions += 1; invoice.status = "verified";
    await route.fulfill({ json: { data: invoice } });
  });
  await page.goto("/admin/invoice");
  const row = page.getByRole("row").filter({ has: page.getByRole("cell", { name: "42", exact: true }) });
  await expect(row).toContainText("Sudah Bayar");
  await row.getByRole("button", { name: "Diverifikasi", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Konfirmasi", exact: true }).click();
  await expect(row).toContainText("Diverifikasi");
  expect(transitions).toBe(1);
  await page.reload();
  await expect(row).toContainText("Diverifikasi");
  await expect(page.getByRole("button", { name: "Tambah Invoice" })).toBeEnabled();
});
