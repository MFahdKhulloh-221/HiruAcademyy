import { expect, test } from "@playwright/test";

test("legacy reconciliation, combined filters and eight-row scroll", async ({ page }) => {
  const items = Array.from({ length: 15 }, (_, i) => ({ id: i + 1, name: `Siswa ${i + 1}`, context: "Program N4", quote: "Pengalaman belajar yang terarah dan menyenangkan.", type: i % 2 ? "video" : "text", title: i % 2 ? `Video ${i + 1}` : null, published: i < 14, consent_public: true, moderation_status: "approved", show_on_testimonials: true, landing: i % 2 === 0, archived_at: i === 14 ? "2026-10-26T00:00:00Z" : null, sort_order: i + 1, image: null }));
  let writes = 0;
  await page.route("**/*", async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.pathname === "/api/me") return route.fulfill({ json: { data: { id: 99, name: "Admin", email: "admin@example.test", whatsapp: "08123456789", role: "admin", account_status: "active" } } });
    if (url.pathname === "/sanctum/csrf-cookie") { await page.context().addCookies([{ name: "XSRF-TOKEN", value: "fixture", url: "http://localhost/" }]); return route.fulfill({ status: 204 }); }
    if (url.pathname.startsWith("/api/admin/testimonials")) {
      if (req.method() === "GET") return route.fulfill({ json: { data: items } });
      const body = req.postDataJSON(); expect(body).toEqual({ landing: false }); writes++;
      const item = items.find(x => x.id === Number(url.pathname.split("/").pop()))!; item.landing = false;
      return route.fulfill({ json: { data: item } });
    }
    if (url.pathname.startsWith("/api/")) return route.fulfill({ json: { data: [] } });
    if (url.port === "8000" || !["localhost", "127.0.0.1"].includes(url.hostname)) return route.fulfill({ status: 404 });
    return req.method() === "GET" ? route.continue() : route.abort();
  });
  await page.goto("/admin/testimoni");
  const panel = page.getByRole("region", { name: "Testimoni Pilihan Landing Page" });
  const list = page.getByRole("region", { name: "Daftar testimoni", exact: true });
  await expect(panel).toContainText("Perlu penyesuaian: 7 dipilih, maksimal 6");
  await expect(panel.getByRole("button", { name: "Naik Siswa 3", exact: true })).toBeDisabled();
  await expect(page.getByRole("article").filter({ hasText: "Siswa 12" }).getByLabel("Tampilkan di Landing", { exact: true })).toBeDisabled();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const sizes = await list.evaluate(e => ({ client: e.clientHeight, scroll: e.scrollHeight, row: e.querySelector("article")!.getBoundingClientRect().height }));
    expect(sizes.scroll).toBeGreaterThan(sizes.client);
    expect(sizes.client).toBeLessThanOrEqual(8 * sizes.row + 56);
    await list.evaluate(e => e.scrollTo(0, e.scrollHeight));
    const last = list.getByRole("heading", { name: "Siswa 14", exact: true });
    const inside = await last.evaluate(e => { const item = e.getBoundingClientRect(), panel = e.closest('[role="region"]')!.getBoundingClientRect(); return item.top >= panel.top && item.bottom <= panel.bottom; });
    expect(inside).toBe(true);
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    await list.getByRole("article").last().getByRole("button", { name: "Tindakan Siswa 14" }).click();
    await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeInViewport();
    const menu = page.locator("[popover]:popover-open");
    const box = await menu.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(1000);
    await page.screenshot({ path: `C:/Users/Tulo/AppData/Local/Temp/opencode/admin-menu-${width}.png` });
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    const trigger = list.getByRole("article").last().getByRole("button", { name: "Tindakan Siswa 14" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(menu).toHaveCount(1);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Lihat", exact: true })).toBeFocused();
    await page.getByRole("heading", { name: "Kelola Testimoni" }).click();
    await expect(menu).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `C:/Users/Tulo/AppData/Local/Temp/opencode/admin-filters-${width}.png`, fullPage: true });
  }
  await page.getByRole("combobox", { name: "Jenis testimoni", exact: true }).selectOption("text");
  await expect(list.getByRole("article")).toHaveCount(7);
  await page.getByRole("combobox", { name: "Jenis testimoni", exact: true }).selectOption("video");
  await expect(list.getByRole("article")).toHaveCount(7);
  expect(await list.evaluate(e => e.scrollTop)).toBe(0);
  await page.getByLabel("Hanya Pilihan Landing").check();
  await expect(list.getByRole("article")).toHaveCount(0);
  await page.getByLabel("Cari testimoni").fill("Siswa 2");
  await expect(list.getByRole("article")).toHaveCount(0);
  await page.getByLabel("Cari testimoni").fill("");
  await page.getByLabel("Hanya Pilihan Landing").uncheck();
  await page.getByRole("button", { name: "Arsip", exact: true }).click();
  await expect(list.getByRole("article")).toHaveCount(0);
  await page.getByRole("combobox", { name: "Jenis testimoni", exact: true }).selectOption("text");
  await expect(list.getByRole("article")).toHaveCount(1);
  await page.getByRole("combobox", { name: "Jenis testimoni", exact: true }).selectOption("all");
  await expect(list.getByRole("article")).toHaveCount(1);
  for (let n = 6; n >= 6; n--) {
    await panel.getByRole("button", { name: "Hapus dari Landing", exact: true }).last().click();
    if (n > 6) await expect(panel).toContainText(`Perlu penyesuaian: ${n} dipilih`);
    else await expect(panel).toContainText("6 dari 6");
  }
  expect(writes).toBe(1);
  expect(items.every(x => x.consent_public && x.show_on_testimonials)).toBe(true);
  expect(items.length).toBe(15);
});
