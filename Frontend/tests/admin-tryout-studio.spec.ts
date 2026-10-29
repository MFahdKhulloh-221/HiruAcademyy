import { expect, test, type Page } from "./canonical-fixture";

const sessions = ["vocabulary_kanji", "grammar", "reading", "audio"];
function studioFixture() {
  return {
    id: 7, studio_revision: "studio-1", program_id: 1, title: "Simulasi JLPT N5", status: "draft", access_type: "membership",
    max_score: 20, total_passing_score: null, session_passing_scores: Object.fromEntries(sessions.map(session => [session, 3])), duration_minutes: 90, sort_order: 1,
    passages: [{ id: 91, title: "学校の一日", body: "学校で日本語を勉強します。昼は友達とご飯を食べます。" }],
    questions: sessions.flatMap((session, section) => Array.from({ length: 5 }, (_, index) => ({
      id: 7000 + section * 5 + index, session, question: `${section === 2 ? "読解" : "問題"} ${index + 1}：正しい答えを選んでください。`,
      options: { A: "学校", B: "図書館", C: "先生", D: "公園" }, correct_option: "A", instruction: "最もよいものを一つ選んでください。",
      explanation: "文章の内容を確認しましょう。", passage_id: session === "reading" ? 91 : null, reading_passage: null,
      audio_url: session === "audio" ? "https://example.test/listening.mp3" : null, point_value: 1, sort_order: index, status: "draft",
    }))),
  };
}

type Studio = ReturnType<typeof studioFixture>;
type StudioWrite = { revision: string; settings: Partial<Studio>; passages: Studio["passages"]; questions: { id: string; content: Omit<Studio["questions"][number], "id"> }[]; deleted_question_ids: number[]; deleted_passage_ids: number[] };
async function mockStudio(page: Page) {
  const item = studioFixture();
  const writes: StudioWrite[] = [];
  await page.route("**/api/admin/programs", route => route.fulfill({ json: { data: [{ id: 1, code: "n5", name: "JLPT N5", family: "jlpt", status: "active" }] } }));
  await page.route("**/api/furigana", async route => {
    expect(route.request().postDataJSON()).toEqual({ text: "先生" });
    await route.fulfill({ json: { reading: "せんせい" } });
  });
  await page.route("**/api/admin/try-outs**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET") {
      await route.fulfill({ json: { data: path === "/api/admin/try-outs" ? [item] : item } });
      return;
    }
    expect(request.method()).toBe("PUT");
    expect(path).toBe("/api/admin/try-outs/7/studio");
    const body = request.postDataJSON() as StudioWrite;
    expect(body.revision).toBe(item.studio_revision);
    writes.push(body);
    Object.assign(item, body.settings);
    item.passages = body.passages.map(passage => ({ ...passage, id: Number(passage.id) }));
    item.questions = body.questions.map((question, index) => ({ ...question.content, id: /^\d+$/.test(question.id) ? Number(question.id) : 9000 + index, passage_id: question.content.passage_id == null ? null : Number(question.content.passage_id) }));
    item.studio_revision = `studio-${writes.length + 1}`;
    await route.fulfill({ json: { data: item } });
  });
  return { item, writes };
}

async function openStudio(page: Page) {
  await page.goto("/admin/try-out");
  await page.getByRole("row").filter({ hasText: "Simulasi JLPT N5" }).getByRole("button", { name: "Buka Builder", exact: true }).click();
  await expect(page.getByRole("region", { name: "HIRU TRY OUT STUDIO", exact: true })).toBeVisible();
}

async function selectField(page: Page, label: string) {
  const field = page.getByRole("textbox", { name: label, exact: true });
  await field.focus();
  await field.evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection()!;
    selection.removeAllRanges(); selection.addRange(range);
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  const toolbar = page.getByRole("toolbar", { name: `Format ${label}`, exact: true });
  await expect(toolbar).toHaveCount(1);
  await expect(toolbar.locator(".placement-editor-label")).toHaveText(`Aktif: ${label}`);
  return { field, toolbar };
}

async function formatField(page: Page, label: string, command: string, tag: string) {
  const { field, toolbar } = await selectField(page, label);
  await toolbar.getByRole("button", { name: command, exact: true }).click();
  await expect(field.locator(tag)).toBeVisible();
}

async function screenshot(page: Page, kind: string, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => { window.getSelection()?.removeAllRanges(); if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: `C:/Users/Tulo/AppData/Local/Temp/opencode/tryout-studio-${kind}-${width}.png`, fullPage: true });
}

for (const width of [1440, 768, 390]) {
  test(`studio shared toolbar, persistence and responsive preview ${width}px`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 1000 });
    const api = await mockStudio(page);
    await openStudio(page);
    const studio = page.getByRole("region", { name: "HIRU TRY OUT STUDIO", exact: true });
    await expect(studio.locator("header").first().getByRole("button")).toHaveCount(0);
    await expect(page.locator(".admin-topbar")).toHaveCount(0);
    await expect(studio.getByRole("tablist", { name: "Mode editor", exact: true })).toHaveCount(1);
    await expect(studio.getByRole("button", { name: "Simpan Try Out", exact: true })).toHaveCount(1);
    const navigator = studio.getByRole("complementary", { name: "Navigator Konten", exact: true });
    await expect(navigator.getByRole("list", { name: "Daftar pertanyaan" }).getByRole("button")).toHaveCount(5);
    if (width === 1440) {
      const sidebar = page.getByRole("complementary").filter({ has: page.getByRole("link", { name: "Try Out", exact: true }) });
      const bounds = await sidebar.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.width).toBeGreaterThanOrEqual(240);
      expect(bounds!.width).toBeLessThanOrEqual(260);
    }
    if (width === 1440) {
      const left = await navigator.boundingBox();
      const right = await studio.getByRole("region", { name: "Editor Konten", exact: true }).boundingBox();
      expect(left!.width).toBeGreaterThanOrEqual(240);
      expect(left!.width).toBeLessThanOrEqual(270);
      expect(right!.x).toBeGreaterThan(left!.x + left!.width);
    }
    await expect(navigator).toBeVisible();
    await expect(studio.getByRole("button", { name: /Sembunyikan Navigator|Tampilkan Navigator|Kecilkan Sidebar|Perluas Sidebar/ })).toHaveCount(0);
    await studio.getByRole("tab", { name: "Reading (Dokkai)", exact: true }).click();
    const passageToggle = studio.locator("summary").filter({ hasText: "BACAAN BERSAMA" });
    await passageToggle.click();
    await expect(page.getByRole("textbox", { name: "Bacaan Bersama", exact: true })).toBeHidden();
    await passageToggle.click();
    await expect(page.getByRole("textbox", { name: "Bacaan Bersama", exact: true })).toBeVisible();
    await expect(studio.getByRole("toolbar")).toHaveCount(1);
    await formatField(page, "Pertanyaan", "bold", "b, strong");
    await formatField(page, "Pilihan A", "italic", "i, em");
    await formatField(page, "Pilihan B", "underline", "u");
    const { field: choiceC, toolbar } = await selectField(page, "Pilihan C");
    await toolbar.getByRole("button", { name: /Furigana/ }).click();
    await expect(page.getByLabel("Bacaan Hiragana", { exact: true })).toHaveValue("せんせい");
    await page.getByRole("button", { name: "Terapkan", exact: true }).click();
    await expect(choiceC.locator("ruby rt")).toHaveText("せんせい");
    await formatField(page, "Bacaan Bersama", "bold", "b, strong");
    await formatField(page, "Pembahasan", "italic", "i, em");
    await expect(page.getByRole("textbox", { name: "Pertanyaan", exact: true }).locator("i, em, u, ruby")).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Pilihan D", exact: true }).locator("b, strong, i, em, u, ruby")).toHaveCount(0);
    await selectField(page, "Pertanyaan");
    await screenshot(page, "reading", width);
    await studio.getByRole("tab", { name: "Pratinjau Siswa", exact: true }).click();
    await expect(studio.getByRole("toolbar")).toHaveCount(0);
    const preview = studio.getByRole("region", { name: "Pratinjau Siswa", exact: true });
    await expect(preview.getByRole("radio")).toHaveCount(4);
    await expect(preview).not.toContainText(/Jawaban Benar|Pembahasan|Bobot poin/);
    await expect(preview.locator("ruby rt")).toHaveText("せんせい");
    await preview.getByRole("radio").nth(1).check();
    await expect(preview.getByRole("radio").nth(1)).toBeChecked();
    await screenshot(page, "preview", width);
    await studio.getByRole("tab", { name: "Kosakata & Kanji", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Pertanyaan", exact: true })).toHaveText("問題 1：正しい答えを選んでください。");
    await expect(page.getByRole("textbox", { name: "Bacaan Bersama", exact: true })).toHaveCount(0);
    await selectField(page, "Pertanyaan");
    await screenshot(page, "vocabulary", width);
    await studio.getByRole("tab", { name: "Reading (Dokkai)", exact: true }).click();
    await studio.getByRole("button", { name: "Simpan Try Out", exact: true }).click();
    await expect(studio.getByRole("status")).toContainText("berhasil disimpan");
    expect(api.writes).toHaveLength(1);
    const saved = api.writes[0].questions.find(question => question.id === "7010")!.content;
    expect(saved.question).toMatch(/<(b|strong)>/);
    expect(saved.options.A).toMatch(/<(i|em)>/);
    expect(saved.options.B).toContain("<u>");
    expect(saved.options.C).toContain("<rt>せんせい</rt>");
    expect(saved.explanation).toMatch(/<(i|em)>/);
    expect(saved.passage_id).toBe("91");
    expect(saved.reading_passage).toBeNull();
    expect(api.writes[0].passages[0].body).toMatch(/<(b|strong)>/);
    await studio.getByRole("button", { name: "Kembali ke Daftar", exact: true }).click();
    await expect(page.locator(".admin-topbar")).toHaveCount(1);
    await page.reload();
    await page.getByRole("row").filter({ hasText: "Simulasi JLPT N5" }).getByRole("button", { name: "Buka Builder", exact: true }).click();
    await studio.getByRole("tab", { name: "Reading (Dokkai)", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Pilihan C", exact: true }).locator("ruby rt")).toHaveText("せんせい");
    await expect(page.getByRole("textbox", { name: "Bacaan Bersama", exact: true }).locator("b, strong")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Pertanyaan", exact: true }).locator("b, strong")).toBeVisible();
  });
}

for (const width of [1440, 390]) test(`reading group dialog layout ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await mockStudio(page);
  await openStudio(page);
  await page.getByRole("tab", { name: "Reading (Dokkai)", exact: true }).click();
  await page.getByRole("button", { name: "Tambah Grup Bacaan", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Grup Bacaan Reading", exact: true });
  await dialog.getByLabel("Judul internal bacaan", { exact: true }).fill("Bacaan B");
  await dialog.getByRole("textbox", { name: "Teks bacaan grup", exact: true }).fill("日本語を読みます。");
  await expect(page.getByRole("toolbar")).toHaveCount(1);
  const title = await dialog.getByLabel("Judul internal bacaan", { exact: true }).boundingBox();
  const toolbar = await dialog.getByRole("toolbar").boundingBox();
  const text = await dialog.getByRole("textbox", { name: "Teks bacaan grup", exact: true }).boundingBox();
  expect(toolbar!.y).toBeGreaterThan(title!.y + title!.height);
  expect(text!.y).toBeGreaterThan(toolbar!.y + toolbar!.height);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: `C:/Users/Tulo/AppData/Local/Temp/opencode/tryout-reading-group-${width}.png`, fullPage: true });
  await dialog.getByRole("button", { name: "Buat Grup", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Bacaan Bersama", exact: true })).toHaveText("日本語を読みます。");
});

test("standalone reading hides empty passage selector and uses outer focus ring", async ({ page }) => {
  const api = await mockStudio(page);
  api.item.passages = [];
  api.item.questions.forEach(question => { question.passage_id = null; });
  await openStudio(page);
  await page.getByRole("tab", { name: "Reading (Dokkai)", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Hubungkan ke grup bacaan", exact: true })).toHaveCount(0);
  await expect(page.getByText("Bacaan ini hanya untuk soal aktif.", { exact: false })).toBeVisible();
  const field = page.getByRole("textbox", { name: "Bacaan Mandiri", exact: true });
  await field.focus();
  await expect(field).toHaveCSS("outline-style", "none");
  await expect(field.locator("..")).toHaveCSS("outline-style", "solid");
  await expect(page.getByRole("toolbar")).toContainText("Aktif: Bacaan Mandiri");
});

test("studio navigation, reorder, duplicate, delete and unsaved close guard", async ({ page }) => {
  const api = await mockStudio(page);
  await openStudio(page);
  const studio = page.getByRole("region", { name: "HIRU TRY OUT STUDIO", exact: true });
  const prompt = page.getByRole("textbox", { name: "Pertanyaan", exact: true });
  await prompt.fill("Edited vocabulary question");
  await page.keyboard.press("End");
  await page.keyboard.type(" undo check");
  await expect(prompt).toHaveText("Edited vocabulary question undo check");
  await page.keyboard.press("Control+z");
  await expect(prompt).toHaveText("Edited vocabulary question");
  await page.keyboard.press("Control+Shift+z");
  await expect(prompt).toHaveText("Edited vocabulary question undo check");
  await prompt.fill("Edited vocabulary question");
  await studio.getByRole("button", { name: "Soal Berikutnya", exact: true }).first().click();
  await expect(prompt).toHaveText("問題 2：正しい答えを選んでください。");
  await studio.getByRole("button", { name: "Soal Sebelumnya", exact: true }).first().click();
  await expect(prompt).toHaveText("Edited vocabulary question");
  await studio.locator("summary").filter({ hasText: /^Aksi soal$/ }).click();
  await studio.getByRole("button", { name: "Turunkan Soal", exact: true }).click();
  await expect(studio.getByRole("complementary", { name: "Navigator Konten" }).getByRole("list", { name: "Daftar pertanyaan" }).getByRole("button").nth(1)).toContainText("Edited vocabulary question");
  await studio.getByRole("button", { name: "Duplikat Soal", exact: true }).click();
  await expect(prompt).toHaveText("Edited vocabulary question");
  await studio.locator("summary").filter({ hasText: /^Aksi soal$/ }).click();
  await studio.getByRole("button", { name: "Hapus Soal", exact: true }).click();
  await page.getByRole("dialog", { name: "Hapus soal?", exact: true }).getByRole("button", { name: "Hapus dari Editor", exact: true }).click();
  await expect(studio.getByRole("complementary", { name: "Navigator Konten" }).getByRole("list", { name: "Daftar pertanyaan" }).getByRole("button")).toHaveCount(5);
  await studio.getByRole("button", { name: "Kembali ke Daftar", exact: true }).click();
  const guard = page.getByRole("dialog", { name: "Tutup builder?", exact: true });
  await expect(guard).toContainText("Perubahan belum disimpan");
  await guard.getByRole("button", { name: "Lanjut Mengedit", exact: true }).click();
  await expect(studio).toBeVisible();
  expect(api.writes).toHaveLength(0);
  await studio.getByRole("button", { name: "Simpan Try Out", exact: true }).click();
  await expect(studio.getByRole("status")).toContainText("berhasil disimpan");
  expect(api.item.questions.filter(question => question.session === "vocabulary_kanji").sort((a, b) => a.sort_order - b.sort_order).map(question => question.id)).toEqual([7001, 7000, 7002, 7003, 7004]);
});

test("standalone Checkpoint rich text keeps field-local toolbars", async ({ page }) => {
  await page.route("**/api/admin/chapters", route => route.fulfill({ json: { data: [{ id: 9, program_id: 1, chapter_number: 1, title: "Chapter 1", status: "published" }] } }));
  await page.route("**/api/admin/checkpoint-questions**", route => route.fulfill({ json: { data: [{ id: 1, chapter_id: 9, question: "Standalone question", options: { A: "First", B: "Second", C: "Third", D: "Fourth" }, correct_option: "A", explanation: "Explanation", status: "draft", sort_order: 0 }] } }));
  await page.route("**/api/admin/checkpoint-packages", route => route.fulfill({ json: { data: [] } }));
  await page.goto("/admin/checkpoint");
  await page.getByRole("tab", { name: "Bank Soal", exact: true }).click();
  await page.getByRole("combobox", { name: "Program", exact: true }).selectOption("1");
  await page.getByRole("combobox", { name: "Chapter", exact: true }).selectOption("9");
  await page.getByRole("button", { name: "Soal 1 Standalone question", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Pertanyaan", exact: true })).toHaveText("Standalone question");
  await formatField(page, "Pertanyaan", "bold", "b, strong");
  await formatField(page, "Pilihan A", "italic", "i, em");
  await expect(page.getByRole("toolbar", { name: "Format Pertanyaan", exact: true })).toHaveCount(1);
  await expect(page.getByRole("toolbar", { name: "Format Pilihan A", exact: true })).toHaveCount(1);
  await expect(page.getByRole("textbox", { name: "Pertanyaan", exact: true }).locator("i, em")).toHaveCount(0);
});
