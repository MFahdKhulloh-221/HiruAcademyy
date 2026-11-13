import { expect, test } from "@playwright/test";

for (const level of ["n2", "n3"]) for (const mismatch of [false, true]) {
  test(`${level.toUpperCase()} Sensei invoice ${mismatch ? "mismatch blocks duplicate creation" : "opens actual invoice"}`, async ({ page }) => {
    await page.setViewportSize({ width: level === "n3" ? 390 : 1440, height: 900 });
    let writes = 0;
    let status = "draft";
    const invoice = () => ({ id: 42, user_id: 7, program_id: mismatch ? 1 : 4, program_code: level, plan_code: "sensei", base_price: 450000, discount_amount: 0, total_price: 450000, status, created_at: "2026-10-01T00:00:00Z" });
    await page.route(/\/(api\/|sanctum\/csrf-cookie)/, async route => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();
      const reply = (data: unknown) => route.fulfill({ json: { data } });
      if (path === "/sanctum/csrf-cookie") return route.fulfill({ status: 204, headers: { "set-cookie": "XSRF-TOKEN=fixture; Path=/" } });
      if (path === "/api/me") return reply({ id: 7, name: "Siswa", email: "siswa@example.test", whatsapp: "6281999000001", role: "student", account_status: "active" });
      if (path === "/api/public/programs") return reply([{ id: 4, code: level }]);
      if (path === "/api/public/offers") return reply([{ id: 9, program: { code: level, name: `JLPT ${level.toUpperCase()}`, slug: level }, plan_code: "sensei", base_price: 450000, effective_price: 450000, duration_months: 1 }]);
      if (path === "/api/student/referral-quote") return reply({ total_price: 450000, available_credit: 0 });
      if (path === "/api/student/invoices/42/submit") { status = "awaiting_payment"; return reply(invoice()); }
      if (path === "/api/student/invoices/42") return reply(invoice());
      if (path === "/api/student/invoices" && method === "POST") {
        expect(route.request().postDataJSON()).toMatchObject({ program_offer_id: 9, use_credit: false });
        writes++;
        return reply(invoice());
      }
      return reply([]);
    });
    await page.goto(`/checkout?level=${level}&plan=sensei`);
    await page.getByRole("button", { name: "Buat Invoice", exact: true }).click();
    if (mismatch) {
      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText("Jangan membuat invoice ulang");
      await dialog.getByRole("button", { name: "Coba Lagi" }).click();
      await expect(dialog).toContainText("Jangan membuat invoice ulang");
    } else {
      await expect(page.getByRole("dialog")).toContainText("Menunggu Pembayaran");
      const link = page.getByRole("dialog").getByRole("link", { name: "Hubungi Admin via WhatsApp" });
      const url = new URL((await link.getAttribute("href"))!);
      expect(url.origin + url.pathname).toBe("https://wa.me/6285194564214");
      expect(url.searchParams.get("text")).toContain(`invoice 42, email akun siswa@example.test, paket Belajar dengan Sensei, level ${level.toUpperCase()}`);
    }
    expect(writes).toBe(1);
  });
}
