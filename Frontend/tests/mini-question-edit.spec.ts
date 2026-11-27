import { expect, test } from "./canonical-fixture";

test("Mini saves edited text when composition ends by leaving question field", async ({ page }) => {
  const program = { id: 1, code: "n4", name: "JLPT N4", family: "jlpt" };
  const chapter = { id: 9, program_id: 1, chapter_number: 1, title: "Tata Bahasa Dasar N4", status: "published", mini_checkpoint_duration_minutes: 60, mini_checkpoint_passing_score: 80 };
  let row = { id: 39, chapter_id: 9, question: "Pertanyaan lama", options: { A: "Satu", B: "Dua", C: "Tiga", D: "Empat" }, correct_option: "A", category: null, status: "published", sort_order: 0, updated_at: "2026-11-27T00:00:00.000000Z" };
  await page.route("**/api/admin/programs", route => route.fulfill({ json: { data: [program] } }));
  await page.route("**/api/admin/chapters", route => route.fulfill({ json: { data: [chapter] } }));
  await page.route("**/api/admin/chapters/9", route => route.fulfill({ json: { data: { ...chapter, mini_checkpoint_readiness_errors: [] } } }));
  await page.route("**/api/admin/mini-checkpoint-questions", route => route.fulfill({ json: { data: [row] } }));
  await page.route("**/api/admin/mini-checkpoint-questions/batch", async route => {
    const body = route.request().postDataJSON();
    expect(body.questions[0].question).toBe("Pertanyaan baru");
    row = { ...row, ...body.questions[0], updated_at: "2026-11-27T00:00:01.000000Z" };
    await route.fulfill({ json: { data: [row] } });
  });
  await page.goto("/admin/mini-checkpoint");
  await page.getByRole("combobox", { name: "Program", exact: true }).selectOption("1");
  await page.getByRole("combobox", { name: "Chapter", exact: true }).selectOption("9");
  const question = page.getByRole("textbox", { name: "Pertanyaan", exact: true });
  await expect(question).toHaveText("Pertanyaan lama");
  await question.focus();
  await question.evaluate(element => {
    element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    element.textContent = "Pertanyaan baru";
    element.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: true }));
  });
  await page.getByRole("button", { name: "Simpan Perubahan", exact: true }).click();
  await page.getByRole("button", { name: "Ya, Simpan", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Mini Checkpoint berhasil disimpan" })).toBeVisible();
  await page.getByRole("button", { name: "Mengerti", exact: true }).click();
  await expect(question).toHaveText("Pertanyaan baru");
  await page.reload();
  await page.getByRole("combobox", { name: "Program", exact: true }).selectOption("1");
  await page.getByRole("combobox", { name: "Chapter", exact: true }).selectOption("9");
  await expect(question).toHaveText("Pertanyaan baru");
});

test("Mini batch respects mixed statuses, backend readiness, and active UUID mapping", async ({ page }) => {
  const program = { id: 1, code: "n4", name: "JLPT N4", family: "jlpt" };
  const chapter = { id: 9, program_id: 1, chapter_number: 1, title: "Tata Bahasa Dasar N4", status: "published", mini_checkpoint_duration_minutes: 60, mini_checkpoint_passing_score: 80 };
  let rows = [{ id: 39, chapter_id: 9, question: "Soal pertama", options: { A: "Satu", B: "Dua", C: "Tiga", D: "Empat" }, correct_option: "A", category: null, status: "published", sort_order: 0, updated_at: "2026-11-27T00:00:00.000000Z" }];
  let saves = 0;
  await page.route("**/api/admin/programs", route => route.fulfill({ json: { data: [program] } }));
  await page.route("**/api/admin/chapters", route => route.fulfill({ json: { data: [chapter] } }));
  await page.route("**/api/admin/chapters/9", route => route.fulfill({ json: { data: { ...chapter, mini_checkpoint_readiness_errors: saves ? [] : { duration_minutes: ["The duration minutes field is required."] } } } }));
  await page.route("**/api/admin/mini-checkpoint-questions", route => route.fulfill({ json: { data: rows } }));
  await page.route("**/api/admin/mini-checkpoint-questions/batch", async route => {
    const body = route.request().postDataJSON();
    expect(body.questions.map((item: { status: string }) => item.status)).toEqual(["published", "draft"]);
    expect(body.questions[1]).toMatchObject({ question: saves ? "Soal kedua revisi" : "Soal kedua", instruction: "Instruksi kedua", explanation: "Alasan kedua", correct_option: "A", sort_order: 1 });
    if (!saves) expect(body.questions[1].client_id).not.toMatch(/^\d+$/);
    else expect(body.questions[1].id).toBe(40);
    rows = body.questions.map((item: typeof rows[number], index: number) => ({ ...item, id: 39 + index, updated_at: `2026-11-27T00:00:0${saves + 1}.000000Z` }));
    saves++;
    await route.fulfill({ json: { data: rows } });
  });
  await page.goto("/admin/mini-checkpoint");
  await page.getByRole("combobox", { name: "Program", exact: true }).selectOption("1");
  await page.getByRole("combobox", { name: "Chapter", exact: true }).selectOption("9");
  await expect(page.getByText("Durasi Mini Checkpoint wajib berupa menit positif.", { exact: true })).toBeVisible();
  await page.getByText("Aksi soal", { exact: true }).click();
  await page.getByRole("button", { name: "Duplikat Soal", exact: true }).click();
  const question = page.getByRole("textbox", { name: "Pertanyaan", exact: true });
  await question.fill("Soal kedua");
  await page.getByRole("textbox", { name: "Instruksi (opsional)", exact: true }).fill("Instruksi kedua");
  await page.getByRole("textbox", { name: /Pembahasan/ }).fill("Alasan kedua");
  await page.getByRole("radio", { name: "Draft", exact: true }).check();
  for (const prompt of ["Soal kedua", "Soal kedua revisi"]) {
    if (saves) await question.fill(prompt);
    await page.getByRole("button", { name: "Simpan Perubahan", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Simpan perubahan Mini Checkpoint?" })).toContainText("1 soal Terbit · 1 soal Draft");
    await page.getByRole("button", { name: "Ya, Simpan", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Mini Checkpoint berhasil disimpan" })).toBeVisible();
    await page.getByRole("button", { name: "Mengerti", exact: true }).click();
    await expect(question).toHaveText(prompt);
    await expect(page.getByRole("radio", { name: "Draft", exact: true })).toBeChecked();
    await expect(page.getByText("Konten Mini Checkpoint siap.", { exact: true })).toBeVisible();
  }
  expect(saves).toBe(2);
});
