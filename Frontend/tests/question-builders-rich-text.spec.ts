import { expect, test } from "./canonical-fixture";

const rich = '<strong>Bold</strong><em>Italic</em><u>Underline</u><ruby>学校<rt>がっこう</rt></ruby>';
for (const [kind, route, resource] of [["Reading", "reading-question", "reading-questions"], ["Audio", "audio-question", "audio-questions"], ["Mini Checkpoint", "mini-checkpoint", "mini-checkpoint-questions"]]) {
  for (const width of [1440, 768, 390]) {
    test(`${kind} rich text saves, reopens, previews at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      const rows: Record<string, unknown>[] = [];
      await page.route("**/api/admin/chapters", r => r.fulfill({ json: { data: [{ id: 9, program_id: 1, title: "Chapter 1", chapter_number: 1, status: "published" }] } }));
      await page.route("**/api/admin/reading-passages", r => r.fulfill({ json: { data: [{ id: 8, chapter_id: 9, title: "Passage", body: rich, status: "published" }] } }));
      await page.route(`**/api/admin/${resource}**`, async r => {
        const req = r.request();
        if (req.method() === "POST") rows.push({ ...req.postDataJSON(), id: 10 });
        if (req.method() === "PATCH") Object.assign(rows[0], req.postDataJSON());
        await r.fulfill({ json: { data: req.method() === "GET" ? rows : rows[0] } });
      });
      await page.route("**/api/furigana", r => r.fulfill({ json: { reading: "がっこう" } }));
      await page.goto(`/admin/${route}`);
      await page.getByRole("button", { name: "Tambah Soal", exact: true }).click();
      const dialog = page.getByRole("dialog");
      if (kind === "Reading") await dialog.getByRole("combobox", { name: "Teks bacaan", exact: true }).selectOption("8");
      else {
        await dialog.getByRole("combobox", { name: "Program", exact: true }).selectOption("1");
        await dialog.getByRole("combobox", { name: "Chapter", exact: true }).selectOption("9");
      }
      if (kind === "Audio") await dialog.getByRole("textbox", { name: "URL audio", exact: true }).fill("media/audio.mp3");
      if (kind === "Mini Checkpoint") {
        await dialog.getByRole("spinbutton", { name: "Sesi", exact: true }).fill("2");
        await dialog.getByRole("spinbutton", { name: "Part", exact: true }).fill("3");
        await dialog.getByRole("spinbutton", { name: "Durasi (menit)", exact: true }).fill("15");
      }
      const prompt = dialog.getByRole("textbox", { name: "Pertanyaan", exact: true });
      await prompt.fill("学校");
      const toolbar = dialog.getByRole("toolbar", { name: "Format Pertanyaan", exact: true });
      async function select() {
        await prompt.focus();
        await prompt.evaluate(element => {
          const range = document.createRange(); range.selectNodeContents(element);
          const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
          element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        });
      }
      await select(); await toolbar.getByRole("button", { name: /Furigana/ }).click();
      await expect(dialog.getByLabel("Bacaan Hiragana", { exact: true })).toHaveValue("がっこう");
      await dialog.getByRole("button", { name: "Terapkan", exact: true }).click();
      for (const format of ["bold", "italic", "underline"]) { await select(); await toolbar.getByRole("button", { name: format, exact: true }).click(); }
      for (const label of ["Pilihan A", "Pilihan B", "Pilihan C", "Pilihan D", "Penjelasan jawaban"]) {
        const field = dialog.getByRole("textbox", { name: label, exact: true });
        await field.fill("Legacy text");
        await field.evaluate((element, html) => { element.innerHTML = html; element.dispatchEvent(new Event("input", { bubbles: true })); }, rich);
      }
      await dialog.getByRole("combobox", { name: "Jawaban benar", exact: true }).selectOption("C");
      const bounds = await dialog.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
      await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      expect(rows[0]).toMatchObject({ correct_option: "C", options: { A: rich, D: rich } });
      if (kind === "Mini Checkpoint") expect(rows[0]).toMatchObject({ session: 2, part: 3, duration_minutes: 15 });
      const html = String(rows[0].question);
      expect(html).toMatch(/<(b|strong)>/); expect(html).toMatch(/<(i|em)>/); expect(html).toContain("<u>"); expect(html).toContain("<rt>がっこう</rt>");
      await page.reload();
      await page.getByRole("button", { name: "Edit", exact: true }).first().click();
      await expect(prompt.locator("ruby rt")).toHaveText("がっこう");
      await expect(dialog.getByRole("combobox", { name: "Jawaban benar", exact: true })).toHaveValue("C");
      await dialog.getByRole("textbox", { name: "Pilihan B", exact: true }).fill("Legacy plain answer");
      await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await page.getByRole("button", { name: "Preview", exact: true }).click();
      await expect(dialog.locator("ruby rt").first()).toHaveText("がっこう");
      await expect(dialog.getByText("Legacy plain answer", { exact: false })).toBeVisible();
      await expect(dialog.locator("strong, b").first()).toBeVisible();
    });
  }
}

test("Reading passage uses Placement editor and persists formatted body", async ({ page }) => {
  await page.route("**/api/admin/chapters", r => r.fulfill({ json: { data: [{ id: 9, program_id: 1, title: "Chapter 1" }] } }));
  await page.goto("/admin/reading-question");
  await page.getByRole("button", { name: "Teks bacaan", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Chapter", exact: true }).selectOption("9");
  await dialog.getByRole("textbox", { name: "Judul", exact: true }).fill("Rich passage");
  await dialog.getByRole("textbox", { name: "Teks bacaan", exact: true }).evaluate((el, html) => { el.innerHTML = html; el.dispatchEvent(new Event("input", { bubbles: true })); }, rich);
  await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await page.getByRole("row").filter({ hasText: "Rich passage" }).getByRole("button", { name: "Edit", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "Teks bacaan", exact: true }).locator("ruby rt")).toHaveText("がっこう");
});
