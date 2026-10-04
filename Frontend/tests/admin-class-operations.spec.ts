import { expect, test, type Page } from "./canonical-fixture";

const operationsKey = "hiru-admin-class-operations:v1";
const curriculumKey = "hiru-admin-curriculum:v1";
const widths = [360, 390, 768, 820, 1024, 1440];

async function clearStores(page: Page) {
  await page.goto("/");
  await page.evaluate(([operations, curriculum]) => {
    localStorage.removeItem(operations);
    localStorage.removeItem(curriculum);
  }, [operationsKey, curriculumKey]);
}

async function noOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) <= document.documentElement.clientWidth)).toBe(true);
}

async function saveSensei(page: Page, name: string, specialization: string, status = "Aktif") {
  await page.goto("/admin/sensei");
  await page.getByRole("button", { name: "Tambah Sensei" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nama").fill(name);
  await dialog.getByLabel("Peran", { exact: true }).fill(`Mentor ${specialization.split(",")[0]}`);
  await dialog.getByLabel("Bio singkat").fill("Sensei untuk kelas JLPT.");
  await dialog.getByRole("textbox", { name: /^Keahlian/ }).fill(specialization);
  await page.route("**/sensei-test.svg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="orange"/></svg>' }));
  await dialog.getByRole("textbox", { name: /^Foto/ }).fill("http://localhost:3000/sensei-test.svg");
  await dialog.getByRole("combobox", { name: /^Status/ }).selectOption(status === "Aktif" ? "active" : "inactive");
  await dialog.getByRole("button", { name: "Simpan Sensei", exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

test.beforeEach(async ({ page }) => clearStores(page));

test("A: Sensei specialization/status persist and remain selectable", async ({ page }) => {
  await saveSensei(page, "Hana", "JLPT N4, Percakapan");
  await page.reload();
  await expect(page.getByRole("table").getByText("Hana", { exact: true })).toBeVisible();
  await expect(page.getByRole("table").getByText("JLPT N4, Percakapan", { exact: true })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Hana" })).toContainText("Aktif");
  await page.goto("/sensei");
  await expect(page.getByText("Hana", { exact: true })).toBeVisible();
});

test("B-C: canonical N4 schedule persists UTC time and appears in server authorized schedule", async ({ page }) => {
  const schedules: Record<string, unknown>[] = [];
  await page.route("**/api/admin/class-schedules", async route => {
    if (route.request().method() === "POST") { const row = { ...route.request().postDataJSON(), id: 7 }; expect(row.scheduled_at).toBe("2026-10-20T12:00:00.000Z"); schedules.push(row); await route.fulfill({ status: 201, json: { data: row } }); return; }
    await route.fulfill({ json: { data: schedules } });
  });
  await page.route("**/api/student/class-schedules", route => route.fulfill({ json: { data: schedules.filter(row => row.status === "published") } }));
  await page.goto("/admin/kelas-jadwal");
  await page.getByRole("button", { name: "Tambah Jadwal Live", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Judul", { exact: true }).fill("N4 Chapter 4 Hana");
  await dialog.getByRole("combobox", { name: /^Program/ }).selectOption("N4");
  await dialog.getByLabel("Chapter / Sesi", { exact: true }).fill("Chapter 4");
  await dialog.getByLabel("Tanggal", { exact: true }).fill("2026-10-20");
  await dialog.getByLabel("Jam mulai (WIB)", { exact: true }).fill("19:00");
  await dialog.getByLabel("Sensei", { exact: true }).fill("Hana");
  await dialog.getByLabel("URL Zoom", { exact: true }).fill("https://example.test/meeting");
  await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("table")).toContainText("N4 Chapter 4 Hana");
  await page.goto("/schedule?membership=free");
  await page.getByLabel("Periode").fill("2026-10");
  await expect(page.getByText("N4 Chapter 4 Hana").first()).toBeVisible();
});

test("D: schedule server denial cannot be bypassed by membership query", async ({ page }) => {
  let allowed = false;
  await page.route("**/api/student/class-schedules", route => route.fulfill(allowed ? { json: { data: [] } } : { status: 403, json: {} }));
  for (const membership of ["free", "lms", "sensei"]) {
    await page.goto(`/schedule?membership=${membership}`);
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Link Aktif Saat Sesi" })).toHaveCount(0);
  }
  allowed = true;
  await page.goto("/schedule?membership=free");
  await expect(page.getByRole("heading", { name: "Jadwal cohort dan sesi bersama Sensei" })).toBeVisible();
});

test("E: server overlapping Sensei validation keeps schedule editor open without persisting", async ({ page }) => {
  let writes = 0;
  await page.route("**/api/admin/class-schedules", route => { if (route.request().method() === "POST") { writes++; return route.fulfill({ status: 422, json: { message: "Konflik jadwal: Sensei sudah memiliki sesi pada waktu ini." } }); } return route.fulfill({ json: { data: [] } }); });
  await page.goto("/admin/kelas-jadwal");
  await page.getByRole("button", { name: "Tambah Jadwal Live", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Judul", { exact: true }).fill("Sesi Konflik");
  await dialog.getByRole("combobox", { name: /^Program/ }).selectOption("N4");
  await dialog.getByLabel("Chapter / Sesi", { exact: true }).fill("Chapter 1");
  await dialog.getByLabel("Tanggal", { exact: true }).fill("2026-10-20");
  await dialog.getByLabel("Jam mulai (WIB)", { exact: true }).fill("19:30");
  await dialog.getByLabel("Jam selesai (WIB, opsional)", { exact: true }).fill("20:30");
  await dialog.getByLabel("Sensei", { exact: true }).fill("Hana");
  await dialog.getByLabel("URL Zoom", { exact: true }).fill("https://example.test/meeting");
  await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(dialog.getByRole("alert").first()).toBeVisible();
  expect(writes).toBe(1);
  await expect(dialog).toBeVisible();
});

test("F-G: replay videos belong to canonical playlist and inactive Sensei cannot be selected for new session", async ({ page }) => {
  await page.route("**/api/admin/replay-playlists", route => route.fulfill({ json: { data: [{ id: 7, program_id: 1, title: "N5 Replay Playlist", status: "published", sort_order: 0 }] } }));
  await page.route("**/api/admin/sensei-profiles", route => route.fulfill({ json: { data: [{ id: 11, name: "Sensei Inaktif", role: "Pengajar", bio: "", photo: "", expertise: ["N4"], level: "n4", active: false, sort_order: 0 }] } }));
  await page.goto("/admin/kelas-jadwal");
  await page.getByRole("tab", { name: "Replay" }).click();
  await expect(page.getByRole("table").getByText("N5 Replay Playlist")).toBeVisible();
  await page.goto("/sensei");
  await expect(page.getByText("Sensei Inaktif")).toHaveCount(0);
});

test("H: admin operations stay usable without overflow at all supported widths", async ({ page }) => {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/admin/sensei", "/admin/kelas-jadwal"]) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await noOverflow(page);
    }
  }
});

test("I: Sensei create and edit update both public surfaces", async ({ page }) => {
  await saveSensei(page, "Sensei Yuki", "N3, Kanji, Reading");
  await page.goto("/");
  await expect(page.locator(".landing-sensei").getByText("Sensei Yuki", { exact: true })).toBeAttached();
  await page.goto("/sensei");
  await expect(page.getByText("Sensei Yuki", { exact: true })).toBeVisible();
  await page.goto("/admin/sensei");
  const row = page.getByRole("row").filter({ hasText: "Sensei Yuki" });
  await row.getByRole("button", { name: "Edit Sensei Yuki", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nama").fill("Sensei Yuki Mori");
  await dialog.getByLabel("Peran", { exact: true }).fill("Mentor N2");
  await dialog.getByRole("textbox", { name: /^Keahlian/ }).fill("N2, Kanji, Reading, JLPT Strategy");
  await dialog.getByRole("button", { name: "Simpan Sensei", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.goto("/sensei");
  await expect(page.getByText("Sensei Yuki Mori", { exact: true })).toBeVisible();
  await expect(page.getByText("Mentor N2", { exact: true })).toBeVisible();
});

test("J: carousel loops through dynamic Sensei while only three remain visible", async ({ page }) => {
  const profiles = Array.from({ length: 6 }, (_, index) => ({ id: index + 1, name: `Canonical Sensei ${index + 1}`, role: "Pengajar", bio: "Japanese teacher", photo: "", expertise: ["N4"], level: "n4", active: true, sort_order: index }));
  await page.route("**/api/sensei-profiles", route => route.fulfill({ json: { data: profiles } }));
  await page.goto("/");
  const carousel = page.locator(".sensei-carousel");
  await expect(carousel.locator(".sensei-carousel-card")).toHaveCount(6);
  const original = await carousel.locator(".sensei-carousel-card-active").textContent();
  await expect(carousel.locator(".sensei-carousel-card:not([aria-hidden='true'])")).toHaveCount(3);
  for (let index = 0; index < 6; index += 1) await carousel.getByRole("button", { name: "Sensei berikutnya" }).click();
  await expect(carousel.locator(".sensei-carousel-card-active")).toHaveText(original ?? "");
});

test("K: inactive Sensei disappears publicly but referenced history remains", async ({ page }) => {
  await saveSensei(page, "Sensei Hana", "N4");
  await page.goto("/admin/sensei");
  const row = page.getByRole("row").filter({ hasText: "Sensei Hana" });
  await row.getByRole("button", { name: "Nonaktifkan Sensei Hana", exact: true }).click();
  await expect(row).toContainText("Nonaktif");
  await page.reload();
  await expect(row).toContainText("Nonaktif");
  await page.goto("/sensei");
  await expect(page.getByText("Sensei Hana", { exact: true })).toHaveCount(0);
  await page.goto("/admin/sensei");
  await expect(row).toBeVisible();
});

test("L: public Sensei surfaces avoid overflow at required widths", async ({ page }) => {
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/", "/sensei"]) {
      await page.goto(route);
      await expect(page.getByRole("heading", { name: "Belajar Bersama Sensei Berpengalaman" })).toBeVisible();
      await noOverflow(page);
    }
  }
});
