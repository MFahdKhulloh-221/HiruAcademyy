import { expect, test, type Page } from "@playwright/test";

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
  await dialog.getByLabel("Role / title").fill(`Mentor ${specialization.split(",")[0]}`);
  await dialog.getByLabel("Bio singkat").fill("Sensei untuk kelas JLPT.");
  await dialog.getByLabel("Keahlian").fill(specialization);
  await dialog.getByLabel("Status").selectOption(status);
  await dialog.getByRole("button", { name: "Simpan" }).click();
}

test.beforeEach(async ({ page }) => clearStores(page));

test("A: Sensei specialization/status persist and remain selectable", async ({ page }) => {
  await saveSensei(page, "Hana", "JLPT N4, Percakapan");
  await page.reload();
  await expect(page.getByRole("table").getByText("Hana", { exact: true })).toBeVisible();
  await page.goto("/admin/kelas-jadwal");
  await page.getByRole("button", { name: "Tambah Kelas" }).click();
  await expect(page.getByRole("dialog").getByLabel("Sensei")).toContainText("Hana");
});

test("B-C: creates N4 class and session, persists, appears in Sensei schedule", async ({ page }) => {
  await page.goto("/admin/kelas-jadwal");
  await page.getByRole("button", { name: "Tambah Kelas" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nama kelas").fill("N4 Chapter 4 Hana");
  await dialog.getByLabel("Program").selectOption("N4");
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("tab", { name: "Sesi" }).click();
  await page.getByRole("button", { name: "Tambah Sesi" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Kelas").selectOption({ label: "N4 Chapter 4 Hana" });
  await dialog.getByLabel("Judul").fill("N4 Chapter 4 Hana");
  await dialog.getByLabel("Mulai").fill("2026-09-17T19:00");
  await dialog.getByLabel("Waktu Selesai").fill("2026-09-17T20:30");
  await dialog.getByLabel("Link Pertemuan").fill("https://meet.google.com/n4-hana");
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByRole("table")).toContainText("N4 Chapter 4 Hana");
  await page.goto("/schedule?membership=sensei");
  await expect(page.getByText("N4 Chapter 4 Hana")).toBeVisible();
});

test("D: schedule access gates Free and LMS, allows Sensei", async ({ page }) => {
  for (const membership of ["free", "lms"]) {
    await page.goto(`/schedule?membership=${membership}`);
    await expect(page.getByRole("heading", { name: "Fitur ini belum aktif pada membershipmu" })).toBeVisible();
  }
  await page.goto("/schedule?membership=sensei");
  await expect(page.getByRole("heading", { name: "Jadwal cohort dan sesi bersama Sensei" })).toBeVisible();
});

test("E: overlapping Sensei session is blocked with conflict message", async ({ page }) => {
  await page.goto("/admin/kelas-jadwal");
  await page.getByRole("tab", { name: "Sesi" }).click();
  await page.getByRole("button", { name: "Tambah Sesi" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Judul").fill("Sesi Konflik");
  await dialog.getByLabel("Mulai").fill("2026-09-20T19:30");
  await dialog.getByLabel("Waktu Selesai").fill("2026-09-20T20:30");
  await dialog.getByLabel("Link Pertemuan").fill("https://meet.google.com/conflict");
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await expect(dialog).toContainText(/konflik|tumpang tindih|sudah memiliki/i);
});

test("F-G: replay relation persists without duplicate and inactive Sensei cannot take new session", async ({ page }) => {
  await page.goto("/admin/kelas-jadwal");
  await page.getByRole("tab", { name: "Replay" }).click();
  await expect(page.getByText("Replay dikelola di Kurikulum & Materi")).toBeVisible();
  await page.goto("/admin/sensei");
  await page.getByRole("button", { name: "Nonaktifkan" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Nonaktifkan" }).click();
  await page.goto("/admin/kelas-jadwal");
  await page.getByRole("tab", { name: "Sesi" }).click();
  await page.getByRole("button", { name: "Tambah Sesi" }).click();
  await expect(page.getByRole("dialog").getByLabel("Kelas")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Simpan" })).toBeVisible();
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
  await row.getByRole("button", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nama").fill("Sensei Yuki Mori");
  await dialog.getByLabel("Role / title").fill("Mentor N2");
  await dialog.getByLabel("Keahlian").fill("N2, Kanji, Reading, JLPT Strategy");
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await page.goto("/sensei");
  await expect(page.getByText("Sensei Yuki Mori", { exact: true })).toBeVisible();
  await expect(page.getByText("Mentor N2", { exact: true })).toBeVisible();
});

test("J: carousel loops through dynamic Sensei while only three remain visible", async ({ page }) => {
  await saveSensei(page, "Sensei Enam", "N2, Listening");
  await page.goto("/");
  const carousel = page.locator(".sensei-carousel");
  await expect(carousel.locator(".sensei-carousel-card")).toHaveCount(6);
  await expect(carousel.locator(".sensei-carousel-card-active")).toContainText("Sensei Hilmy");
  await expect(carousel.locator(".sensei-carousel-card:not([aria-hidden='true'])")).toHaveCount(3);
  for (let index = 0; index < 6; index += 1) await carousel.getByRole("button", { name: "Sensei berikutnya" }).click();
  await expect(carousel.locator(".sensei-carousel-card-active")).toContainText("Sensei Hilmy");
});

test("K: inactive Sensei disappears publicly but referenced history remains", async ({ page }) => {
  await page.goto("/admin/sensei");
  const row = page.getByRole("row").filter({ hasText: "Sensei Hana" });
  await row.getByRole("button", { name: "Nonaktifkan" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Nonaktifkan" }).click();
  await expect(row).toContainText("Nonaktif");
  await expect(row.getByRole("button", { name: "Hapus" })).toHaveCount(0);
  await page.goto("/sensei");
  await expect(page.getByText("Sensei Hana", { exact: true })).toHaveCount(0);
  const relations = await page.evaluate((key) => { const store = JSON.parse(localStorage.getItem(key) || "null"); return { classSenseiIds: store.classes.map((item: { senseiId: string }) => item.senseiId), sessionSenseiIds: store.sessions.map((item: { senseiId: string }) => item.senseiId) }; }, operationsKey);
  expect(relations.classSenseiIds).toContain("sensei-hana");
  expect(relations.sessionSenseiIds).toContain("sensei-hana");
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
