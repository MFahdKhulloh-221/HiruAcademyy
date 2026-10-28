import { expect, test } from "./canonical-fixture";

const rich = '<strong>Bold</strong><em>Italic</em><u>Underline</u><ruby>学校<rt>がっこう</rt></ruby>';
for (const [kind, route, resource] of [["Checkpoint", "bank-soal/baru?type=checkpoint", "checkpoint-questions"]]) {
  for (const width of [1440, 768, 390]) {
    test(`${kind} rich text saves, reopens, previews at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      const rows: Record<string, unknown>[] = [];
      await page.route("**/api/admin/chapters", r => r.fulfill({ json: { data: [{ id: 9, program_id: 1, title: "Chapter 1", chapter_number: 1, status: "published" }] } }));
      let miniRequests = 0;
      await page.route("**/api/admin/mini-checkpoint-questions**", r => { miniRequests++; return r.fulfill({ json: { data: [] } }); });
      await page.route("**/api/admin/reading-passages", r => r.fulfill({ json: { data: [{ id: 8, chapter_id: 9, title: "Passage", body: rich, status: "published" }] } }));
      await page.route(`**/api/admin/${resource}**`, async r => {
        const req = r.request();
        if (req.method() === "POST") rows.push({ ...req.postDataJSON(), id: 10 });
        if (req.method() === "DELETE") rows.splice(0);
        if (req.method() === "PATCH") Object.assign(rows[0], req.postDataJSON());
        await r.fulfill({ json: { data: req.method() === "GET" ? rows : rows[0] } });
      });
      await page.route("**/api/furigana", r => r.fulfill({ json: { reading: "がっこう" } }));
      await page.goto(`/admin/${route}`);
      await expect(page.locator(".admin-journey-toolbar")).toHaveCount(0);
      await expect(page.getByRole("navigation", { name: "Journey / Kurikulum & Materi" })).toHaveCount(0);
      await page.getByRole("button", { name: "Tambah Soal", exact: true }).click();
      const dialog = page.getByRole("dialog");
      {
        await dialog.getByRole("combobox", { name: "Program", exact: true }).selectOption("1");
        await dialog.getByRole("combobox", { name: "Chapter", exact: true }).selectOption("9");
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
      if (width === 1440) {
        const option = dialog.getByRole("textbox", { name: "Pilihan D", exact: true });
        await option.fill("");
        await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
        await expect(dialog.getByRole("alert")).toContainText("Isi pertanyaan");
        expect(rows).toHaveLength(0);
        await option.fill("Fourth");
        await option.evaluate((element, html) => { element.innerHTML = html; element.dispatchEvent(new Event("input", { bubbles: true })); }, rich);
      }
      const bounds = await dialog.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
      await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      expect(rows[0]).toMatchObject({ correct_option: "C", options: { A: rich, D: rich } });
      expect(rows[0]).not.toHaveProperty("session");
      expect(rows[0]).not.toHaveProperty("duration_minutes");
      expect(rows[0]).toHaveProperty("status", "draft");
      const html = String(rows[0].question);
      expect(html).toMatch(/<(b|strong)>/); expect(html).toMatch(/<(i|em)>/); expect(html).toContain("<u>"); expect(html).toContain("<rt>がっこう</rt>");
      await page.reload();
      await page.getByRole("button", { name: "Edit", exact: true }).first().click();
      await expect(prompt.locator("ruby rt")).toHaveText("がっこう");
      await expect(dialog.getByRole("combobox", { name: "Jawaban benar", exact: true })).toHaveValue("C");
      await dialog.getByRole("textbox", { name: "Pilihan B", exact: true }).fill("Legacy plain answer");
      await dialog.getByRole("combobox", { name: "Status", exact: true }).selectOption("published");
      await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      expect(rows[0]).toHaveProperty("status", "published");
      await page.getByRole("button", { name: "Preview", exact: true }).click();
      await expect(dialog.locator("ruby rt").first()).toHaveText("がっこう");
      await expect(dialog.getByText("Legacy plain answer", { exact: false })).toBeVisible();
      await expect(dialog.locator("strong, b").first()).toBeVisible();
      await expect(dialog.locator("em, i").first()).toBeVisible();
      await expect(dialog.locator("u").first()).toBeVisible();
      await expect(dialog).not.toContainText("<strong>");
      await expect(dialog.getByText("Jawaban benar: C", { exact: true })).toBeVisible();
      await dialog.getByRole("button", { name: "Tutup dialog", exact: true }).click();
      page.once("dialog", d => d.accept());
      await page.getByRole("button", { name: "Hapus", exact: true }).click();
      await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
      expect(rows).toHaveLength(0);
      expect(miniRequests).toBe(0);
    });
  }
}
