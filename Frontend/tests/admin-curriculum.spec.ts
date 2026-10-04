import { expect, test, type Page } from "./canonical-fixture";

const storageKey = "hiru-admin-curriculum:v1";
const responsiveWidths = [360, 390, 768, 820, 1024, 1440];

async function expectNoHorizontalOverflow(page: Page) {
  const result = await page.evaluate(() => ({
    body: document.body.scrollWidth <= document.body.clientWidth,
    page: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  }));
  expect(result).toEqual({ body: true, page: true });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate((key) => localStorage.removeItem(key), storageKey);
});

test("Scenario A: canonical offer hub lists server plans and searches without inventing foundation pricing", async ({ page }) => {
  await page.goto("/admin/program-harga");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Harga & Promo");
  const table = page.getByRole("table", { name: "Harga dan pratinjau promo" });
  await expect(table.getByRole("cell", { name: "JLPT N5", exact: true })).toHaveCount(2);
  await expect(table.getByRole("cell", { name: "JLPT N4", exact: true })).toHaveCount(2);
  await expect(table.getByRole("cell", { name: "DASAR", exact: true })).toHaveCount(0);
  const search = page.getByLabel("Cari program", { exact: true });
  await search.fill("N4");
  await expect(table.getByRole("cell", { name: "JLPT N5", exact: true })).toHaveCount(0);
  await expect(table.getByRole("cell", { name: "JLPT N4", exact: true })).toHaveCount(2);
  await search.clear();
  await expect(table.getByRole("cell", { name: "JLPT N5", exact: true })).toHaveCount(2);
  await expect(table).toContainText("6 bulan");
  await expect(table).toContainText("1 bulan");
});

test("Scenario B: canonical price editor validates nonnegative integer and persists without changing duration", async ({ page }) => {
  await page.goto("/admin/program-harga");
  await page.getByRole("button", { name: "Edit Harga JLPT N5 Belajar Mandiri", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Harga normal", { exact: true }).fill("-1");
  await dialog.getByRole("button", { name: "Simpan harga", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.getByLabel("Harga normal", { exact: true }).fill("149000");
  await dialog.getByRole("button", { name: "Simpan harga", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  const row = page.getByRole("row").filter({ has: page.getByRole("button", { name: "Edit Harga JLPT N5 Belajar Mandiri", exact: true }) });
  await expect(row).toContainText("Rp149.000");
  await expect(row).toContainText("6 bulan");
});

test("Scenario C: canonical catalog cannot be deleted through price management", async ({ page }) => {
  await page.goto("/admin/program-harga");
  const table = page.getByRole("table", { name: "Harga dan pratinjau promo" });
  await expect(table.getByRole("cell", { name: "JLPT N4", exact: true })).toHaveCount(2);
  await expect(table.getByRole("button", { name: "Hapus", exact: true })).toHaveCount(0);
  await page.reload();
  await expect(table.getByRole("cell", { name: "JLPT N4", exact: true })).toHaveCount(2);
});

test("Scenario D: canonical chapter creation validates positive integer chapter and persists via API", async ({ page }) => {
  const chapters: Record<string, unknown>[] = [];
  await page.route("**/api/admin/chapters**", async route => {
    if (route.request().method() === "POST") { const row = { ...route.request().postDataJSON(), id: 10 }; chapters.push(row); await route.fulfill({ status: 201, json: { data: row } }); return; }
    await route.fulfill({ json: { data: chapters } });
  });
  await page.goto("/admin/kurikulum-materi");
  await page.getByRole("button", { name: "Tambah Chapter", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Chapter", { exact: true }).fill("99");
  await dialog.getByLabel("Judul", { exact: true }).fill("Chapter 99: Percakapan Penutup");
  await dialog.getByLabel("Deskripsi", { exact: true }).fill("Membahas kesimpulan percakapan.");
  await dialog.getByRole("combobox", { name: /^Status/ }).selectOption("published");
  await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("table").getByText("Chapter 99: Percakapan Penutup")).toBeVisible();
});

test("Scenario E: canonical chapter order persists and confirmed deletion removes only selected chapter", async ({ page }) => {
  let chapters = [{ id: 7, program_id: 1, chapter_number: 1, title: "First Chapter", description: "", sort_order: 0, status: "draft" }, { id: 8, program_id: 1, chapter_number: 2, title: "Second Chapter", description: "", sort_order: 1, status: "draft" }];
  await page.route("**/api/admin/chapters**", async route => {
    const id = Number(new URL(route.request().url()).pathname.split("/").at(-1));
    if (route.request().method() === "PATCH") Object.assign(chapters.find(row => row.id === id)!, route.request().postDataJSON());
    if (route.request().method() === "DELETE") { chapters = chapters.filter(row => row.id !== id); await route.fulfill({ status: 204 }); return; }
    await route.fulfill({ json: { data: Number.isFinite(id) ? chapters.find(row => row.id === id) : chapters.sort((a, b) => a.sort_order - b.sort_order) } });
  });
  await page.goto("/admin/kurikulum-materi");
  let row = page.getByRole("row").filter({ hasText: "First Chapter" });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Urutan", { exact: true }).fill("2");
  await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("table").getByRole("row").nth(1)).toContainText("Second Chapter");
  row = page.getByRole("row").filter({ hasText: "Second Chapter" });
  page.once("dialog", dialog => dialog.dismiss());
  await row.getByRole("button", { name: "Hapus", exact: true }).click();
  await expect(row).toBeVisible();
  page.once("dialog", dialog => dialog.accept());
  await row.getByRole("button", { name: "Hapus", exact: true }).click();
  await expect(row).toHaveCount(0);
  await expect(page.getByRole("row").filter({ hasText: "First Chapter" })).toBeVisible();
});

test("Scenario F: canonical flashcard card authoring manages reading/meaning and persists order", async ({ page }) => {
  await page.route("**/api/admin/chapters", route => route.fulfill({ json: { data: [{ id: 7, program_id: 1, chapter_number: 1, title: "Chapter 1", status: "published", sort_order: 0 }] } }));
  const cards = [{ id: 11, chapter_id: 7, japanese: "猫", reading: "ねこ", meaning: "Kucing", example: "", sort_order: 0, status: "draft" }];
  await page.route("**/api/admin/flashcards**", async route => {
    const id = Number(new URL(route.request().url()).pathname.split("/").at(-1));
    if (route.request().method() === "POST") { const row = { ...route.request().postDataJSON(), id: 12 }; cards.push(row); await route.fulfill({ status: 201, json: { data: row } }); return; }
    await route.fulfill({ json: { data: Number.isFinite(id) ? cards.find(row => row.id === id) : cards } });
  });
  await page.goto("/admin/kurikulum-materi?tab=Flashcard");
  await expect(page.getByRole("table").getByText("猫")).toBeVisible();
  await page.getByRole("button", { name: "Tambah Kartu", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Japanese", { exact: true }).fill("犬");
  await dialog.getByLabel("Bacaan", { exact: true }).fill("いぬ");
  await dialog.getByLabel("Arti", { exact: true }).fill("Anjing");
  await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("table").getByText("犬")).toBeVisible();
});

test("Scenario G: library follows module projection and replay videos manage youtube class recordings", async ({ page }) => {
  await page.route("**/api/admin/replay-playlists", route => route.fulfill({ json: { data: [{ id: 7, program_id: 1, title: "N5 Replay Playlist", status: "published", sort_order: 0 }] } }));
  const videos = [{ id: 91, playlist_id: 7, title: "Live Q&A Persiapan JLPT N5", video_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", duration_minutes: 90, status: "published", sort_order: 0 }];
  await page.route("**/api/admin/replay-videos**", async route => {
    if (route.request().method() === "POST") { const row = { ...route.request().postDataJSON(), id: 92 }; videos.push(row); await route.fulfill({ status: 201, json: { data: row } }); return; }
    await route.fulfill({ json: { data: videos } });
  });
  await page.goto("/admin/kurikulum-materi");
  await page.getByRole("tab", { name: "Perpustakaan Materi" }).click();
  await expect(page.getByText("Perpustakaan Materi mengikuti modul published pada chapter.")).toBeVisible();
  await page.goto("/admin/kelas-jadwal");
  await page.getByRole("tab", { name: "Replay" }).click();
  await expect(page.getByRole("table").getByText("N5 Replay Playlist")).toBeVisible();
});

test("program & harga hub stays usable at supported responsive widths", async ({ page }) => {
  for (const width of responsiveWidths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin/program-harga");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Harga & Promo");
    await expect(page.getByRole("table", { name: "Harga dan pratinjau promo" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test("program & harga editor stays usable at supported responsive widths", async ({ page }) => {
  for (const width of responsiveWidths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin/program-harga");
    await page.getByRole("button", { name: "Edit Harga JLPT N5 Belajar Mandiri", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Edit Harga", exact: true })).toBeVisible();
    await expect(dialog.getByLabel("Harga normal", { exact: true })).toHaveValue("99000");
    await expect(dialog.getByRole("button", { name: "Simpan harga", exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test("kurikulum & materi hub stays usable at supported responsive widths", async ({ page }) => {
  for (const width of responsiveWidths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin/kurikulum-materi");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Kurikulum & Materi");
    await expect(page.getByRole("tab", { name: "Kurikulum" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Flashcard" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test("kurikulum & materi canonical chapter editor stays usable at supported responsive widths", async ({ page }) => {
  await page.route("**/api/admin/chapters", route => route.fulfill({ json: { data: [{ id: 7, program_id: 1, chapter_number: 1, title: "Canonical Chapter", description: "Description", sort_order: 0, status: "draft" }] } }));
  for (const width of responsiveWidths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin/kurikulum-materi");
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Judul", { exact: true })).toHaveValue("Canonical Chapter");
    await expect(dialog.getByRole("button", { name: "Simpan", exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
});
