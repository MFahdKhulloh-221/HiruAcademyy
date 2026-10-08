import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\//, async route => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({ json: { data: path === "/api/me" ? { id: 901, name: "Browser Admin", email: "browser.admin@example.test", whatsapp: "6281999000011", role: "admin", account_status: "active" } : [] } });
  });
});

const menu = ["Dashboard", "Harga & Promo", "Showcase", "Sensei", "Testimoni", "Placement Test", "Blog", "Video Lesson", "Modul", "Flashcard", "Audio Question", "Reading Question", "Mini Checkpoint", "Try Out", "Jadwal & Replay", "Sertifikat", "Notifikasi", "Pengguna & Akses", "Invoice", "Affiliate & Komisi", "Analitik"];
const routes = ["/admin", "/admin/landing-page", "/admin/program-harga", "/admin/kurikulum-materi", "/admin/bank-soal", "/admin/placement-hasil", "/admin/pengguna-akses", "/admin/invoice", "/admin/affiliate-komisi", "/admin/pencairan-komisi", "/admin/testimoni", "/admin/blog-seo", "/admin/pengumuman", "/admin/sensei", "/admin/kelas-jadwal", "/admin/analitik", "/admin/pengaturan-integrasi"];
const groups = ["DASHBOARD", "LANDING & PUBLIC", "PEMBELAJARAN", "OPERASIONAL"];

test("sidebar groups 21 destinations and links back to site", async ({ page }) => {
  await page.goto("/admin");
  const nav = page.getByRole("navigation", { name: "Navigasi admin" });
  await expect(nav.getByRole("link")).toHaveCount(21);
  await expect(nav.getByRole("link").allTextContents()).resolves.toEqual(menu);
  for (const group of groups) await expect(nav.getByText(group, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Kembali ke Situs" })).toHaveAttribute("href", "/");
});

for (const route of routes) test(`${route} opens`, async ({ page }) => { expect((await page.goto(route))?.status()).toBe(200); await expect(page.getByRole("heading", { level: 1 })).toBeVisible(); });

test("dashboard shows canonical users and access without local prototype identity", async ({ page }) => {
  await page.route("**/api/admin/users", route => route.fulfill({ json: { data: [{ id: 71, name: "Canonical Student", email: "canonical@example.test", whatsapp: "6281999000012", account_status: "active" }] } }));
  await page.route("**/api/admin/users/71/effective-access", route => route.fulfill({ json: { data: { source_grants: [{ program_code: "n4", plan_code: "lms", ends_at: "2026-12-31" }] } } }));
  await page.goto("/admin");
  await expect(page.getByRole("link", { name: /Tinjau Invoice/ })).toHaveAttribute("href", "/admin/invoice");
  const row = page.getByRole("row").filter({ hasText: "Canonical Student" });
  await expect(row).toContainText("canonical@example.test");
  await expect(row).toContainText("Belajar Mandiri");
  await expect(row).toContainText("N4");
  await expect(row).toContainText("2026-12-31");
  await page.reload();
  await expect(row).toBeVisible();
  await expect(page.getByText("Hilmi Farhan", { exact: true })).toHaveCount(0);
});

test("mobile drawer locks body and traps all focusable selectors", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin");
  const trigger = page.getByRole("button", { name: "Buka navigasi admin" });
  await trigger.click();
  await expect(page.getByRole("link", { name: "Dashboard" })).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  await page.locator("#admin-sidebar").evaluate((sidebar) => { const target = document.createElement("div"); target.tabIndex = 0; target.setAttribute("aria-label", "Focusable custom"); sidebar.append(target); });
  const custom = page.getByLabel("Focusable custom");
  await custom.focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Dashboard" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(custom).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("");
});

test("dedicated Sensei dialog focuses and persists canonical API data", async ({ page }) => {
  const rows: Record<string, unknown>[] = [];
  const photo = "media/image/12345678-1234-1234-1234-123456789012.png";
  await page.route("**/storage/media/image/**", route => route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=", "base64") }));
  await page.route("**/api/admin/media", async route => {
    expect(route.request().headers()["content-type"]).toContain("multipart/form-data; boundary=");
    expect(route.request().headers()["x-xsrf-token"]).toBeTruthy();
    await route.fulfill({ status: 201, json: { data: { path: photo, url: `http://localhost:8000/storage/${photo}`, mime_type: "image/png" } } });
  });
  await page.route("**/sanctum/csrf-cookie", route => route.fulfill({ status: 204, headers: { "set-cookie": "XSRF-TOKEN=test; Path=/" } }));
  await page.route("**/api/admin/sensei-profiles", async route => {
    if (route.request().method() === "POST") { rows.push({ ...route.request().postDataJSON(), id: 7 }); await route.fulfill({ status: 201, json: { data: rows[0] } }); return; }
    await route.fulfill({ json: { data: rows } });
  });
  await page.goto("/admin/sensei");
  await page.getByRole("button", { name: "Tambah Sensei" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nama", { exact: true }).fill("Sensei Kenji");
  await dialog.getByLabel("Peran", { exact: true }).fill("Pengajar");
  await dialog.getByLabel("Bio singkat", { exact: true }).fill("Pengajar bahasa Jepang.");
  await dialog.getByRole("textbox", { name: /^Keahlian/ }).fill("JLPT N5");
  await dialog.getByLabel("Foto", { exact: true }).setInputFiles({ name: "sensei.png", mimeType: "image/png", buffer: Buffer.from("image") });
  await expect(dialog.getByLabel("Foto", { exact: true })).toBeEnabled();
  await expect(dialog.getByRole("img", { name: "Foto profil Sensei Kenji" })).toHaveAttribute("src", `http://localhost:8000/storage/${photo}`);
  await dialog.getByRole("button", { name: "Simpan Sensei", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(rows[0].photo).toBe(photo);
  await page.reload();
  await expect(page.getByRole("cell", { name: "Sensei Kenji", exact: true })).toBeVisible();
});

test("dialog traps focus, Escape closes, and returns focus", async ({ page }) => { await page.goto("/admin/sensei"); const trigger = page.getByRole("button", { name: "Tambah Sensei" }); await trigger.click(); const dialog = page.getByRole("dialog"); await dialog.getByLabel("Nama").focus(); await page.keyboard.press("Shift+Tab"); await expect(page.getByRole("button", { name: "Tutup dialog" })).toBeFocused(); await page.keyboard.press("Tab"); await expect(page.getByLabel("Nama")).toBeFocused(); await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused(); });

test("tabs support roving keyboard navigation", async ({ page }) => { await page.goto("/admin/pengaturan-integrasi"); const first = page.getByRole("tab", { name: "Umum" }); await first.focus(); await page.keyboard.press("ArrowRight"); await expect(page.getByRole("tab", { name: "Branding" })).toBeFocused(); await expect(page.getByRole("tab", { name: "Branding" })).toHaveAttribute("aria-selected", "true"); await page.keyboard.press("End"); await expect(page.getByRole("tab", { name: "Profil Admin" })).toBeFocused(); });

for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 820, height: 1180 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }]) test(`dashboard has no overflow at ${viewport.width}x${viewport.height}`, async ({ page }) => { await page.setViewportSize(viewport); await page.goto("/admin"); expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true); if (viewport.width <= 820) { const trigger = page.getByRole("button", { name: "Buka navigasi admin" }); await trigger.click(); await expect(page.locator("#admin-sidebar")).toHaveClass(/open/); await page.keyboard.press("Escape"); await expect(trigger).toBeFocused(); } else await expect(page.getByRole("button", { name: "Buka navigasi admin" })).toBeHidden(); });
