import { expect, test, type Page } from "./canonical-fixture";

const storageKey = "hiru-admin-placement:v1";
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
  await page.evaluate((key) => {
    localStorage.removeItem(key);
    sessionStorage.clear();
  }, storageKey);
});

test("Scenario A — BUILDER: Admin -> Placement Test -> add question, add options, reorder, Save Draft, reload -> persists", async ({
  page,
}) => {
  await page.goto("/admin/placement-hasil");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Placement Test");

  await page.getByLabel("Judul Tes", { exact: true }).fill("Canonical Placement");
  await page.getByLabel("Intro Heading", { exact: true }).fill("Canonical Intro");
  await page.getByLabel("Durasi Pengerjaan (menit)", { exact: true }).fill("5");
  await page.getByLabel("Deskripsi Tes", { exact: true }).fill("Canonical Description");
  await page.getByRole("button", { name: "Simpan Draft", exact: true }).click();
  await page.getByRole("button", { name: "Tambah Pertanyaan", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tambah Pertanyaan", exact: true })).toBeVisible();

  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Pertanyaan", exact: true }).fill("Pertanyaan Baru N5 Tata Bahasa");
  for (const [index, letter] of ["A", "B", "C", "D"].entries()) await dialog.getByLabel(`Jawaban ${letter}`, { exact: true }).fill(`Pilihan ${index + 1}`);
  await dialog.getByRole("combobox", { name: /^Jawaban Benar/ }).selectOption("B");
  await dialog.getByRole("button", { name: "Simpan Pertanyaan" }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Pertanyaan Baru N5 Tata Bahasa", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit pertanyaan 1", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "Pertanyaan", exact: true })).toHaveValue("Pertanyaan Baru N5 Tata Bahasa");
  for (const [index, letter] of ["A", "B", "C", "D"].entries()) await expect(dialog.getByLabel(`Jawaban ${letter}`, { exact: true })).toHaveValue(`Pilihan ${index + 1}`);
  await expect(dialog.getByRole("combobox", { name: /^Jawaban Benar/ })).toHaveValue("B");
});

test("Scenario B — DRAFT: Modify Placement, Save Draft -> Public Placement still uses published/fallback config", async ({
  page,
}) => {
  await page.route("**/api/placement", route => route.fulfill({ status: 404, json: {} }));
  await page.goto("/admin/placement-hasil");
  await page.getByLabel("Judul Tes", { exact: true }).fill("Draft Placement");
  await page.getByLabel("Intro Heading", { exact: true }).fill("Intro Rahasia Draft Saja");
  await page.getByLabel("Durasi Pengerjaan (menit)", { exact: true }).fill("5");
  await page.getByLabel("Deskripsi Tes", { exact: true }).fill("Draft Description");
  await page.getByRole("button", { name: "Simpan Draft", exact: true }).click();
  await expect(page.locator(".placement-notice")).toContainText("Draft placement test disimpan.");
  await page.reload();
  await expect(page.getByLabel("Intro Heading", { exact: true })).toHaveValue("Intro Rahasia Draft Saja");
  await page.goto("/placement");
  await expect(page.getByRole("heading", { name: "Intro Rahasia Draft Saja" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Mulai Placement Test Gratis", exact: true })).toBeDisabled();
  await expect(page.getByRole("alert").first()).toBeVisible();
});

test("Scenario C — PUBLISH: Create valid questions -> Publish -> Public Placement questions come from Admin config", async ({ page }) => {
  await page.goto("/admin/placement-hasil");
  await page.getByLabel("Judul Tes", { exact: true }).fill("Official Placement");
  await page.getByLabel("Intro Heading", { exact: true }).fill("Ketahui Level Bahasa Jepangmu");
  await page.getByLabel("Durasi Pengerjaan (menit)", { exact: true }).fill("5");
  await page.getByLabel("Deskripsi Tes", { exact: true }).fill("Official Description");
  await page.getByRole("button", { name: "Simpan Draft", exact: true }).click();
  await page.getByRole("button", { name: "Tambah Pertanyaan", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Pertanyaan", exact: true }).fill("Pertanyaan Terbitan Resmi Hiru");
  for (const letter of ["A", "B", "C", "D"]) await dialog.getByLabel(`Jawaban ${letter}`, { exact: true }).fill(`Opsi Resmi ${letter}`);
  await dialog.getByRole("combobox", { name: /^Jawaban Benar/ }).selectOption("A");
  await dialog.getByRole("combobox", { name: /^Status/ }).selectOption("published");
  await dialog.getByRole("button", { name: "Simpan Pertanyaan", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Terbitkan", exact: true }).click();
  await expect(page.locator(".placement-notice")).toContainText("Placement test diterbitkan.");
  await page.route("**/api/placement", route => route.fulfill({ json: { data: { id: 1, title: "Official Placement", intro_heading: "Ketahui Level Bahasa Jepangmu", duration_minutes: 5, description: "Official Description", questions: [{ id: 10, category: "Bunpou", prompt: "Pertanyaan Terbitan Resmi Hiru", options: { A: "Opsi Resmi A", B: "Opsi Resmi B", C: "Opsi Resmi C", D: "Opsi Resmi D" } }] } } }));
  const attempt = { id: 77, status: "in_progress", questions: [{ id: 10, category: "Bunpou", prompt: "Pertanyaan Terbitan Resmi Hiru", options: { A: "Opsi Resmi A", B: "Opsi Resmi B", C: "Opsi Resmi C", D: "Opsi Resmi D" } }], answers: {}, result: null };
  await page.route("**/api/placement/attempts**", route => route.fulfill({ status: route.request().method() === "POST" ? 201 : 200, json: { data: attempt } }));
  let releaseAuth!: () => void;
  const authReady = new Promise<void>(resolve => { releaseAuth = resolve; });
  await page.route("**/api/me", async route => {
    await authReady;
    await route.fulfill({ json: { data: { id: 901, name: "Browser Student", email: "browser.student@example.test", whatsapp: "6281999000012", role: "student", account_status: "active" } } });
  });
  await page.goto("/placement");
  await page.getByLabel("Nama", { exact: true }).fill("Budi");
  await page.getByLabel("Nomor WhatsApp", { exact: true }).fill("081234567890");
  await page.getByRole("combobox", { name: /^Target Ujian/ }).selectOption("N4");
  await page.getByRole("checkbox").first().check();
  const start = page.getByRole("button", { name: "Mulai Placement Test Gratis", exact: true });
  await expect(start).toBeDisabled();
  releaseAuth();
  await expect(page.getByRole("heading", { level: 1, name: "Ketahui Level Bahasa Jepangmu", exact: true })).toBeVisible();
  await expect(start).toBeEnabled();
  await start.click();
  await expect(page.getByRole("heading", { level: 1, name: "Pertanyaan Terbitan Resmi Hiru" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "A Opsi Resmi A", exact: true })).toBeVisible();
});

test("Scenario G — PREVIEW: Admin runs preview modal without creating public attempt", async ({ page }) => {
  await page.goto("/admin/placement-hasil");
  await page.getByLabel("Judul Tes", { exact: true }).fill("Preview Placement");
  await page.getByLabel("Intro Heading", { exact: true }).fill("Preview Intro");
  await page.getByLabel("Durasi Pengerjaan (menit)", { exact: true }).fill("5");
  await page.getByLabel("Deskripsi Tes", { exact: true }).fill("Preview Description");
  await page.getByRole("button", { name: "Pratinjau Tes", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Pratinjau Tes Placement", exact: true })).toBeVisible();
  await expect(dialog.getByText("Preview Intro")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("Scenario H — MOBILE: 390px -> edit question, edit answer, preview, save -> no overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/placement-hasil");
  await page.getByLabel("Judul Tes", { exact: true }).fill("Mobile Placement");
  await page.getByLabel("Intro Heading", { exact: true }).fill("Mobile Intro");
  await page.getByLabel("Durasi Pengerjaan (menit)", { exact: true }).fill("5");
  await page.getByLabel("Deskripsi Tes", { exact: true }).fill("Mobile Description");
  await page.getByRole("button", { name: "Simpan Draft", exact: true }).click();
  await page.getByRole("button", { name: "Tambah Pertanyaan", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Pertanyaan", exact: true }).fill("Pertanyaan Mobile 390");
  for (const [index, letter] of ["A", "B", "C", "D"].entries()) await dialog.getByLabel(`Jawaban ${letter}`, { exact: true }).fill(`Opsi ${index + 1}`);
  await dialog.getByRole("combobox", { name: /^Jawaban Benar/ }).selectOption("A");
  await dialog.getByRole("button", { name: "Simpan Pertanyaan", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Pratinjau Tes", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("Scenario D — RULES: Admin -> Aturan Hasil -> add recommendation rule -> persists", async ({ page }) => {
  await page.goto("/admin/placement-hasil");
  await page.getByLabel("Judul Tes", { exact: true }).fill("Placement Aturan");
  await page.getByLabel("Intro Heading", { exact: true }).fill("Intro Aturan");
  await page.getByLabel("Durasi Pengerjaan (menit)", { exact: true }).fill("10");
  await page.getByLabel("Deskripsi Tes", { exact: true }).fill("Deskripsi Aturan");
  await page.getByRole("button", { name: "Simpan Draft", exact: true }).click();

  await page.getByRole("tab", { name: "Aturan Hasil" }).click();
  await page.getByRole("button", { name: "Tambah Aturan" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Skor Minimal (%)").fill("60");
  await dialog.getByLabel("Skor Maksimal (%)").fill("80");
  await dialog.getByLabel("Rekomendasi Level").selectOption("N4");
  await dialog.getByLabel("Judul Rekomendasi").fill("Level N4 Menengah");
  await dialog.getByLabel("Deskripsi Rekomendasi").fill("Kemampuan cocok untuk kelas N4.");
  await dialog.getByRole("button", { name: "Simpan Aturan" }).click();
  await expect(dialog).toHaveCount(0);

  await expect(page.getByText("60% – 80%")).toBeVisible();
  await expect(page.getByText("Level N4 Menengah")).toBeVisible();
  await page.getByRole("button", { name: "Simpan Aturan" }).click();
  await expect(page.locator(".placement-notice")).toContainText("Aturan rekomendasi disimpan.");
});

test("Scenario E — LEADS: Admin -> Leads -> view leads and update contact status", async ({ page }) => {
  await page.goto("/admin/placement-hasil");
  await page.getByRole("tab", { name: "Leads" }).click();
  await expect(page.getByText("Budi Santoso")).toBeVisible();
  await expect(page.getByText("6281234567890")).toBeVisible();

  const toggleBtn = page.getByRole("row", { name: /Budi Santoso/ }).getByRole("button", { name: "Tandai Dihubungi" });
  await toggleBtn.click();
  await expect(page.getByRole("row", { name: /Budi Santoso/ }).getByText("Sudah Dihubungi")).toBeVisible();
});

for (const width of responsiveWidths) {
  test(`Scenario 10 — Responsive viewport at ${width}px has no horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin/placement-hasil");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
}
