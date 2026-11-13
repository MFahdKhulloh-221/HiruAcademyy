import { test, expect } from "./canonical-fixture";

for (const kind of ["Reading", "Audio"] as const) {
  test(`${kind} studio selection stays cohesive and chapter depends on program`, async ({ page }) => {
    await page.route("**/api/admin/chapters**", route => route.fulfill({ json: { data: [
      { id: 11, program_id: 1, title: "Chapter N5" },
      { id: 21, program_id: 2, title: "Chapter N4" },
    ] } }));
    await page.goto(`/admin/${kind.toLowerCase()}-question`);
    const card = page.getByRole("region", { name: `Pilihan chapter ${kind}`, exact: true });
    await expect(card.getByRole("heading", { name: `Siapkan materi ${kind}` })).toBeVisible();
    await expect(card.getByRole("heading", { name: "Belum ada chapter dipilih" })).toBeVisible();
    const program = page.getByRole("combobox", { name: "Program", exact: true });
    const chapter = page.getByRole("combobox", { name: "Chapter", exact: true });
    await expect(program.getByRole("option", { name: "JLPT N5", exact: true })).toHaveCount(1);
    await expect(chapter).toBeDisabled();
    await expect(chapter.locator("option:checked")).toHaveText("Pilih chapter");
    expect(await card.evaluate(el => {
      const parent = el.parentElement!;
      const style = getComputedStyle(parent);
      return Math.abs(el.getBoundingClientRect().width - (parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)));
    })).toBeLessThanOrEqual(1);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(card).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const control of [program, chapter]) {
        expect(await control.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      }
    }
    await program.selectOption("1");
    await expect(chapter).toBeEnabled();
    await expect(chapter.getByRole("option")).toHaveText(["Pilih chapter", "Chapter N5"]);
    await chapter.selectOption("11");
    await expect(card).toHaveCount(0);
    await program.selectOption("2");
    await expect(card).toBeVisible();
    await expect(chapter).toHaveValue("");
    await expect(chapter.getByRole("option")).toHaveText(["Pilih chapter", "Chapter N4"]);
    await program.selectOption("");
    await expect(chapter).toBeDisabled();
  });
}
