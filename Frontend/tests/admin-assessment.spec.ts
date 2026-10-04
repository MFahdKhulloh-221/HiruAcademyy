import { expect, test, type Page } from "./canonical-fixture";

const storageKey = "hiru-admin-assessments:v1";
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

test("hub uses canonical family tabs search publication and program filters", async ({ page }) => {
  const assessment = { id: 7, program_id: 2, title: "Canonical N4 Try Out", status: "published", total_passing_score: null, questions: [] };
  await page.route("**/api/admin/try-outs", route => route.fulfill({ json: { data: [assessment] } }));
  await page.route("**/api/admin/try-outs/7", route => route.fulfill({ json: { data: assessment } }));
  await page.goto("/admin/bank-soal");
  for (const name of ["Audio", "Reading", "Mini Checkpoint", "Try Out"]) await expect(page.getByRole("tab", { name, exact: true })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: "Canonical N4 Try Out" });
  await expect(row).toBeVisible();
  await page.getByLabel("Cari Try Out", { exact: true }).fill("N4");
  await page.getByRole("combobox", { name: /^Konteks/ }).selectOption("N4");
  await page.getByRole("combobox", { name: /^Status/ }).selectOption("Published");
  await expect(row).toBeVisible();
  await page.getByRole("combobox", { name: /^Status/ }).selectOption("Draft");
  await expect(row).toHaveCount(0);
  await page.getByRole("combobox", { name: /^Status/ }).selectOption("");
  await expect(row).toBeVisible();
});

test("create and stored assessment hydrate without React or page errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && /hydration|same key|unique key/i.test(message.text())) errors.push(message.text()); });
  await page.route("**/api/admin/chapters", route => route.fulfill({ json: { data: [{ id: 7, program_id: 2, chapter_number: 1, title: "Chapter 1", sort_order: 0, status: "published" }] } }));
  await page.route("**/api/admin/audio-questions", route => route.fulfill({ json: { data: [{ id: 11, chapter_id: 7, title: "Stored audio", audio_url: "https://example.test/audio.mp3", question: "Stored prompt", options: { A: "First", B: "Second", C: "Third", D: "Fourth" }, correct_option: "A", explanation: "", sort_order: 0, status: "draft" }] } }));
  await page.goto("/admin/bank-soal/baru?type=audio");
  await expect(page.getByRole("heading", { name: "Audio", exact: true })).toBeVisible();
  await page.getByRole("row").filter({ hasText: "Stored prompt" }).getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("textbox", { name: "Pertanyaan", exact: true })).toHaveValue("Stored prompt");
  await expect(page.getByRole("dialog").getByLabel("Pilihan D", { exact: true })).toHaveValue("Fourth");
  expect(errors).toEqual([]);
});

test("invalid publish is blocked and saved draft stays absent for student", async ({ page }) => {
  await page.goto("/admin/bank-soal/baru?type=tryout");
  await page.getByRole("button", { name: "Tambah Try Out", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Simpan Try Out", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Isi judul");
  await dialog.getByLabel("Judul", { exact: true }).fill("Draft Rahasia");
  await dialog.getByRole("button", { name: "Simpan Try Out", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("row").filter({ hasText: "Draft Rahasia" })).toContainText("Draft");
  await page.route("**/api/student/try-outs", route => route.fulfill({ json: { data: [] } }));
  await page.goto("/tryout?membership=lms");
  await expect(page.getByRole("heading", { name: "Try Out", exact: true })).toBeVisible();
  await expect(page.getByText("Draft Rahasia")).toHaveCount(0);
});

test("reading question authoring saves draft/published and reaches practice runner", async ({ page }) => {
  await page.route("**/api/admin/chapters", route => route.fulfill({ json: { data: [{ id: 7, program_id: 2, chapter_number: 1, title: "Chapter 1", sort_order: 0, status: "published" }] } }));
  await page.route("**/api/admin/reading-passages", route => route.fulfill({ json: { data: [{ id: 1, chapter_id: 7, title: "Bacaan N4", body: "Teks bacaan.", status: "published" }] } }));
  const questions: Record<string, unknown>[] = [];
  await page.route("**/api/admin/reading-questions**", async route => {
    if (route.request().method() === "POST") { const row = { ...route.request().postDataJSON(), id: 101 }; questions.push(row); await route.fulfill({ status: 201, json: { data: row } }); return; }
    await route.fulfill({ json: { data: questions } });
  });
  await page.goto("/admin/bank-soal/baru?type=reading");
  await expect(page.getByRole("heading", { name: "Reading", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Tambah Soal", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: /^Teks bacaan/ }).selectOption("1");
  await dialog.getByRole("textbox", { name: "Pertanyaan", exact: true }).fill("Reading prompt satu");
  for (const letter of ["A", "B", "C", "D"]) await dialog.getByLabel(`Pilihan ${letter}`, { exact: true }).fill(`Opsi ${letter}`);
  await dialog.getByRole("combobox", { name: /^Jawaban benar/ }).selectOption("A");
  await dialog.getByRole("combobox", { name: /^Status/ }).selectOption("published");
  await dialog.getByRole("button", { name: "Simpan Soal", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("table").getByText("Reading prompt satu")).toBeVisible();
});

test("Try Out created through Admin stores total passing score and publishes", async ({ page }) => {
  const tryouts: Record<string, unknown>[] = [];
  await page.route("**/api/admin/try-outs**", async route => {
    if (route.request().method() === "POST") { const row = { ...route.request().postDataJSON(), id: 21, questions: [] }; tryouts.push(row); await route.fulfill({ status: 201, json: { data: row } }); return; }
    if (route.request().method() === "PATCH") { const row = tryouts[0]; Object.assign(row, route.request().postDataJSON()); await route.fulfill({ json: { data: row } }); return; }
    await route.fulfill({ json: { data: route.request().url().endsWith("/21") ? tryouts[0] : tryouts } });
  });
  await page.goto("/admin/bank-soal/baru?type=tryout");
  await page.getByRole("button", { name: "Tambah Try Out", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Judul", { exact: true }).fill("Try Out N4 Try Out 02");
  await dialog.getByRole("combobox", { name: /^Konteks/ }).selectOption("N4");
  await dialog.getByLabel("Passing score total", { exact: true }).fill("90");
  await dialog.getByRole("button", { name: "Simpan Try Out", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("table").getByText("Try Out N4 Try Out 02")).toBeVisible();
});

test("Mini Checkpoint question workspace validates options, session, part, duration and saves draft", async ({ page }) => {
  await page.route("**/api/admin/chapters", route => route.fulfill({ json: { data: [{ id: 7, program_id: 2, chapter_number: 1, title: "Chapter 1", sort_order: 0, status: "published" }] } }));
  const questions: Record<string, unknown>[] = [];
  await page.route("**/api/admin/mini-checkpoint-questions**", async route => {
    if (route.request().method() === "POST") { const row = { ...route.request().postDataJSON(), id: 50 }; questions.push(row); await route.fulfill({ status: 201, json: { data: row } }); return; }
    await route.fulfill({ json: { data: questions } });
  });
  await page.goto("/admin/bank-soal/baru?type=mini");
  await expect(page.getByRole("heading", { name: "Mini Checkpoint", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Tambah Soal", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: /^Chapter/ }).selectOption("7");
  await dialog.getByLabel("Sesi", { exact: true }).fill("2");
  await dialog.getByLabel("Part", { exact: true }).fill("3");
  await dialog.getByLabel("Durasi (menit)", { exact: true }).fill("20");
  await dialog.getByRole("textbox", { name: "Pertanyaan", exact: true }).fill("Mini admin prompt");
  for (const letter of ["A", "B", "C", "D"]) await dialog.getByLabel(`Pilihan ${letter}`, { exact: true }).fill(`Pilihan ${letter}`);
  await dialog.getByRole("combobox", { name: /^Jawaban benar/ }).selectOption("B");
  await dialog.getByRole("button", { name: "Simpan Soal", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("table").getByText("Mini admin prompt")).toBeVisible();
  expect(questions[0]).toMatchObject({ session: 2, part: 3, duration_minutes: 20 });
});

test("audio question builder saves and publishes persisted Admin fields", async ({ page }) => {
  await page.route("**/api/admin/chapters", route => route.fulfill({ json: { data: [{ id: 7, program_id: 2, chapter_number: 1, title: "Chapter 1", sort_order: 0, status: "published" }] } }));
  const questions: Record<string, unknown>[] = [];
  await page.route("**/api/admin/audio-questions**", async route => {
    if (route.request().method() === "POST") { const row = { ...route.request().postDataJSON(), id: 80 }; questions.push(row); await route.fulfill({ status: 201, json: { data: row } }); return; }
    await route.fulfill({ json: { data: questions } });
  });
  await page.goto("/admin/bank-soal/baru?type=audio");
  await page.getByRole("button", { name: "Tambah Soal", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: /^Chapter/ }).selectOption("7");
  await dialog.getByLabel("Judul", { exact: true }).fill("Audio Choukai 1");
  await dialog.getByLabel("URL audio", { exact: true }).fill("https://example.test/choukai.mp3");
  await dialog.getByRole("textbox", { name: "Pertanyaan", exact: true }).fill("Pertanyaan Choukai 1");
  for (const letter of ["A", "B", "C", "D"]) await dialog.getByLabel(`Pilihan ${letter}`, { exact: true }).fill(`Opsi ${letter}`);
  await dialog.getByRole("combobox", { name: /^Jawaban benar/ }).selectOption("C");
  await dialog.getByRole("combobox", { name: /^Status/ }).selectOption("published");
  await dialog.getByRole("button", { name: "Simpan Soal", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("table").getByText("Pertanyaan Choukai 1")).toBeVisible();
  await expect(page.getByRole("table")).toContainText("Published");
});

test("question reordering in Try Out persists via question sort order", async ({ page }) => {
  const questions = [
    { id: 1, session: "vocabulary_kanji", question: "Question A", options: { A: "1", B: "2", C: "3", D: "4" }, correct_option: "A", sort_order: 1, status: "draft" },
    { id: 2, session: "vocabulary_kanji", question: "Question B", options: { A: "1", B: "2", C: "3", D: "4" }, correct_option: "B", sort_order: 2, status: "draft" }
  ];
  await page.route("**/api/admin/try-outs/7**", async route => {
    await route.fulfill({ json: { data: { id: 7, program_id: 2, title: "Reorder Tryout", status: "draft", total_passing_score: null, questions } } });
  });
  await page.goto("/admin/bank-soal");
  await expect(page.getByRole("heading", { name: "Try Out", exact: true })).toBeVisible();
});

test("bank-soal hub stays usable at supported responsive widths", async ({ page }) => {
  await page.route("**/api/admin/try-outs", route => route.fulfill({ json: { data: [{ id: 7, program_id: 2, title: "Responsive Practice", status: "draft", total_passing_score: null }] } }));
  await page.route("**/api/admin/try-outs/7", route => route.fulfill({ json: { data: { id: 7, program_id: 2, title: "Responsive Practice", status: "draft", total_passing_score: null, questions: [] } } }));

  for (const width of responsiveWidths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin/bank-soal");
    await expect(page.getByRole("heading", { name: "Try Out", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Mini Checkpoint", exact: true })).toBeVisible();
    const table = page.locator(".admin-data-table-wrap");
    await expect(table).toBeVisible();
    await expect(table.getByRole("row", { name: /Responsive Practice/ })).toBeVisible();
    expect(await table.evaluate((element) => element.scrollWidth <= element.clientWidth || getComputedStyle(element).overflowX === "auto")).toBe(true);
    await expectNoHorizontalOverflow(page);
  }
});

test("canonical assessment question editor stays usable at supported responsive widths", async ({ page }) => {
  await page.route("**/api/admin/chapters", route => route.fulfill({ json: { data: [{ id: 7, program_id: 2, chapter_number: 1, title: "Chapter 1", status: "published", sort_order: 0 }] } }));
  for (const width of responsiveWidths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin/bank-soal/baru?type=audio");
    await expect(page.getByRole("heading", { name: "Audio", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Tambah Soal", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("textbox", { name: "Pertanyaan", exact: true })).toBeVisible();
    for (const letter of ["A", "B", "C", "D"]) await expect(dialog.getByLabel(`Pilihan ${letter}`, { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
});

test("mobile canonical question saves A-D options and correct answer and survives reload without overflow", async ({ page }) => {
  await page.route("**/api/admin/chapters", route => route.fulfill({ json: { data: [{ id: 7, program_id: 2, chapter_number: 1, title: "Chapter 1", status: "published", sort_order: 0 }] } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/bank-soal/baru?type=audio");
  await page.getByRole("button", { name: "Tambah Soal", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: /^Chapter/ }).selectOption("7");
  await dialog.getByLabel("Judul", { exact: true }).fill("Mobile Audio");
  await dialog.getByLabel("URL audio", { exact: true }).fill("https://example.test/audio.mp3");
  await dialog.getByRole("textbox", { name: "Pertanyaan", exact: true }).fill("Mobile prompt");
  for (const letter of ["A", "B", "C", "D"]) await dialog.getByLabel(`Pilihan ${letter}`, { exact: true }).fill(`Option ${letter}`);
  await dialog.getByRole("combobox", { name: /^Jawaban benar/ }).selectOption("D");
  await dialog.getByRole("button", { name: "Simpan Soal", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await page.getByRole("row").filter({ hasText: "Mobile prompt" }).getByRole("button", { name: "Edit", exact: true }).click();
  await expect(dialog.getByLabel("Pilihan D", { exact: true })).toHaveValue("Option D");
  await expect(dialog.getByRole("combobox", { name: /^Jawaban benar/ })).toHaveValue("D");
  await expectNoHorizontalOverflow(page);
});
