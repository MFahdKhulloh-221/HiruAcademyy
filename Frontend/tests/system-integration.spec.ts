import { expect, test } from "@playwright/test";

async function adminApi(page: import("@playwright/test").Page) {
  let rows: Record<string, unknown>[] = [];
  await page.route(/\/(api\/|sanctum\/csrf-cookie)/, async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/sanctum/csrf-cookie") { await route.fulfill({ status: 204, headers: { "set-cookie": "XSRF-TOKEN=test; Path=/; SameSite=Lax" } }); return; }
    if (path === "/api/me") { await route.fulfill({ json: { data: { id: 91, name: "Admin", email: "admin@example.test", whatsapp: "081234567890", role: "admin", account_status: "active" } } }); return; }
    if (route.request().method() === "POST") { rows = [{ ...route.request().postDataJSON(), id: 1 }]; await route.fulfill({ status: 201, json: { data: rows[0] } }); return; }
    await route.fulfill({ json: { data: rows } });
  });
  return () => rows;
}

test("notification editor persists canonical payload without demo rows", async ({ page }) => {
  const rows = await adminApi(page);
  await page.goto("/admin/notifikasi");
  await page.getByRole("button", { name: "Tambah Notifikasi", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Judul", { exact: true }).fill("Canonical announcement");
  await dialog.getByLabel("Isi", { exact: true }).fill("Persisted body");
  await dialog.getByRole("button", { name: "Simpan Notifikasi" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "Canonical announcement", exact: true })).toBeVisible();
  expect(rows()[0]).toMatchObject({ type: "Pengumuman", status: "draft", audience: "All", preset: "None", path: null, cta_label: null, level: null });
  await expect(page.getByText("Materi Chapter 4 tersedia", { exact: true })).toHaveCount(0);
});

test("certificate template persists without claiming student issuance", async ({ page }) => {
  const rows = await adminApi(page);
  await page.goto("/admin/sertifikat");
  await page.getByRole("button", { name: "Tambah Sertifikat", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Program", { exact: true }).fill("JLPT N5");
  await dialog.getByLabel("Judul", { exact: true }).fill("Canonical template");
  await dialog.getByLabel("Deskripsi", { exact: true }).fill("Template only");
  await dialog.getByRole("button", { name: "Simpan Sertifikat" }).click();
  await expect(dialog).toHaveCount(0);
  expect(rows()[0]).toMatchObject({ program: "JLPT N5", sort_order: 1, status: "draft", image: null });
  await expect(page.getByText("Issued", { exact: true })).toHaveCount(0);
});

test("schedule editor writes UTC schedule with canonical program", async ({ page }) => {
  let saved: Record<string, unknown> | undefined;
  await page.route(/\/(api\/|sanctum\/csrf-cookie)/, async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/sanctum/csrf-cookie") { await route.fulfill({ status: 204, headers: { "set-cookie": "XSRF-TOKEN=test; Path=/; SameSite=Lax" } }); return; }
    if (route.request().method() === "POST") { saved = route.request().postDataJSON(); await route.fulfill({ status: 201, json: { data: { ...saved, id: 1 } } }); return; }
    const data = path === "/api/me" ? { id: 91, name: "Admin", email: "admin@example.test", whatsapp: "081234567890", role: "admin", account_status: "active" } : path === "/api/admin/programs" ? [{ id: 4, code: "n4", name: "JLPT N4" }] : path === "/api/admin/class-schedules" && saved ? [{ ...saved, id: 1 }] : [];
    await route.fulfill({ json: { data } });
  });
  await page.goto("/admin/kelas-jadwal");
  await page.getByRole("button", { name: "Tambah Jadwal Live" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Judul", { exact: true }).fill("Canonical live");
  await dialog.getByRole("combobox", { name: "Program", exact: true }).selectOption("N4");
  await dialog.getByLabel("Chapter / Sesi", { exact: true }).fill("Chapter 1");
  await dialog.getByLabel("Tanggal", { exact: true }).fill("2026-10-20");
  await dialog.getByLabel("Jam mulai (WIB)", { exact: true }).fill("19:00");
  await dialog.getByLabel("Sensei", { exact: true }).fill("Canonical Sensei");
  await dialog.getByLabel("URL Zoom", { exact: true }).fill("https://example.test/meeting");
  await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(saved).toMatchObject({ program_id: 4, scheduled_at: "2026-10-20T12:00:00.000Z", meeting_url: "https://example.test/meeting", status: "published" });
});

test("student schedule uses backend empty instead of seeded sessions", async ({ page }) => {
  await page.route(/\/api\//, async route => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({ json: { data: path === "/api/me" ? { id: 72, name: "Student", email: "student@example.test", whatsapp: "081234567890", role: "student", account_status: "active" } : path === "/api/student/access" ? { learning: {}, replay_levels: [], source_grants: [] } : [] } });
  });
  await page.goto("/schedule?membership=sensei");
  await expect(page.getByRole("heading", { name: "Belum ada sesi pada periode ini" })).toBeVisible();
  await expect(page.getByText("Chapter 4 • Sesi Live", { exact: true })).toHaveCount(0);
});

test("replay player rejects query video when playlist is unauthorized", async ({ page }) => {
  await page.route(/\/api\//, async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes("replay-playlists")) { await route.fulfill({ status: 403, json: {} }); return; }
    await route.fulfill({ json: { data: path === "/api/me" ? { id: 72, name: "Student", email: "student@example.test", whatsapp: "081234567890", role: "student", account_status: "active" } : path === "/api/student/access" ? { learning: {}, replay_levels: [], source_grants: [] } : [] } });
  });
  await page.goto("/replay/chapter-4?membership=sensei&id=1&v=dQw4w9WgXcQ");
  await expect(page.getByRole("button", { name: "Coba Lagi" })).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
});

test("analytics remains disconnected without fake metrics", async ({ page }) => {
  await adminApi(page);
  await page.goto("/admin/analitik");
  await expect(page.getByRole("heading", { name: "External Analytics", exact: true })).toBeVisible();
  await expect(page.getByText("Belum terhubung", { exact: true })).toBeVisible();
  await expect(page.locator(".admin-metric-card").filter({ hasText: "Total pengguna" }).locator("strong")).toHaveText("0");
  await expect(page.getByText(/pengunjung unik|conversion rate|bounce rate/i)).toHaveCount(0);
});
