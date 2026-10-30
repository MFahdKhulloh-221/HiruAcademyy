import { expect, test } from "./canonical-fixture";

test("Placement bank needs only category and preserves existing metadata on edit", async ({ page }) => {
  const config = { id: 7, title: "Placement", intro_heading: "Intro", duration_minutes: 7, description: "Desc", status: "draft" };
  const questions = [{ id: 10, placement_config_id: 7, prompt: "Existing question", options: { A: "A", B: "B", C: "C", D: "D" }, correct_option: "A", category: "Bunpou", level: "N5" as string | null, passage: null, explanation: "", status: "draft", sort_order: 42, image_url: null, audio_url: null }];
  const writes: Record<string, unknown>[] = [];
  await page.route("**/api/admin/placement-configs", route => route.fulfill({ json: { data: [config] } }));
  await page.route("**/api/admin/placement-questions**", async route => {
    const request = route.request();
    if (request.method() !== "GET") {
      const body = request.postDataJSON();
      writes.push(body);
      if (request.method() === "POST") questions.push({ ...body, id: 11 });
      else Object.assign(questions.find(question => String(question.id) === new URL(request.url()).pathname.split("/").at(-1))!, body);
      await route.fulfill({ json: { data: questions.at(-1) } });
      return;
    }
    await route.fulfill({ json: { data: questions } });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/placement-hasil");
  await expect(page.getByRole("combobox", { name: "Level kelompok", exact: true })).toHaveCount(0);
  const list = page.getByRole("list", { name: "Daftar soal Placement Test" });
  await expect(list).not.toContainText("N5");
  const add = page.getByRole("button", { name: "+ Tambah Soal", exact: true });
  await expect(add).toBeDisabled();
  await page.getByRole("combobox", { name: "Kategori kelompok", exact: true }).selectOption("Moji・Goi");
  await expect(page.getByText("Existing question", { exact: true })).toHaveCount(0);
  await add.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("note", { name: "Metadata kelompok soal" })).toContainText("Moji・Goi");
  await expect(dialog).not.toContainText("Level");
  await dialog.getByRole("textbox", { name: "Pertanyaan", exact: true }).fill("New vocabulary question");
  for (const letter of ["A", "B", "C", "D"]) await dialog.getByRole("textbox", { name: `Pilihan ${letter}`, exact: true }).fill(`Option ${letter}`);
  await dialog.getByRole("combobox", { name: "Jawaban benar", exact: true }).selectOption("B");
  await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes[0]).toMatchObject({ placement_config_id: 7, level: null, category: "Moji・Goi", sort_order: 43 });
  await expect(page.getByText("New vocabulary question", { exact: true })).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Edit soal 2", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Pertanyaan", exact: true }).fill("Edited question");
  await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes[1]).toMatchObject({ level: null, category: "Moji・Goi", sort_order: 43 });

  await page.getByRole("combobox", { name: "Kategori kelompok", exact: true }).selectOption("Bunpou");
  await page.getByRole("button", { name: "Edit soal 1", exact: true }).click();
  await expect(dialog).not.toContainText("N5");
  await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes[2]).toMatchObject({ level: "N5", category: "Bunpou", sort_order: 42 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
