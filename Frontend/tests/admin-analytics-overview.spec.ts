import { expect, test } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`analitik shows honest GA4 overview without operational requests at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const operationalRequests: string[] = [];
    page.on("request", request => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith("/api/admin/") && !["/api/admin/analytics", "/api/admin/analytics/realtime"].includes(path)) operationalRequests.push(request.url());
    });
    await page.route("**/api/me", route => route.fulfill({ json: { data: { id: 1, role: "admin", name: "Admin", email: "admin@example.test", whatsapp: "081234567890", account_status: "active" } } }));
    await page.route("**/api/public/analytics-config", route => route.fulfill({ json: { data: { measurementId: "G-93DCMCP6N9" } } }));
    await page.route("**/api/admin/**", route => route.fulfill({ status: 500, json: { message: "Operational analytics must not be requested." } }));
    let realtimeAvailable = true;
    let realtimeRequests = 0;
    await page.route("**/api/admin/analytics/realtime", route => {
      realtimeRequests++;
      return realtimeAvailable
        ? route.fulfill({ json: { data: { windowMinutes: 30, refreshedAt: "2026-11-16T10:00:00+07:00", metrics: { activeUsers: 2, screenPageViews: 11 } } } })
        : route.fulfill({ status: 503, json: { message: "Unavailable" } });
    });
    let available = false;
    let zero = false;
    const periods: string[] = [];
    await page.route("**/api/admin/analytics?*", route => {
      const period = new URL(route.request().url()).searchParams.get("period");
      periods.push(period ?? "");
      return available
        ? route.fulfill({ json: { data: { period, metrics: zero ? { activeUsers: 0, sessions: 0, screenPageViews: 0, averageEngagementSeconds: 0 } : { activeUsers: 42, sessions: 57, screenPageViews: 123, averageEngagementSeconds: 35.5 } } } })
        : route.fulfill({ status: 503, json: { message: "GA4 unavailable" } });
    });

    await page.clock.install();
    await page.goto("/admin/analitik");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: "Analitik", exact: true })).toBeVisible();
    await expect(main.getByText("Pantau kunjungan dan aktivitas pengunjung HiruAcademy.")).toBeVisible();
    await expect(main.getByText("Sumber: GA4", { exact: true })).toBeVisible();
    await expect(main.getByText(/DASHBOARD|GOOGLE ANALYTICS/)).toHaveCount(0);
    const explanation = main.locator("details");
    await expect(explanation).not.toHaveAttribute("open");
    await explanation.locator("summary").click();
    await expect(explanation.getByText(/24–48 jam/)).toBeVisible();
    await expect(explanation.getByText(/cache selama 5 menit/)).toBeVisible();
    await explanation.locator("summary").click();
    await expect(main.getByText("Data laporan periode ini belum tersedia", { exact: true })).toHaveCount(0);
    await expect(main.getByRole("heading", { name: "Laporan GA4 belum tersedia di panel ini" })).toBeVisible();
    await expect(main.getByRole("alert")).toContainText("Google Analytics Data API");
    const realtime = main.getByRole("region", { name: "Aktivitas Realtime" });
    await expect(realtime.getByText("2", { exact: true })).toBeVisible();
    await expect(realtime.getByText("11", { exact: true })).toBeVisible();
    await expect(realtime.getByText("Ringkasan aktivitas selama 30 menit terakhir")).toBeVisible();
    await expect(realtime.locator("time")).toHaveAttribute("datetime", "2026-11-16T10:00:00+07:00");
    await expect(main.getByText(/bukan nol kunjungan/)).toBeVisible();
    const metrics = main.getByRole("region", { name: "Metrik utama Google Analytics" });
    for (const label of ["Pengguna Aktif", "Sesi Kunjungan", "Tayangan Halaman", "Rata-rata Engagement"]) {
      const card = metrics.getByRole("article").filter({ has: page.getByText(label, { exact: true }) });
      await expect(card).toBeVisible();
      await expect(card.getByText("—", { exact: true })).toBeVisible();
    }
    await expect(main.getByRole("tablist")).toHaveCount(0);
    await expect(main.getByText(/Membership|Invoice|Inventaris pembelajaran/)).toHaveCount(0);
    const link = main.getByRole("link", { name: "Buka Google Analytics (tab baru)" });
    await expect(link).toHaveAttribute("href", "https://analytics.google.com/analytics/web/#/p558392393/reports/intelligenthome");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await link.scrollIntoViewIfNeeded();
    await expect(link).toBeVisible();
    await link.focus();
    await expect(link).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(operationalRequests).toEqual([]);

    const realtimeBeforePeriodChange = realtimeRequests;
    available = true;
    await main.getByRole("button", { name: "Coba lagi", exact: true }).click();
    await expect(main.getByText("Sumber: GA4", { exact: true })).toBeVisible();
    for (const amount of ["42", "57", "123", "35,5 dtk"]) await expect(metrics.getByText(amount, { exact: true })).toBeVisible();
    await expect(main.getByRole("alert")).toHaveCount(0);
    await main.getByRole("button", { name: "7 Hari", exact: true }).click();
    await expect(main.getByRole("button", { name: "7 Hari", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(metrics.getByText("42", { exact: true })).toBeVisible();
    expect(periods).toEqual(["30d", "30d", "7d"]);
    await expect(main.getByText("Performa situs dalam 7 hari terakhir")).toBeVisible();
    await expect(main.getByText("Data laporan periode ini belum tersedia", { exact: true })).toHaveCount(0);
    zero = true;
    await main.getByRole("button", { name: "30 Hari", exact: true }).click();
    await expect(main.getByText("Data laporan periode ini belum tersedia", { exact: true })).toBeVisible();
    await expect(main.getByText("GA4 Realtime dapat menampilkan aktivitas lebih awal daripada laporan standar.")).toBeVisible();
    await expect(metrics.getByRole("article")).toHaveCount(4);
    await expect(metrics.getByText("0", { exact: true })).toHaveCount(3);
    await expect(metrics.getByText("0 dtk", { exact: true })).toBeVisible();
    expect(realtimeRequests).toBe(realtimeBeforePeriodChange);
    realtimeAvailable = false;
    await realtime.getByRole("button", { name: "Perbarui Realtime" }).click();
    await expect(realtime.getByRole("alert")).toContainText("Realtime tidak tersedia");
    await expect(realtime.getByText("—", { exact: true })).toHaveCount(2);
    await expect(realtime.locator("time")).toHaveAttribute("datetime", "2026-11-16T10:00:00+07:00");
    realtimeAvailable = true;
    await realtime.getByRole("button", { name: "Perbarui Realtime" }).click();
    await expect(realtime.getByText("11", { exact: true })).toBeVisible();
    await expect(realtime.getByRole("alert")).toHaveCount(0);
    const beforePoll = realtimeRequests;
    await page.clock.fastForward(15_000);
    await expect.poll(() => realtimeRequests).toBe(beforePoll + 1);
    await expect(realtime).toHaveAttribute("aria-busy", "false");
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.clock.fastForward(45_000);
    expect(realtimeRequests).toBe(beforePoll + 1);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: false });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect.poll(() => realtimeRequests).toBe(beforePoll + 2);
    expect(operationalRequests).toEqual([]);
  });
}
