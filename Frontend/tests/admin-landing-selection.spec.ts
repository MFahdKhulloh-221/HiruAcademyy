import { expect, test } from "@playwright/test";

test("Landing selections, replacement and order persist through fixture API", async ({ page }) => {
  const items = Array.from({ length: 7 }, (_, index) => ({ id: index + 1, name: `Pilihan ${index + 1}`, context: "Program N4", quote: "Pengalaman belajar bahasa Jepang yang terarah.", type: "text", title: index === 3 ? "Video Pilihan 4" : null, video_title: index === 3 ? "Video Pilihan 4" : null, video_url: null, video_thumbnail: index === 3 ? "https://example.test/thumb.png" : null, image: null, source: "student", moderation_status: "approved", consent_public: true, published: true, show_on_testimonials: true, landing: false, archived_at: null as string | null, sort_order: index + 1 }));
  let writes = 0;
  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/me") return route.fulfill({ json: { data: { id: 99, name: "Admin Fixture", email: "admin@example.test", whatsapp: "08123456789", role: "admin", account_status: "active" } } });
    if (url.pathname === "/sanctum/csrf-cookie") {
      await page.context().addCookies([{ name: "XSRF-TOKEN", value: "fixture", url: "http://localhost/" }]);
      return route.fulfill({ status: 204 });
    }
    if (url.pathname.startsWith("/api/admin/testimonials")) {
      if (request.method() === "GET") return route.fulfill({ json: { data: items } });
      expect(request.method()).toBe("PATCH");
      writes++;
      const body = request.postDataJSON();
      const item = items.find(item => item.id === Number(url.pathname.split("/").pop()))!;
      if ("landing" in body || "landing_position" in body) {
        expect(Object.keys(body)).toEqual(["landing" in body ? "landing" : "landing_position"]);
        expect(body).not.toHaveProperty("consent_public");
      }
      if (body.landing && items.filter(item => item.landing).length >= 6) return route.fulfill({ status: 422, json: { errors: { landing: ["Maksimal 6"] } } });
      if (body.landing && !item.landing) body.sort_order = Math.max(0, ...items.filter(item => item.landing).map(item => item.sort_order)) + 1;
      if (body.landing_position) {
        const selected = items.filter(other => other.landing && other.id !== item.id).sort((a, b) => a.sort_order - b.sort_order);
        selected.splice(body.landing_position - 1, 0, item);
        selected.forEach((other, index) => { other.sort_order = index + 1; });
        delete body.landing_position;
      }
      Object.assign(item, body);
      if (item.archived_at) Object.assign(item, { published: false, landing: false, show_on_testimonials: false });
      return route.fulfill({ json: { data: item } });
    }
    if (url.pathname === "/api/testimonials") return route.fulfill({ json: { data: items.filter(item => item.published && !item.archived_at && item.consent_public && (url.searchParams.get("landing") === "true" ? item.landing : item.show_on_testimonials)).sort((a, b) => a.sort_order - b.sort_order).slice(0, url.searchParams.has("landing") ? 6 : 7) } });
    if (url.pathname.startsWith("/api/")) return route.fulfill({ json: { data: [] } });
    if (url.port === "8000" || !["localhost", "127.0.0.1"].includes(url.hostname)) return route.fulfill({ status: 404 });
    if (request.method() !== "GET") return route.abort();
    return route.continue();
  });
  await page.goto("/admin/testimoni");
  const selected = page.getByRole("region", { name: "Testimoni Pilihan Landing Page" });
  const row = (name: string) => page.getByRole("article").filter({ has: page.getByRole("heading", { name, exact: true }) });
  await expect(selected).toContainText("0 dari 6");
  for (let index = 1; index <= 6; index++) {
    await row(`Pilihan ${index}`).getByLabel("Tampilkan di Landing", { exact: true }).click();
    await expect(selected).toContainText(`${index} dari 6`);
    await expect(row(`Pilihan ${index}`).getByLabel("Tampilkan di Landing", { exact: true })).toBeChecked();
  }
  const before = writes;
  await expect(row("Pilihan 7").getByLabel("Tampilkan di Landing", { exact: true })).toBeDisabled();
  expect(writes).toBe(before);
  await selected.getByRole("button", { name: "Naik Pilihan 2", exact: true }).click();
  await expect(selected.getByRole("listitem").first()).toContainText("Pilihan 2");
  await selected.getByRole("button", { name: "Turun Pilihan 2", exact: true }).click();
  await expect(selected.getByRole("listitem").first()).toContainText("Pilihan 1");
  await selected.getByRole("button", { name: "Naik Pilihan 2", exact: true }).click();
  await expect(selected.getByRole("listitem").first()).toContainText("Pilihan 2");
  await page.reload();
  await expect(selected.getByRole("listitem").first()).toContainText("Pilihan 2");
  await selected.getByRole("listitem").filter({ hasText: "Pilihan 1" }).getByRole("button", { name: "Hapus dari Landing" }).click();
  await expect(selected).toContainText("5 dari 6");
  await expect(row("Pilihan 1")).toBeVisible();
  expect(items[0].show_on_testimonials).toBe(true);
  expect(items[0].published).toBe(true);
  await row("Pilihan 7").getByLabel("Tampilkan di Landing", { exact: true }).click();
  await expect(selected).toContainText("6 dari 6");
  await row("Pilihan 2").getByRole("button", { name: /^Tindakan / }).click();
  await row("Pilihan 2").getByRole("button", { name: "Arsipkan", exact: true }).click();
  await expect(selected).toContainText("5 dari 6");
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `C:/Users/Tulo/AppData/Local/Temp/opencode/landing-selection-${width}.png`, fullPage: true });
  }
  await page.goto("/");
  const landingCards = page.locator(".landing-testimonials .testimonial-grid > article");
  await expect(landingCards).toHaveCount(5);
  await expect(landingCards).toContainText(["Pilihan 3", "Pilihan 4", "Pilihan 5", "Pilihan 6", "Pilihan 7"]);
  await expect(page.locator(".landing-testimonials .testimonial-video-card")).toHaveCount(0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await landingCards.first().scrollIntoViewIfNeeded();
    await expect(page.locator(".landing-testimonials")).toHaveAttribute("data-revealed", "true");
    await page.locator(".landing-testimonials").evaluate(element => Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished)));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `C:/Users/Tulo/AppData/Local/Temp/opencode/landing-mixed-${width}.png` });
  }
  await page.goto("/testimoni");
  await expect(page.locator(".testimonial-card header strong")).toContainText(["Pilihan 1"]);
  await expect(page.locator("#testimoni-2")).toHaveCount(0);
});
