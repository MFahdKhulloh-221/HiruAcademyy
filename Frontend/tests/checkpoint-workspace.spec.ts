import { expect, test } from "./canonical-fixture";

for (const width of [1440, 768, 390]) {
  test(`Checkpoint bank separate and usable ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const rows = Array.from({ length: 25 }, (_, index) => ({ id: index + 1, chapter_id: 9, question: `Checkpoint question ${index + 1}`, options: { A: "First", B: "Second", C: "Third", D: "Fourth" }, correct_option: "B", explanation: "Private explanation", status: "published", sort_order: index }));
    const writes: string[] = [];
    await page.route("**/api/admin/chapters", route => route.fulfill({ json: { data: [{ id: 9, program_id: 1, chapter_number: 1, title: "Chapter 1", status: "published" }] } }));
    await page.route("**/api/admin/checkpoint-questions**", async route => {
      const method = route.request().method();
      const id = Number(new URL(route.request().url()).pathname.split("/").at(-1));
      if (method === "GET") return route.fulfill({ json: { data: rows } });
      writes.push(method);
      if (method === "DELETE") { rows.splice(rows.findIndex(row => row.id === id), 1); return route.fulfill({ status: 204 }); }
      const body = route.request().postDataJSON();
      const item = method === "POST" ? { ...body, id: 99 } : Object.assign(rows.find(row => row.id === id)!, body);
      if (method === "POST") rows.push(item);
      await route.fulfill({ json: { data: item } });
    });
    await page.route("**/api/admin/checkpoint-packages", route => route.fulfill({ json: { data: [] } }));
    await page.route("**/api/student/checkpoint-packages", route => route.fulfill({ json: { data: [] } }));
    await page.goto("/admin");
    if (width < 1024) {
      await page.getByRole("button", { name: "Buka navigasi admin", exact: true }).click();
    }
    await page.getByRole("link", { name: "Checkpoint", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/checkpoint$/);
    await page.getByRole("tab", { name: "Bank Soal", exact: true }).click();
    await page.getByRole("combobox", { name: "Program", exact: true }).selectOption("1");
    await page.getByRole("combobox", { name: "Chapter", exact: true }).selectOption("9");
    const list = page.getByRole("complementary", { name: "Daftar soal Checkpoint", exact: true });
    await expect(list.getByRole("listitem")).toHaveCount(10);
    await list.getByRole("button", { name: "Berikutnya", exact: true }).click();
    await expect(list).toContainText("Halaman 2 / 3");
    await list.getByRole("button").filter({ hasText: "Soal 11" }).click();
    const editor = page.getByRole("region", { name: "Editor soal Checkpoint", exact: true });
    await editor.getByRole("textbox", { name: "Pertanyaan", exact: true }).fill("Edited Checkpoint");
    const prompt = editor.getByRole("textbox", { name: "Pertanyaan", exact: true });
    const toolbar = editor.getByRole("toolbar", { name: "Format Pertanyaan", exact: true });
    async function selectText() {
      await prompt.focus();
      await prompt.evaluate(element => { const range = document.createRange(); range.selectNodeContents(element); const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range); element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true })); });
    }
    await page.route("**/api/furigana", route => route.fulfill({ json: { reading: "checkpoint" } }));
    await selectText();
    await toolbar.getByRole("button", { name: /Furigana/ }).click();
    await expect(editor.getByLabel("Bacaan Hiragana", { exact: true })).toHaveValue("checkpoint");
    await editor.getByLabel("Bacaan Hiragana", { exact: true }).fill("reading");
    await editor.getByRole("button", { name: "Terapkan", exact: true }).click();
    for (const label of ["bold", "italic", "underline"]) { await selectText(); await toolbar.getByRole("button", { name: label, exact: true }).click(); }
    await expect(prompt.locator("ruby rt")).toHaveText("reading");
    await expect(prompt.locator("b, strong")).toBeVisible();
    await expect(prompt.locator("i, em")).toBeVisible();
    await expect(prompt.locator("u")).toBeVisible();
    if (width === 390) await editor.getByRole("button", { name: "Kembali ke daftar soal", exact: true }).click();
    await list.getByRole("button").filter({ hasText: "Soal 12" }).click();
    if (width === 390) await editor.getByRole("button", { name: "Kembali ke daftar soal", exact: true }).click();
    await list.getByRole("button").filter({ hasText: "Soal 11" }).click();
    await expect(prompt.locator("ruby rt")).toHaveText("reading");
    await editor.getByRole("button", { name: "Simpan Soal", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "berhasil disimpan" })).toBeVisible();
    await editor.getByRole("button", { name: "Pratinjau Siswa", exact: true }).click();
    const preview = editor.getByRole("region", { name: "Pratinjau Siswa", exact: true });
    await expect(preview).toContainText("Edited Checkpoint");
    await expect(preview.locator("ruby rt")).toHaveText("reading");
    expect(rows.find(row => row.id === 11)!.question).toContain("<ruby>");
    await expect(preview).not.toContainText("Private explanation");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "+ Tambah Soal", exact: true }).click();
    await editor.getByRole("textbox", { name: "Pertanyaan", exact: true }).fill("New Checkpoint");
    for (const letter of ["A", "B", "C", "D"]) await editor.getByRole("textbox", { name: `Pilihan ${letter}`, exact: true }).fill(`Answer ${letter}`);
    await editor.getByRole("button", { name: "Simpan Soal", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "berhasil disimpan" })).toBeVisible();
    await editor.getByRole("button", { name: "Hapus Soal", exact: true }).click();
    await page.getByRole("dialog", { name: "Hapus soal Checkpoint?", exact: true }).getByRole("button", { name: "Hapus", exact: true }).click();
    await expect(editor.getByRole("textbox")).toHaveCount(0);
    expect(writes).toEqual(["PATCH", "POST", "DELETE"]);
    await page.getByRole("tab", { name: "Paket Checkpoint", exact: true }).click();
    await expect(page.getByRole("button", { name: "+ Tambah Checkpoint", exact: true })).toBeVisible();
    await page.goto("/checkpoint");
    if (width < 1024) await page.getByRole("button", { name: "Buka navigasi", exact: true }).click();
    await page.getByRole("link", { name: "Checkpoint", exact: true }).click();
    await expect(page).toHaveURL(/\/checkpoint/);

    await expect(page.getByRole("heading", { name: "Checkpoint", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Mulai/ })).toHaveCount(0);
  });
}


test("Placement existing editor remains independent from Checkpoint", async ({ page }) => {
  await page.route("**/api/admin/placement-configs", route => route.fulfill({ json: { data: [{ id: 1, title: "Placement Test", description: "Placement regression", duration_minutes: 7, question_count: 0, status: "draft", recommendation_rules: [] }] } }));
  await page.goto("/admin/placement-hasil");
  await expect(page.getByRole("heading", { name: "Placement Test", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "+ Tambah Soal", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Tambah Soal", exact: true });
  const prompt = dialog.getByRole("textbox", { name: "Pertanyaan", exact: true });
  await prompt.fill("Placement regression");
  await expect(prompt).toHaveText("Placement regression");
  await expect(dialog.getByRole("toolbar", { name: "Format Pertanyaan", exact: true }).getByRole("button", { name: /Furigana/ })).toBeVisible();
});
