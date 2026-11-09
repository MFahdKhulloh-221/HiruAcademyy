import { expect, test } from "./canonical-fixture";

for (const width of [390, 1440]) test(`R10 builder preserves reading and student hides it ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  const program = { id: 17, code: "n5", name: "JLPT N5", family: "jlpt" };
  const chapter = { id: 93, program_id: 17, chapter_number: 2, title: "Chapter Uji", access: "full", sort_order: 0, status: "published" };
  let card = { id: 7, chapter_id: 93, japanese: "猫", reading: "ねこ", meaning: "Kucing", example: "猫がいます。", sort_order: 0, status: "published" };
  const writes: Record<string, unknown>[] = [];
  await page.route("**/api/admin/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const reply = (data: unknown) => route.fulfill({ json: { data } });
    if (path === "/api/admin/programs") return reply([program]);
    if (path === "/api/admin/chapters") return reply([chapter]);
    if (path === "/api/admin/flashcards" && method === "GET") return reply([card]);
    if (path.startsWith("/api/admin/flashcards") && ["POST", "PATCH"].includes(method)) {
      const body = route.request().postDataJSON();
      writes.push(body);
      if (body.japanese === "失敗") return route.fulfill({ status: 422, json: { message: "Teks kartu tidak valid.", errors: { japanese: ["Teks kartu tidak valid."] } } });
      card = { ...card, ...body };
      return reply(card);
    }
    return route.fallback();
  });
  await page.goto("/admin/flashcard");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Bacaan", { exact: false })).toHaveCount(0);
  await dialog.getByLabel("Belakang kartu (arti)", { exact: true }).fill("Kucing baru");
  const preview = dialog.getByRole("region", { name: "Pratinjau flashcard" });
  await expect(preview).toContainText("猫");
  await expect(preview).toContainText("Kucing baru");
  await expect(preview).not.toContainText("ねこ");
  await expect(preview.locator("rt")).toHaveCount(0);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes.at(-1)).not.toHaveProperty("reading");
  expect(card.reading).toBe("ねこ");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(dialog.getByLabel("Belakang kartu (arti)", { exact: true })).toHaveValue("Kucing baru");
  await dialog.getByRole("button", { name: "Batal", exact: true }).click();
  await page.getByRole("button", { name: "+ Tambah Kartu", exact: true }).click();
  const front = dialog.getByLabel("Depan kartu (teks Jepang)", { exact: true });
  await expect(front).toHaveAttribute("required", "");
  const reading = dialog.getByLabel("Bacaan (wajib untuk penyimpanan)", { exact: true });
  await expect(reading).toHaveAttribute("required", "");
  await front.fill("失敗");
  await reading.fill("いぬ");
  await dialog.getByLabel("Belakang kartu (arti)", { exact: true }).fill("Anjing");
  await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Periksa kembali data yang dimasukkan.");
  expect(writes.at(-1)).toMatchObject({ japanese: "失敗" });
  await expect(front).toHaveValue("失敗");
  await front.fill("犬");
  await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes.at(-1)).toMatchObject({ japanese: "犬", reading: "いぬ", meaning: "Anjing" });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(front).toHaveValue("犬");
  await dialog.getByRole("button", { name: "Batal", exact: true }).click();

  await page.route("**/api/student/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (!/dashboard$|chapters(?:\/93)?$|progress$|completions$/.test(path)) return route.fallback();
    const progress = { chapter_id: 93, activities: { flashcard: { total: 1, completed: 0, complete: false } }, mini_unlocked: false };
    const data = path.endsWith("/dashboard") ? { programs: [program], access: { learning: { n5: "full" }, replay_levels: [], source_grants: [] }, chapters: [{ program_id: 17, chapter, progress }] }
      : path.endsWith("/chapters") ? [chapter]
      : path.endsWith("/chapters/93") ? { ...chapter, flashcards: [card] }
      : progress;
    return route.fulfill({ json: { data } });
  });
  await page.goto("/practice?category=flashcard");
  await page.getByRole("link", { name: "Buka Flashcard", exact: true }).click();
  const surface = page.locator(".flashcard-surface");
  await expect(surface).toContainText("犬");
  await expect(surface).not.toContainText("いぬ");
  await expect(page.locator(".flashcard-session rt")).toHaveCount(0);
  await surface.focus();
  await page.keyboard.press("Enter");
  await expect(surface).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".flash-back")).toContainText("Anjing");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Sulit", exact: true }).click();
  await expect(page.locator(".flashcard-complete")).toBeVisible();
  await expect(page.locator(".flashcard-complete rt")).toHaveCount(0);
  await expect(page.locator(".flashcard-difficult")).toContainText("犬");
});
