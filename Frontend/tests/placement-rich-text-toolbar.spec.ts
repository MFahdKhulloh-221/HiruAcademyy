import { expect, test } from "./canonical-fixture";

test("placement toolbar emits semantic bold italic underline and retains them after save and reopen", async ({ page }) => {
  const rows: Record<string, unknown>[] = [];
  await page.route("**/api/admin/placement-configs", route => route.fulfill({ json: { data: [{ id: 7, title: "Placement", intro_heading: "Intro", duration_minutes: 7, description: "Desc", status: "draft" }] } }));
  await page.route("**/api/admin/placement-questions**", async route => {
    if (route.request().method() === "POST") rows.push({ ...route.request().postDataJSON(), id: 10 });
    await route.fulfill({ json: { data: route.request().method() === "GET" ? rows : rows[0] } });
  });
  await page.goto("/admin/placement-hasil");
  await page.getByRole("combobox", { name: "Kategori kelompok", exact: true }).selectOption("Moji・Goi");
  await page.getByRole("button", { name: "+ Tambah Soal", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Jenis soal", exact: true }).selectOption("Reading");
  await page.route("**/api/furigana", route => route.fulfill({ json: { reading: "にほんご" } }));
  const labels = ["Pertanyaan", "Pilihan A", "Teks bacaan"];
  for (const label of labels) {
    const field = dialog.getByRole("textbox", { name: label, exact: true });
    await field.fill("日本語");
    await expect(field).toHaveCSS("font-weight", "400");
    await expect(field).toHaveCSS("font-style", "normal");
    await expect(field).toHaveCSS("text-decoration-line", "none");
    await field.press("Control+a");
    const editor = dialog.locator(".placement-text-editor").filter({ has: page.getByRole("textbox", { name: label, exact: true }) });
    await editor.getByRole("button", { name: /Furigana/ }).click();
    await expect(editor.getByRole("textbox", { name: "Bacaan Hiragana" })).toHaveValue("にほんご");
    await editor.getByRole("button", { name: "Terapkan", exact: true }).click();
    await expect(field.locator("ruby rt")).toHaveText("にほんご");
    // Ambient browser CSS mode must not change the toolbar's persisted HTML format.
    await page.evaluate(() => document.execCommand("styleWithCSS", false, "true"));
    const toolbar = dialog.getByRole("toolbar", { name: `Format ${label}`, exact: true });
    for (const format of ["bold", "italic", "underline"]) {
      await field.press("Control+a");
      await expect(toolbar.getByRole("button", { name: format, exact: true })).toHaveAttribute("aria-pressed", "false");
      await toolbar.getByRole("button", { name: format, exact: true }).click();
    }
  }
  for (const label of ["Pilihan B", "Pilihan C", "Pilihan D"]) await dialog.getByRole("textbox", { name: label, exact: true }).fill(label);
  await dialog.getByRole("combobox", { name: "Jawaban benar", exact: true }).selectOption("A");
  await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const payload = rows[0];
  for (const html of [payload.prompt, (payload.options as Record<string, string>).A, payload.passage]) {
    expect(html).toMatch(/<(b|strong)>/);
    expect(html).toMatch(/<(i|em)>/);
    expect(html).toContain("<u>");
    expect(html).toContain("<ruby>");
    expect(html).toContain("にほんご");
    expect(html).not.toContain("style=");
  }
  await page.reload();
  await page.getByRole("button", { name: "Edit soal 1", exact: true }).click();
  for (const label of labels) {
    const field = dialog.getByRole("textbox", { name: label, exact: true });
    await expect(field.locator("b, strong").first()).toHaveCSS("font-weight", "700");
    await expect(field.locator("i, em").first()).toHaveCSS("font-style", "italic");
    await expect(field.locator("u").first()).toHaveCSS("text-decoration-line", "underline");
    await expect(field.locator("ruby rt")).toHaveText("にほんご");
  }
});

test("standalone placement controller preserves selection, undo, editor ownership and busy state", async ({ page }) => {
  await page.route("**/api/admin/placement-configs", route => route.fulfill({ json: { data: [{ id: 7, title: "Placement", intro_heading: "Intro", duration_minutes: 7, description: "Desc", status: "draft" }] } }));
  await page.route("**/api/admin/placement-questions**", route => route.fulfill({ json: { data: [] } }));
  await page.goto("/admin/placement-hasil");
  await page.getByRole("combobox", { name: "Kategori kelompok", exact: true }).selectOption("Moji・Goi");
  await page.getByRole("button", { name: "+ Tambah Soal", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const prompt = dialog.getByRole("textbox", { name: "Pertanyaan", exact: true });
  const option = dialog.getByRole("textbox", { name: "Pilihan A", exact: true });
  await expect(dialog.getByRole("toolbar")).toHaveCount(6);
  const promptEditor = dialog.locator(".placement-text-editor").filter({ has: page.getByRole("textbox", { name: "Pertanyaan", exact: true }) });
  const toolbar = promptEditor.getByRole("toolbar");
  await prompt.fill("日本語");
  await expect(prompt).toHaveText("日本語");
  await prompt.press("Control+a");
  const bold = toolbar.getByRole("button", { name: "bold", exact: true });
  await expect(bold).toHaveAttribute("aria-pressed", /true|false/);
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  const beforeBold = await prompt.innerHTML();
  await bold.click();
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  const afterBold = await prompt.innerHTML();
  expect(afterBold).not.toBe(beforeBold);
  await prompt.press("Control+z");
  await expect.poll(() => prompt.innerHTML()).toBe(beforeBold);
  await prompt.press("Control+y");
  await expect.poll(() => prompt.innerHTML()).toBe(afterBold);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/furigana", async route => { await pending; await route.fulfill({ json: { reading: "にほんご" } }); });
  await toolbar.getByRole("button", { name: /Furigana/ }).click();
  await expect(dialog.getByRole("group", { name: "Edit Furigana" })).toBeVisible();
  await option.fill("Other editor");
  release();
  const optionEditor = dialog.locator(".placement-text-editor").filter({ has: page.getByRole("textbox", { name: "Pilihan A", exact: true }) });
  await expect(optionEditor.getByRole("toolbar")).toContainText("Aktif: Pilihan A");
  await expect(toolbar).toContainText("Aktif: Pertanyaan");
  await expect(promptEditor.getByRole("button", { name: "Terapkan", exact: true })).toBeEnabled();
  await promptEditor.getByRole("button", { name: "Terapkan", exact: true }).click();
  await expect(prompt.locator("ruby")).toHaveText("日本語にほんご");
  await expect(dialog.getByRole("group", { name: "Edit Furigana" })).toHaveCount(0);
  await expect(option).toHaveText("Other editor");
  await expect(option.locator("ruby")).toHaveCount(0);
  await option.evaluate(element => {
    const fieldset = element.closest("fieldset");
    if (!fieldset) throw new Error("Expected editor fieldset");
    fieldset.disabled = true;
  });
  await expect(option).toHaveAttribute("contenteditable", "false");
});
