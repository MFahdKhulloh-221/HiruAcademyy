import { expect, test } from "./canonical-fixture";

test("Mini saves edited text when composition ends by leaving question field", async ({ page }) => {
  const program = { id: 1, code: "n4", name: "JLPT N4", family: "jlpt" };
  const chapter = { id: 9, program_id: 1, chapter_number: 1, title: "Tata Bahasa Dasar N4", status: "published", mini_checkpoint_duration_minutes: 60, mini_checkpoint_passing_score: 80 };
  let row = { id: 39, chapter_id: 9, question: "Pertanyaan lama", options: { A: "Satu", B: "Dua", C: "Tiga", D: "Empat" }, correct_option: "A", category: null, status: "published", sort_order: 0, updated_at: "2026-11-27T00:00:00.000000Z" };
  await page.route("**/api/admin/programs", route => route.fulfill({ json: { data: [program] } }));
  await page.route("**/api/admin/chapters", route => route.fulfill({ json: { data: [chapter] } }));
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
  await page.getByRole("button", { name: "Simpan & Terbitkan", exact: true }).click();
  await page.getByRole("button", { name: "Ya, Terbitkan", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Mini Checkpoint berhasil diterbitkan" })).toBeVisible();
  await page.getByRole("button", { name: "Mengerti", exact: true }).click();
  await expect(question).toHaveText("Pertanyaan baru");
  await page.reload();
  await page.getByRole("combobox", { name: "Program", exact: true }).selectOption("1");
  await page.getByRole("combobox", { name: "Chapter", exact: true }).selectOption("9");
  await expect(question).toHaveText("Pertanyaan baru");
});
