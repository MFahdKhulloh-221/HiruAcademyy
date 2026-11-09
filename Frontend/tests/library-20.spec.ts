import { expect, test } from "./canonical-fixture";

for (const width of [390, 1440]) test(`#20 library categories, IDs, access and errors ${width}; API mocked`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 });
  const program = { id: 1, code: "n5", name: "JLPT N5", family: "jlpt" };
  const modules = [
    { id: 21, title: "Kanji 日と月", module_type: "kanji", file_url: "https://materials.example.test/21.pdf" },
    { id: 22, title: "Tata Bahasa はとが", module_type: "grammar", file_url: "https://materials.example.test/22.pdf" },
    { id: 23, title: "Kanji tanpa file", module_type: "kanji", file_url: null },
    { id: 24, title: "Kanji terkunci", module_type: "kanji", file_url: null },
  ];
  const chapter = { id: 9, chapter_number: 1, title: "Chapter 1", access: "full", modules };
  let failLibrary = true;
  let detailStatus = 200;
  let release!: () => void;
  let pending: Promise<void> | undefined = new Promise(resolve => { release = resolve; });
  const reads: string[] = [];
  await page.route("https://materials.example.test/**", route => route.fulfill({ contentType: "text/plain", body: "Mock document" }));
  await page.route("**/api/student/**", async route => {
    const path = new URL(route.request().url()).pathname;
    reads.push(path);
    const reply = (data: unknown) => route.fulfill({ json: { data } });
    if (path.endsWith("/library")) {
      await pending;
      if (failLibrary) return route.fulfill({ status: 503, json: {} });
      return reply(modules.map(item => ({ ...item, id: `module-${item.id}`, resource_id: item.id, category: item.module_type === "kanji" ? "Kanji" : "Tata Bahasa", level: item.id === 24 ? "N4" : "N5", chapter, program, locked: item.id === 24, href: `/learn/n5/chapter-1/${item.module_type === "kanji" ? "kanji" : "grammar"}` })));
    }
    if (path.endsWith("/chapters")) return reply([chapter]);
    if (path.endsWith("/chapters/9")) return detailStatus === 200 ? reply(chapter) : route.fulfill({ status: detailStatus, json: {} });
    if (path.endsWith("/progress")) return reply({ chapter_id: 9, activities: {}, mini_unlocked: false });
    await route.fallback();
  });
  await page.goto("/library");
  await expect(page.getByText("Memuat materi…", { exact: true })).toBeVisible();
  release(); pending = undefined;
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  failLibrary = false;
  await page.getByRole("button", { name: "Coba Lagi", exact: true }).click();
  await expect(page.getByLabel("Kategori", { exact: true }).locator("option")).toHaveText(["Semua", "Tata Bahasa", "Kanji", "Umum"]);
  await expect(page.locator(".library-material-grid a[href*='/flashcards'], .library-material-grid a[href*='/audio'], .library-material-grid a[href*='/reading'], .library-material-grid a[href*='/checkpoint']")).toHaveCount(0);
  await page.getByLabel("Kategori", { exact: true }).selectOption("Kanji");
  await expect(page.locator(".library-material-grid article")).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "Tata Bahasa はとが", exact: true })).toHaveCount(0);
  await expect(page.locator("article").filter({ has: page.getByRole("heading", { name: "Kanji tanpa file", exact: true }) })).toContainText("File materi belum tersedia.");
  await expect(page.getByRole("link", { name: "Kanji: Kanji tanpa file", exact: true })).toHaveCount(0);
  await page.getByLabel("Level", { exact: true }).selectOption("N4");
  await expect(page.locator(".library-material-grid article")).toHaveCount(1);
  await page.getByRole("button", { name: "Kanji: Kanji terkunci", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Kembali ke Library", exact: true }).click();
  await page.getByLabel("Level", { exact: true }).selectOption("N2");
  await expect(page.getByRole("heading", { name: "Materi yang kamu cari tidak ada", exact: true })).toBeVisible();
  await expect(page.locator(".library-material-grid article")).toHaveCount(0);
  await page.getByLabel("Level", { exact: true }).selectOption("N5");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`library-${width}.png`), fullPage: true });
  await page.getByRole("link", { name: "Kanji: Kanji 日と月", exact: true }).click();
  await expect(page).toHaveURL(/\/kanji\?.*module=21/);
  await expect(page.getByRole("heading", { name: "Kanji 日と月", exact: true })).toBeVisible();
  await expect(page.locator("iframe.learning-module-pdf")).toHaveAttribute("src", modules[0].file_url!);
  await expect(page.locator("iframe.learning-module-pdf")).toHaveCount(1);
  expect(reads).toContain("/api/student/programs/1/chapters/9");
  await page.goto("/library");
  await page.getByLabel("Kategori", { exact: true }).selectOption("Tata Bahasa");
  await expect(page.locator(".library-material-grid article")).toHaveCount(1);
  await page.getByRole("link", { name: "Tata Bahasa: Tata Bahasa はとが", exact: true }).click();
  await expect(page).toHaveURL(/\/grammar\?.*module=22/);
  await expect(page.locator("iframe.learning-module-pdf")).toHaveAttribute("src", modules[1].file_url!);
  await expect(page.locator("iframe.learning-module-pdf")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto("/learn/n5/chapter-1/kanji?module=999");
  await expect(page.getByRole("heading", { name: "Belum ada materi", exact: true })).toBeVisible();
  await expect(page.locator("iframe.learning-module-pdf")).toHaveCount(0);
  for (const status of [403, 404]) {
    detailStatus = status;
    await page.goto("/learn/n5/chapter-1/kanji?module=21&membership=sensei");
    await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
    await expect(page.locator("iframe.learning-module-pdf")).toHaveCount(0);
  }
});
