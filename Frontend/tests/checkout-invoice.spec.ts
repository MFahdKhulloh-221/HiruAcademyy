import { expect, test } from "@playwright/test";
import { invoiceWhatsAppUrl } from "../src/lib/admin-whatsapp";

const invoice = { id: 42, user_id: 7, program_id: 1, program_code: "n4", plan_code: "lms" as const, base_price: 99000, discount_amount: 0, total_price: 99000, status: "draft", created_at: "2026-10-01T00:00:00Z" };
const user = { id: 7, name: "Siswa", email: "student@example.test", whatsapp: "6281234567890", role: "student", account_status: "active" };

test("invoice WhatsApp uses approved number and actual order", () => {
  const url = new URL(invoiceWhatsAppUrl(invoice));
  expect(url.origin + url.pathname).toBe("https://wa.me/6285194564214");
  expect(url.searchParams.get("text")).toContain("invoice 42, paket Belajar Mandiri, level N4");
});

for (const fail of [false, true]) {
  test(`checkout ${fail ? "network error retries" : "success reopens without duplicate"}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    let writes = 0;
    let failNext = fail;
    await page.route("**/api/**", route => route.fulfill({ json: { data: [] } }));
    await page.route("**/api/me", route => route.fulfill({ json: { data: user } }));
    await page.route("**/api/public/offers", route => route.fulfill({ json: { data: [{ id: 1, program_id: 1, program: { code: "n4", name: "JLPT N4", slug: "n4" }, plan_code: "lms", base_price: 99000, duration_months: 3 }] } }));
    await page.route("**/sanctum/csrf-cookie", route => route.fulfill({ status: 204, headers: { "set-cookie": "XSRF-TOKEN=test; Path=/; SameSite=Lax" } }));
    await page.route("**/api/student/invoices", async route => {
      writes++;
      if (failNext) { failNext = false; await route.abort("failed"); }
      else { const raw = { ...invoice, program_code: undefined }; await route.fulfill({ json: { data: raw } }); }
    });
    await page.goto("/checkout?level=N4&plan=lms");
    await expect(page.locator(".checkout-before ol li")).toHaveText([
      "Pastikan level JLPT dan paket pembelajaran yang Anda pilih sudah sesuai.",
      "Periksa kembali harga dan masa berlaku paket sebelum melanjutkan pembayaran.",
      "Akses paket pembelajaran akan diaktifkan setelah pembayaran dikonfirmasi oleh Admin HiruAcademy.",
      "Harap membaca Syarat dan Ketentuan serta Kebijakan Privasi sebelum menyelesaikan pembelian.",
    ]);
    const submit = page.getByRole("button", { name: "Buat Invoice", exact: true });
    await submit.click();
    const dialog = page.getByRole("dialog");
    if (fail) {
      await expect(dialog).toContainText("Invoice gagal dibuat");
      await expect(dialog.getByRole("link", { name: "Hubungi Admin via WhatsApp" })).toHaveCount(0);
      await dialog.getByRole("button", { name: "Coba Lagi" }).click();
    }
    await expect(dialog).toContainText("INVOICE BERHASIL DIBUAT");
    await expect(dialog).toContainText("42");
    const bounds = await dialog.boundingBox();
    expect(bounds!.width).toBeLessThanOrEqual(390);
    if (!fail) await expect(dialog.getByRole("button", { name: "Tutup dialog" })).toBeFocused();
    await dialog.getByRole("button", { name: "Tutup dialog" }).focus();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: "Tutup", exact: true })).toBeFocused();
    await expect(dialog.getByRole("link", { name: "Hubungi Admin via WhatsApp" })).toHaveAttribute("href", invoiceWhatsAppUrl(invoice));
    await expect(dialog.getByRole("link", { name: "Masuk Dashboard" })).toHaveAttribute("href", "/dashboard");
    expect(page.context().pages()).toHaveLength(1);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(submit).toBeFocused();
    await submit.click();
    await expect(dialog).toContainText("INVOICE BERHASIL DIBUAT");
    expect(writes).toBe(fail ? 2 : 1);
    await dialog.getByRole("button", { name: "Tutup", exact: true }).click();
    await expect(page.getByRole("link", { name: "Instagram Hiru Academy" })).toHaveAttribute("rel", "noopener noreferrer");
  });
}

test("invoice reads real API values; failed lookup never displays success", async ({ page }) => {
  await page.route("**/api/**", route => route.fulfill({ json: { data: [] } }));
  await page.route("**/api/me", route => route.fulfill({ json: { data: user } }));
  await page.route("**/api/public/programs", route => route.fulfill({ json: { data: [{ id: 1, code: "n4" }] } }));
  await page.route("**/api/student/invoices/42", route => route.fulfill({ json: { data: { ...invoice, program_code: undefined } } }));
  await page.goto("/invoice?id=42");
  await expect(page.getByRole("link", { name: "Hubungi Admin via WhatsApp" })).toHaveAttribute("href", invoiceWhatsAppUrl(invoice));
  await expect(page.locator(".invoice-detail")).toContainText("42");
  await page.route("**/api/student/invoices/42", route => route.abort("failed"));
  await page.reload();
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await expect(page.getByText("INVOICE BERHASIL DIBUAT")).toHaveCount(0);
});
