import { expect, test, type Page } from "./canonical-fixture";

test("duration edit validates, persists on refresh, and clears to null", async ({ page }) => {
  const api = await mock(page);
  await page.goto("/admin/try-out");
  const row = page.getByRole("row").filter({ hasText: "Try Out 7" });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  const duration = page.getByLabel("Durasi (menit)", { exact: true });
  await expect(duration).toBeEnabled();
  for (const value of ["0", "-1", "1.5"]) {
    await duration.fill(value);
    await page.getByRole("button", { name: "Simpan Try Out", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText("bilangan bulat positif");
    expect(api.writes).toHaveLength(0);
  }
  await duration.fill("90");
  await page.getByRole("button", { name: "Simpan Try Out", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(api.writes[0].body).toMatchObject({ duration_minutes: 90 });
  expect(api.writes.filter(write => write.path.includes("/questions"))).toHaveLength(0);
  await page.reload();
  await expect(row).toContainText("90 menit");
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(duration).toHaveValue("90");
  await duration.fill("");
  await page.getByRole("button", { name: "Simpan Try Out", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(api.writes[2].body).toMatchObject({ duration_minutes: null });
  await page.reload();
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(duration).toHaveValue("");
});

const sessions = ["vocabulary_kanji", "grammar", "reading", "audio"];
const labels = ["Kosakata & Kanji", "Tata Bahasa", "Reading / Dokkai", "Audio / Choukai"];
function fixture(id = 7) {
  return { id, max_score: 180, sort_order: 1, session_passing_scores: null as Record<string, number> | null, program_id: 1, title: `Try Out ${id}`, status: "draft", total_passing_score: 1, questions: sessions.flatMap((session, section) => Array.from({ length: 25 }, (_, index) => ({ id: id * 1000 + section * 25 + index, session, question: `Question ${section}-${index}`, options: { A: "First", B: "Second", C: "Third", D: "Fourth" }, correct_option: "A", explanation: "", reading_passage: session === "reading" ? "Passage" : null, audio_url: session === "audio" ? "media/audio.mp3" : null, point_value: index < 20 ? 2 : 1, sort_order: index, status: "draft" }))) };
}
async function mock(page: Page, items = [fixture()]) {
  await page.route("**/api/admin/programs", route => route.fulfill({ json: { data: [1, 2].map((id, index) => ({ id, code: index ? "n4" : "n5", name: index ? "JLPT N4" : "JLPT N5", family: "jlpt", status: "active" })) } }));
  const writes: { path: string; method: string; body: unknown }[] = [];
  let release: (() => void) | undefined;
  let failure = 0;
  let hold = false;
  await page.route("**/api/admin/try-outs**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const item = items.find(item => item.id === Number(path.split("/")[4]));
    if (request.method() === "GET") { await route.fulfill({ json: { data: item ?? items } }); return; }
    writes.push({ path, method: request.method(), body: request.postData() ? request.postDataJSON() : null });
    if (hold) await new Promise<void>(resolve => { release = resolve; });
    if (failure) { await route.fulfill({ status: failure, json: { errors: { "questions.0.audio_url": ["Audio is required."] } } }); return; }
    if (path.endsWith("/questions/publish")) {
      item!.questions.forEach(question => { question.status = "published"; });
      await route.fulfill({ json: { data: { try_out_id: item!.id, published_count: item!.questions.length } } }); return;
    }
    const body = request.postDataJSON();
    if (path.endsWith("/questions") && request.method() === "POST") {
      const question = { ...body, id: 99999 };
      item!.questions.push(question);
      await route.fulfill({ json: { data: question } }); return;
    }
    if (path.includes("/questions/")) Object.assign(item!.questions.find(question => question.id === Number(path.split("/").at(-1)))!, body);
    else Object.assign(item!, body);
    await route.fulfill({ json: { data: item } });
  });
  return { writes, hold: () => { hold = true; }, release: () => { hold = false; release?.(); }, fail: (status: number) => { failure = status; } };
}

test("bulk publish is explicit, guarded, scoped, and parent publish only patches status", async ({ page }) => {
  const api = await mock(page, [fixture(), fixture(8)]);
  await page.goto("/admin/try-out");
  const row = page.getByRole("row").filter({ hasText: "Try Out 7" });
  await expect(row).toContainText("100 Draft • 0 Published");
  api.hold();
  await row.getByRole("button", { name: "Publish Semua Soal", exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect.poll(() => api.writes.length).toBe(1);
  const publishing = row.getByRole("button", { name: "Mempublikasikan Semua Soal…", exact: true });
  await expect(publishing).toBeDisabled();
  await expect(publishing).toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("row").filter({ hasText: "Try Out 8" }).getByRole("button", { name: "Publish Semua Soal", exact: true })).toHaveAttribute("aria-busy", "false");
  expect(api.writes[0]).toEqual({ path: "/api/admin/try-outs/7/questions/publish", method: "POST", body: null });
  api.release();
  await expect(row).toContainText("0 Draft • 100 Published");
  await expect(page.getByRole("row").filter({ hasText: "Try Out 8" })).toContainText("100 Draft • 0 Published");
  api.hold();
  await row.getByRole("button", { name: "Publish", exact: true }).click();
  await expect.poll(() => api.writes.length).toBe(2);
  await expect(row.getByRole("button", { name: "Mempublikasikan…", exact: true })).toHaveAttribute("aria-busy", "true");
  api.release();
  await expect(row.getByRole("button", { name: "Draft", exact: true })).toHaveAttribute("aria-busy", "false");
  expect(api.writes).toHaveLength(2);
  expect(api.writes[1]).toEqual({ path: "/api/admin/try-outs/7", method: "PATCH", body: { status: "published" } });
});

test("zero order draft saves patch only edited question and never bulk publish", async ({ page }) => {
  const api = await mock(page);
  await page.goto("/admin/try-out");
  await page.getByRole("row").filter({ hasText: "Try Out 7" }).getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Edit Question 0-0", exact: true }).click();
  const question = page.getByRole("dialog");
  await expect(question.getByLabel("Urutan", { exact: true })).toHaveAttribute("min", "0");
  await question.getByLabel("Urutan", { exact: true }).fill("-1");
  await question.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(question.getByRole("alert")).toContainText("nonnegatif");
  await question.getByLabel("Urutan", { exact: true }).fill("0");
  await question.getByRole("textbox", { name: "Pertanyaan", exact: true }).fill("Edited question");
  await question.getByRole("button", { name: "Simpan", exact: true }).click();
  api.hold();
  await page.getByRole("dialog").getByRole("button", { name: "Simpan Try Out", exact: true }).click();
  await expect.poll(() => api.writes.length).toBe(1);
  const saving = page.getByRole("dialog").getByRole("button", { name: "Menyimpan Try Out…", exact: true });
  await expect(saving).toBeDisabled();
  await expect(saving).toHaveAttribute("aria-busy", "true");
  api.release();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const questionWrites = api.writes.filter(write => write.path.includes("/questions"));
  expect(questionWrites).toHaveLength(1);
  expect(questionWrites[0].path).toBe("/api/admin/try-outs/7/questions/7000");
  expect(questionWrites[0].body).toMatchObject({ sort_order: 0, question: "Edited question", status: "draft" });
});

test("reorder stays zero based locally and bulk publish cannot alter open draft", async ({ page }) => {
  const api = await mock(page);
  await page.goto("/admin/try-out");
  const row = page.getByRole("row").filter({ hasText: "Try Out 7" });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Turun Question 0-0", exact: true }).click();
  await page.getByRole("button", { name: "Edit Question 0-1", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Urutan", { exact: true })).toHaveValue("0");
  await dialog.getByRole("textbox", { name: "Pertanyaan", exact: true }).fill("Unsaved prompt");
  await expect(row.getByRole("button", { name: "Publish Semua Soal", exact: true })).toBeDisabled();
  await row.getByRole("button", { name: "Publish Semua Soal", exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); });
  await expect(dialog.getByRole("textbox", { name: "Pertanyaan", exact: true })).toHaveText("Unsaved prompt");
  await expect(dialog.getByRole("combobox", { name: "Status", exact: true })).toHaveValue("Draft");
  expect(api.writes).toEqual([]);
});

for (const [status, text] of [[401, "Sesi berakhir"], [403, "Akses admin"], [422, "questions.0.audio_url: Audio is required."], [429, "Terlalu banyak"], [500, "Server mengalami gangguan"]] as const) {
  test(`bulk publish ${status} preserves rows and allows retry`, async ({ page }) => {
    const api = await mock(page);
    api.fail(status);
    await page.goto("/admin/try-out");
    const row = page.getByRole("row").filter({ hasText: "Try Out 7" });
    await row.getByRole("button", { name: "Publish Semua Soal", exact: true }).click();
    if (status === 401) {
      await expect(page).toHaveURL(/\/login/);
      api.fail(0);
      await page.goto("/admin/try-out");
    } else await expect(page.getByRole("status").filter({ hasText: text })).toBeVisible();
    await expect(row).toContainText("100 Draft • 0 Published");
    await expect(row.getByRole("button", { name: "Publish Semua Soal", exact: true })).toBeEnabled();
  });
}

test("preview grades correct counts across all four sessions independently of weighted total", async ({ page }) => {
  const api = await mock(page, [fixture(), fixture(8)]);
  await page.goto("/admin/try-out");
  await page.getByRole("row").filter({ hasText: "Try Out 7" }).getByRole("button", { name: "Lihat", exact: true }).click();
  const preview = page.getByRole("region", { name: "Pratinjau Try Out" });
  await expect(preview.getByText("ID: 7", { exact: true })).toBeVisible();
  await expect(preview.getByText("Lulus jika keempat sesi masing-masing memiliki minimal 19 jawaban benar. Try Out dapat diulang tanpa batas.", { exact: true })).toBeVisible();
  await preview.getByRole("button", { name: "Hasil", exact: true }).click();
  await expect(preview.getByRole("status")).toHaveText("Belum ada jawaban pratinjau.");
  await preview.getByRole("button", { name: "Runner", exact: true }).click();
  for (let section = 0; section < 4; section++) {
    await preview.getByRole("button", { name: `${labels[section]} • 25 soal`, exact: true }).click();
    for (let index = 0; index < (section === 3 ? 18 : 19); index++) {
      await preview.getByRole("button", { name: `Soal ${section * 25 + index + 1}`, exact: true }).click();
      await preview.getByRole("radio").first().check();
    }
  }
  await preview.getByRole("button", { name: "Hasil", exact: true }).click();
  await expect(preview.getByRole("status")).toHaveText("TIDAK LULUS");
  await expect(preview.locator(".tryout-total-score strong")).toHaveText("150");
  await expect(preview.locator(".tryout-total-score em")).toHaveText("/ 180");
  await preview.getByRole("button", { name: "Runner", exact: true }).click();
  await preview.getByRole("button", { name: "Soal 94", exact: true }).click();
  await preview.getByRole("radio").first().check();
  await preview.getByRole("button", { name: "Hasil", exact: true }).click();
  await expect(preview.getByRole("status")).toHaveText("LULUS");
  await page.keyboard.press("Escape");
  await page.getByRole("row").filter({ hasText: "Try Out 8" }).getByRole("button", { name: "Lihat", exact: true }).click();
  await expect(preview.getByText("ID: 8", { exact: true })).toBeVisible();
  await preview.getByRole("button", { name: "Runner", exact: true }).click();
  await expect(preview.getByRole("radio").first()).not.toBeChecked();
  expect(api.writes).toEqual([]);
});

test("configurable maximum and explicit session scores persist after refresh", async ({ page }) => {
  const api = await mock(page);
  await page.goto("/admin/try-out");
  const row = page.getByRole("row").filter({ hasText: "Try Out 7" });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Skor maksimal", { exact: true }).fill("40");
  const scores = page.getByRole("group", { name: "Passing score per sesi" }).getByRole("spinbutton");
  await scores.nth(0).fill("3");
  await page.getByRole("button", { name: "Simpan Try Out", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Passing score per sesi");
  expect(api.writes).toHaveLength(0);
  for (let index = 1; index < 4; index++) await scores.nth(index).fill("3");
  await page.getByRole("button", { name: "Simpan Try Out", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(api.writes[0].body).toMatchObject({ max_score: 40, session_passing_scores: Object.fromEntries(sessions.map(session => [session, 3])) });
  await page.reload();
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Skor maksimal", { exact: true })).toHaveValue("40");
  await expect(scores.nth(3)).toHaveValue("3");
});


for (const width of [1440, 768, 390]) {
  test(`placement editor Try Out create and reopen at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const api = await mock(page);
    await page.route("**/api/furigana", route => route.fulfill({ json: { reading: "\u304c\u3063\u3053\u3046" } }));
    await page.goto("/admin/try-out");
    await page.getByRole("row").filter({ hasText: "Try Out 7" }).getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("button", { name: "Tambah Soal", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveAccessibleName("Tambah Soal");
    await dialog.getByRole("combobox", { name: "Sesi", exact: true }).selectOption(labels[2]);
    await dialog.getByRole("combobox", { name: "Tipe", exact: true }).selectOption("Reading");
    await dialog.getByLabel("Point value", { exact: true }).fill("2");
    const prompt = dialog.getByRole("textbox", { name: "Pertanyaan", exact: true });
    await prompt.fill("\u5b66\u6821");
    async function selectPrompt() {
      await prompt.focus();
      await prompt.evaluate(element => {
        const range = document.createRange(); range.selectNodeContents(element);
        const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
        element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      });
    }
    const toolbar = dialog.getByRole("toolbar", { name: "Format Pertanyaan", exact: true });
    await selectPrompt();
    await toolbar.getByRole("button", { name: /Furigana/ }).click();
    const reading = dialog.getByLabel("Bacaan Hiragana", { exact: true });
    await expect(reading).toHaveValue("\u304c\u3063\u3053\u3046");
    await reading.fill("\u304c\u304f\u3053\u3046");
    await dialog.getByRole("button", { name: "Terapkan", exact: true }).click();
    await expect(prompt.locator("ruby rt")).toHaveText("\u304c\u304f\u3053\u3046");
    for (const command of ["bold", "italic", "underline"]) {
      await selectPrompt();
      await toolbar.getByRole("button", { name: command, exact: true }).click();
    }
    for (const [label, value] of [["Pilihan A", "\u5b66\u6821"], ["Pilihan B", "Rumah"], ["Pilihan C", "Kantor"], ["Pilihan D", "Perpustakaan"], ["Teks bacaan", "Bacaan lama \u65e5\u672c\u8a9e"], ["Instruksi", "Pilih jawaban"], ["Penjelasan jawaban", "Penjelasan \u65e5\u672c\u8a9e"]]) {
      await dialog.getByRole("textbox", { name: label, exact: true }).fill(value);
    }
    await dialog.getByRole("combobox", { name: "Jawaban benar", exact: true }).selectOption("2");
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
    await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
    await dialog.getByRole("button", { name: "Simpan Try Out", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const write = api.writes.find(item => item.path.endsWith("/questions"))!;
    expect(write.body).toMatchObject({ correct_option: "C", point_value: 2, session: "reading", reading_passage: "Bacaan lama \u65e5\u672c\u8a9e", instruction: "Pilih jawaban", status: "draft" });
    const html = (write.body as { question: string }).question;
    expect(html).toMatch(/<(b|strong)>/); expect(html).toMatch(/<(i|em)>/); expect(html).toContain("<u>"); expect(html).toContain("<rt>\u304c\u304f\u3053\u3046</rt>");
    await page.reload();
    await page.getByRole("row").filter({ hasText: "Try Out 7" }).getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("button", { name: `Edit ${html}`, exact: true }).click();
    await expect(dialog).toHaveAccessibleName("Edit Soal");
    await expect(prompt.locator("ruby rt")).toHaveText("\u304c\u304f\u3053\u3046");
    await expect(dialog.getByRole("combobox", { name: "Jawaban benar", exact: true })).toHaveValue("2");
    await expect(dialog.getByRole("textbox", { name: "Pilihan B", exact: true })).toHaveText("Rumah");
    await expect(dialog.getByRole("textbox", { name: "Teks bacaan", exact: true })).toHaveText("Bacaan lama \u65e5\u672c\u8a9e");
    async function selectRuby() {
      await prompt.focus();
      await prompt.evaluate(element => {
        const ruby = element.querySelector("ruby")!;
        const walker = document.createTreeWalker(ruby, NodeFilter.SHOW_TEXT);
        const node = walker.nextNode()!;
        const range = document.createRange(); range.selectNodeContents(node);
        const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
        element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      });
      await toolbar.getByRole("button", { name: /Furigana/ }).click();
    }
    await selectRuby();
    await expect(reading).toHaveValue("\u304c\u304f\u3053\u3046");
    await reading.fill("\u304c\u3063\u3053\u3046");
    await dialog.getByRole("button", { name: "Terapkan", exact: true }).click();
    await expect(prompt.locator("ruby rt")).toHaveText("\u304c\u3063\u3053\u3046");
    await selectRuby();
    await dialog.getByRole("button", { name: "Hapus Furigana", exact: true }).click();
    await expect(prompt.locator("ruby")).toHaveCount(0);
    await expect(prompt).toHaveText("\u5b66\u6821");
    await prompt.fill("");
    await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Isi pertanyaan");
    await prompt.fill("\u5b66\u6821");
    await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
    await dialog.getByRole("button", { name: "Simpan Try Out", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const update = api.writes.find(item => item.path.endsWith("/questions/99999"))!;
    expect(update.body).toMatchObject({ question: "\u5b66\u6821", correct_option: "C", point_value: 2, session: "reading" });
  });
}


test("program filter scopes question target and reuses Placement formatting tools", async ({ page }) => {
  await mock(page, [fixture(7), { ...fixture(8), program_id: 2 }]);
  await page.goto("/admin/try-out");
  await page.getByRole("combobox", { name: "Program", exact: true }).selectOption("N5");
  await expect(page.getByRole("table")).toContainText("Try Out 7");
  await expect(page.getByRole("table")).not.toContainText("Try Out 8");
  const target = page.getByRole("combobox", { name: "Try Out tujuan", exact: true });
  await expect(target.getByRole("option", { name: "N4 ? Try Out 8", exact: true })).toHaveCount(0);
  await target.selectOption("7");
  await page.getByRole("button", { name: "+ Tambah Soal Try Out", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Try Out 7");
  const toolbar = dialog.getByRole("toolbar", { name: "Format Pertanyaan", exact: true });
  for (const name of ["bold", "italic", "underline"]) await expect(toolbar.getByRole("button", { name, exact: true })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: /Furigana/ })).toBeVisible();
  await dialog.getByRole("button", { name: "Batal", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Batal", exact: true }).click();
  await page.getByRole("combobox", { name: "Program", exact: true }).selectOption("N4");
  await expect(target).toHaveValue("");
  await page.getByRole("button", { name: "+ Tambah Soal Try Out", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Pilih Try Out tujuan" })).toBeVisible();
});


for (const width of [1440, 768, 390]) {
  test(`classic layout and Placement rich text persistence ${width}px`, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 1000 });
    const first = { ...fixture(7), access_type: "free" };
    const second = { ...fixture(8), program_id: 2, access_type: "membership" };
    const api = await mock(page, [first, second]);
    await page.route("**/api/furigana", route => route.fulfill({ json: { reading: "\u304c\u3063\u3053\u3046" } }));
    await page.goto("/admin/try-out");
    const table = page.getByRole("table", { name: "Daftar Try Out", exact: true });
    await expect(table).toContainText("Gratis");
    await expect(table).toContainText("Membership");
    await expect(table).toContainText("Belum diatur");
    await page.getByRole("button", { name: "+ Tambah Try Out", exact: true }).click();
    let dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Akses Try Out", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "Pertanyaan", exact: true })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Batal", exact: true }).click();
    const program = page.getByRole("combobox", { name: "Program", exact: true });
    const target = page.getByRole("combobox", { name: "Try Out tujuan", exact: true });
    await program.selectOption("N5");
    await expect(table).toContainText("Try Out 7");
    await expect(table).not.toContainText("Try Out 8");
    await target.selectOption("7");
    await program.selectOption("N4");
    await expect(target).toHaveValue("");
    await expect(target.locator('option[value="7"]')).toHaveCount(0);
    await expect(table).toContainText("Try Out 8");
    await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("Published");
    await expect(page.getByText("Belum ada Try Out sesuai filter.", { exact: true })).toBeVisible();
    await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("Draft");
    await page.getByRole("searchbox", { name: "Cari Try Out", exact: true }).fill("Try Out 7");
    await expect(table).toHaveCount(0);
    await page.getByRole("searchbox", { name: "Cari Try Out", exact: true }).fill("Try Out 8");
    await expect(table).toContainText("Try Out 8");
    await page.getByRole("searchbox", { name: "Cari Try Out", exact: true }).clear();
    await program.selectOption("N5");
    await target.selectOption("7");
    const add = page.getByRole("button", { name: "+ Tambah Soal Try Out", exact: true });
    if (width === 1440) {
      const filters = await program.locator("xpath=../..").boundingBox();
      const button = await add.boundingBox();
      expect(button!.x).toBeGreaterThanOrEqual(filters!.x + filters!.width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("tab", { name: "Bank Soal", exact: true }).click();
    await expect(page.getByRole("table", { name: "Bank Soal", exact: true })).toContainText("Try Out 7");
    await expect(page.getByRole("table", { name: "Bank Soal", exact: true })).not.toContainText("Try Out 8");
    await page.getByRole("tab", { name: "Daftar Try Out", exact: true }).click();
    await table.getByRole("button", { name: "Kelola Soal", exact: true }).click();
    await expect(dialog.getByLabel("Akses Try Out", { exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("table", { name: "Soal", exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Batal", exact: true }).click();
    await add.click();
    dialog = page.getByRole("dialog");
    const prompt = dialog.getByRole("textbox", { name: "Pertanyaan", exact: true });
    await prompt.fill("\u5b66\u6821");
    async function selectPrompt() {
      await prompt.focus();
      await prompt.evaluate(element => { const range = document.createRange(); range.selectNodeContents(element); const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range); element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true })); });
    }
    const toolbar = dialog.getByRole("toolbar", { name: "Format Pertanyaan", exact: true });
    await selectPrompt();
    await toolbar.getByRole("button", { name: /Furigana/ }).click();
    await expect(dialog.getByLabel("Bacaan Hiragana", { exact: true })).toHaveValue("\u304c\u3063\u3053\u3046");
    await dialog.getByLabel("Bacaan Hiragana", { exact: true }).fill("\u307e\u306a\u3073\u3084");
    await dialog.getByRole("button", { name: "Terapkan", exact: true }).click();
    for (const name of ["bold", "italic", "underline"]) { await selectPrompt(); await toolbar.getByRole("button", { name, exact: true }).click(); }
    for (const key of ["A", "B", "C", "D"]) await dialog.getByRole("textbox", { name: `Pilihan ${key}`, exact: true }).fill(`Option ${key}`);
    await dialog.getByLabel("Jawaban benar", { exact: true }).selectOption("1");
    await dialog.getByLabel("Point value", { exact: true }).fill("1");
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Simpan Try Out", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const saved = first.questions.find(question => question.id === 99999)!;
    expect(saved.question).toMatch(/<(b|strong)>/);
    expect(saved.question).toMatch(/<(i|em)>/);
    expect(saved.question).toContain("<u>");
    expect(saved.question).toContain("<rt>\u307e\u306a\u3073\u3084</rt>");
    expect(saved.correct_option).toBe("B");
    expect(first.access_type).toBe("free");
    expect(api.writes.some(write => write.path.endsWith("/questions") && write.method === "POST")).toBe(true);
    await page.reload();
    await page.getByRole("tab", { name: "Bank Soal", exact: true }).click();
    const questionRow = page.getByRole("row").filter({ hasText: "\u5b66\u6821" });
    await questionRow.getByRole("button", { name: "Edit Soal", exact: true }).click();
    await expect(prompt.locator("ruby rt")).toHaveText("\u307e\u306a\u3073\u3084");
    await expect(prompt.locator("strong, b")).toBeVisible();
    await expect(prompt.locator("em, i")).toBeVisible();
    await expect(prompt.locator("u")).toBeVisible();
    await expect(dialog.locator("ruby rt").last()).toHaveText("\u307e\u306a\u3073\u3084");
    await prompt.locator("ruby").evaluate(element => { const range = document.createRange(); range.setStart(element.firstChild!, 0); range.collapse(true); const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range); element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true })); });
    await toolbar.getByRole("button", { name: /Furigana/ }).click();
    await expect(dialog.getByLabel("Bacaan Hiragana", { exact: true })).toHaveValue("\u307e\u306a\u3073\u3084");
    await dialog.getByRole("button", { name: "Hapus Furigana", exact: true }).click();
    await expect(prompt.locator("ruby")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}


test("classic action menu preserves publish draft and membership", async ({ page }) => {
  const item = { ...fixture(), access_type: "membership" };
  const api = await mock(page, [item]);
  await page.goto("/admin/try-out");
  const row = page.getByRole("row").filter({ hasText: "Try Out 7" });
  await row.locator("summary").click();
  await row.getByRole("button", { name: "Publish Semua Soal", exact: true }).click();
  await expect(row).toContainText("0 Draft");
  await row.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(row.getByRole("button", { name: "Draft", exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Draft", exact: true }).click();
  await expect(row.getByRole("button", { name: "Publish", exact: true })).toBeVisible();
  expect(item.access_type).toBe("membership");
  expect(api.writes.filter(write => write.method === "PATCH").map(write => write.body)).toEqual([{ status: "published" }, { status: "draft" }]);
});


for (const width of [1440, 768, 390]) {
  test(`two panel builder focused ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const api = await mock(page);
    await page.goto("/admin/try-out");
    await page.getByRole("row").filter({ hasText: "Try Out 7" }).getByRole("button", { name: "Kelola Soal", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const list = dialog.getByRole("complementary", { name: "Daftar soal" });
    for (const label of ["Kosakata & Kanji", "Choukai", "Dokkai", "Tata Bahasa"]) {
      await dialog.getByRole("tab", { name: label, exact: true }).click();
      await expect(list.getByRole("listitem")).toHaveCount(10);
      await expect(list).toContainText("25 soal");
    }
    await dialog.getByRole("tab", { name: "Kosakata & Kanji", exact: true }).click();
    await list.getByRole("button", { name: "Berikutnya", exact: true }).click();
    await expect(list).toContainText("Halaman 2 / 3");
    await list.getByRole("button").filter({ hasText: "Soal 11" }).click();
    const prompt = dialog.getByRole("textbox", { name: "Pertanyaan", exact: true });
    await prompt.fill("Updated question");
    for (const name of ["bold", "italic", "underline"]) await expect(dialog.getByRole("toolbar", { name: "Format Pertanyaan", exact: true }).getByRole("button", { name, exact: true })).toBeVisible();
    await expect(dialog.getByRole("toolbar", { name: "Format Pertanyaan", exact: true }).getByRole("button", { name: /Furigana/ })).toBeVisible();
    await dialog.getByRole("tab", { name: "Choukai", exact: true }).click();
    await page.getByRole("dialog", { name: "Konfirmasi", exact: true }).getByRole("button", { name: "Batal", exact: true }).click();
    await expect(prompt).toHaveText("Updated question");
    await dialog.getByRole("button", { name: "Terapkan Perubahan Soal", exact: true }).click();
    expect(api.writes).toHaveLength(0);
    await dialog.getByRole("button", { name: "Pratinjau Siswa", exact: true }).click();
    const preview = dialog.getByRole("region", { name: "Pratinjau Siswa", exact: true });
    await expect(preview).toContainText("Updated question");
    await expect(preview.getByRole("radio")).toHaveCount(0);
    await expect(preview).not.toContainText(/ID:|Point value|Jawaban benar|Timer|Hasil/);
    if (width === 1440) {
      const left = await list.boundingBox();
      const right = await dialog.getByRole("region", { name: "Editor soal", exact: true }).boundingBox();
      expect(left!.x + left!.width).toBeLessThan(right!.x);
      expect(left!.width / (left!.width + right!.width)).toBeGreaterThan(0.25);
      expect(left!.width / (left!.width + right!.width)).toBeLessThan(0.31);
    }
    if (width === 390) await dialog.getByRole("button", { name: "Kembali ke daftar soal", exact: true }).click();
    await list.getByRole("button").filter({ hasText: "Soal 12" }).click();
    if (width === 390) await dialog.getByRole("button", { name: "Kembali ke daftar soal", exact: true }).click();
    await list.getByRole("button").filter({ hasText: "Soal 11" }).click();
    await expect(prompt).toHaveText("Updated question");
    await dialog.getByRole("tab", { name: "Choukai", exact: true }).click();
    await list.getByRole("button").filter({ hasText: "Soal 1" }).first().click();
    await expect(dialog.getByLabel("URL audio", { exact: true })).toHaveValue("media/audio.mp3");
    await expect(dialog.locator("audio").first()).toHaveAttribute("src", /audio.mp3/);
    await dialog.getByRole("tab", { name: "Dokkai", exact: true }).click();
    await list.getByRole("button").filter({ hasText: "Soal 1" }).first().click();
    await expect(dialog.getByRole("textbox", { name: "Teks bacaan", exact: true })).toHaveText("Passage");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await dialog.getByRole("button", { name: "Simpan Try Out", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "berhasil disimpan" })).toBeVisible();
    expect(api.writes.filter(write => write.path.includes("/questions"))).toHaveLength(1);
    await page.reload();
    await page.getByRole("row").filter({ hasText: "Try Out 7" }).getByRole("button", { name: "Kelola Soal", exact: true }).click();
    await dialog.getByRole("searchbox").fill("Updated question");
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await list.getByRole("button").filter({ hasText: "Soal 11" }).click();
    await expect(prompt).toHaveText("Updated question");
  });
}


test("bank opens inline builder and search does not interrupt new questions", async ({ page }) => {
  await mock(page);
  await page.goto("/admin/try-out");
  await expect(page.getByRole("table", { name: "Daftar Try Out", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Tambah Soal Try Out", exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: "Bank Soal", exact: true }).click();
  await expect(page.getByRole("table", { name: "Bank Soal", exact: true })).toHaveCount(0);
  const editor = page.getByRole("region", { name: "Editor soal", exact: true });
  await expect(editor.getByRole("textbox", { name: "Pertanyaan", exact: true })).toHaveText("Question 0-0");
  const list = page.getByRole("complementary", { name: "Daftar soal" });
  await list.getByRole("button", { name: "+ Tambah Soal", exact: true }).click();
  await expect(editor.getByRole("heading", { name: /Soal 26/ })).toBeVisible();
  await expect(editor.getByRole("textbox", { name: "Pertanyaan", exact: true })).toBeEmpty();
  await expect(list.getByRole("button", { name: "Soal 26", exact: true })).toBeVisible();
  await editor.getByRole("textbox", { name: "Pertanyaan", exact: true }).fill("New question");
  await list.getByRole("searchbox").fill("Question 0-0");
  await expect(page.getByRole("dialog", { name: "Konfirmasi", exact: true })).toHaveCount(0);
  await expect(editor.getByRole("textbox", { name: "Pertanyaan", exact: true })).toHaveText("New question");
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(page.getByLabel("Bobot soal", { exact: true })).toHaveCount(0);
});


test("partial question is retained when adding and switching questions without confirmation", async ({ page }) => {
  const api = await mock(page);
  await page.goto("/admin/try-out");
  await page.getByRole("tab", { name: "Bank Soal", exact: true }).click();
  const list = page.getByRole("complementary", { name: "Daftar soal" });
  const prompt = page.getByRole("region", { name: "Editor soal", exact: true }).getByRole("textbox", { name: "Pertanyaan", exact: true });
  await list.getByRole("button", { name: "+ Tambah Soal", exact: true }).click();
  await prompt.fill("Partial question 26");
  await list.getByRole("button", { name: "+ Tambah Soal", exact: true }).click();
  await expect(prompt).toBeEmpty();
  await prompt.fill("Partial question 27");
  await list.getByRole("button").filter({ hasText: "Soal 26" }).click();
  await expect(prompt).toHaveText("Partial question 26");
  await list.getByRole("button").filter({ hasText: "Soal 27" }).click();
  await expect(prompt).toHaveText("Partial question 27");
  await page.getByRole("tab", { name: "Choukai", exact: true }).click();
  await page.getByRole("tab", { name: "Kosakata & Kanji", exact: true }).click();
  await list.getByRole("searchbox").fill("Partial question 26");
  await list.getByRole("button").filter({ hasText: "Soal 26" }).click();
  await expect(prompt).toHaveText("Partial question 26");
  await expect(page.getByRole("dialog", { name: "Konfirmasi", exact: true })).toHaveCount(0);
  expect(api.writes).toHaveLength(0);
});


test("student preview uses runner choices without revealing answer key", async ({ page }) => {
  const api = await mock(page);
  await page.goto("/admin/try-out");
  await page.getByRole("tab", { name: "Bank Soal", exact: true }).click();
  await page.getByRole("button", { name: "Pratinjau Siswa", exact: true }).click();
  const preview = page.getByRole("region", { name: "Pratinjau Siswa", exact: true });
  await expect(preview.locator(".learning-question-card")).toBeVisible();
  await expect(preview.getByRole("radio")).toHaveCount(4);
  await preview.locator("label").filter({ hasText: "Second" }).click();
  await expect(preview.getByRole("radio").nth(1)).toBeChecked();
  await expect(preview.locator("label.selected")).toContainText("Second");
  await expect(preview).not.toContainText(/Jawaban benar|Point value|Hasil|ID:/);
  expect(api.writes).toHaveLength(0);
  await preview.getByRole("button", { name: "Tutup Pratinjau", exact: true }).click();
  await expect(preview).toHaveCount(0);
});


test("long answer stays inside fixed scrollable editor", async ({ page }) => {
  await mock(page);
  await page.goto("/admin/try-out");
  await page.getByRole("tab", { name: "Bank Soal", exact: true }).click();
  const answer = page.getByRole("textbox", { name: "Pilihan A", exact: true });
  const before = await answer.boundingBox();
  await answer.fill("LongAnswer".repeat(500));
  const after = await answer.boundingBox();
  expect(after!.height).toBe(before!.height);
  expect(after!.width).toBe(before!.width);
  expect(await answer.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await expect(answer).toHaveCSS("overflow-y", "scroll");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
