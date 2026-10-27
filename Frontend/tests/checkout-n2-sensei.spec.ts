import { expect, test } from "@playwright/test";

for (const level of ["n2", "n3"]) for (const mismatch of [false, true]) {
  test(`${level.toUpperCase()} Sensei invoice ${mismatch ? "mismatch blocks duplicate creation" : "opens WhatsApp with actual invoice"}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: level === "n3" ? 390 : 1440, height: 900 });
    let writes = 0;
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route(/\/(api\/|sanctum\/csrf-cookie)/, async route => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();
      const headers = { "access-control-allow-origin": "http://localhost:3000", "access-control-allow-credentials": "true", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "accept, content-type, x-xsrf-token" };
      const reply = (data: unknown) => route.fulfill({ headers, json: { data } });
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
      if (path === "/sanctum/csrf-cookie") return route.fulfill({ status: 204, headers: { ...headers, "set-cookie": "XSRF-TOKEN=fixture; Path=/" } });
      if (path === "/api/me") return reply({ id: 7, name: "Siswa", email: "siswa@example.test", whatsapp: "6281999000001", role: "student", account_status: "active" });
      if (path === "/api/student/access") return reply({ learning: { n2: "preview" }, replay_levels: [], source_grants: [] });
      if (path === "/api/public/programs") return reply([{ id: 4, code: level }]);
      if (path === "/api/public/offers") return reply([{ id: 9, program: { code: level, name: `JLPT ${level.toUpperCase()}`, slug: level }, plan_code: "sensei", base_price: 450000, effective_price: 450000, duration_months: 1 }]);
      if (method !== "GET") {
        expect(path).toBe("/api/student/invoices");
        expect(method).toBe("POST");
        expect(route.request().postDataJSON()).toEqual({ program_offer_id: 9 });
        writes++;
        return reply({ id: 42, user_id: 7, program_id: mismatch ? 1 : 4, plan_code: "sensei", base_price: 350000, total_price: 350000, status: "draft" });
      }
      return reply([]);
    });
    await page.goto(`/checkout?level=${level}&plan=sensei`);
    await page.getByRole("button", { name: "Buat Invoice", exact: true }).click();
    const dialog = page.getByRole("dialog");
    if (mismatch) {
      await expect(dialog).toContainText("Jangan membuat invoice ulang");
      await dialog.getByRole("button", { name: "Coba Lagi" }).click();
      await expect(dialog).toContainText("Jangan membuat invoice ulang");
      await expect(dialog.getByRole("link", { name: "Hubungi Admin via WhatsApp" })).toHaveCount(0);
    } else {
      const link = dialog.getByRole("link", { name: "Hubungi Admin via WhatsApp" });
      await expect(link).toBeVisible();
      const url = new URL((await link.getAttribute("href"))!);
      expect(url.origin + url.pathname).toBe("https://wa.me/6285194564214");
      expect(url.searchParams.get("text")).toContain(`invoice 42, paket Belajar dengan Sensei, level ${level.toUpperCase()}`);
      await expect(dialog).toContainText("Free Member hingga pembayaran dikonfirmasi");
      const layout = await dialog.evaluate(el => {
        const bounds = el.getBoundingClientRect();
        const content = el.querySelector(".admin-dialog-content")!;
        const actions = [...el.querySelectorAll(".button-group > *")].map(item => item.getBoundingClientRect());
        return {
          fits: bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight,
          noOverflow: content.scrollWidth <= content.clientWidth,
          primaryAbove: actions[0].bottom <= actions[1].top,
        };
      });
      expect(layout).toEqual({ fits: true, noOverflow: true, primaryAbove: true });
      await dialog.screenshot({ path: testInfo.outputPath(`invoice-success-${level}.png`) });
      await page.context().route("https://wa.me/**", route => route.fulfill({ contentType: "text/html", body: "WhatsApp mock" }));
      const popup = page.waitForEvent("popup");
      await link.focus();
      await link.press("Enter");
      const opened = await popup;
      await opened.waitForLoadState();
      expect(opened.url()).toBe(url.href);
    }
    expect(writes).toBe(1);
    expect(errors).toEqual([]);
  });
}
