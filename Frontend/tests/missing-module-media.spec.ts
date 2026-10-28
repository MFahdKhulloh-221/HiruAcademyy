import { expect, test } from "./canonical-fixture";

test("missing module file shows safe unavailable state", async ({ page }) => {
  const chapter = { id: 9, chapter_number: 1, title: "Chapter 1", access: "full", modules: [{ id: 2, title: "Grammar", module_type: "grammar", file_url: "/materials/missing.pdf", file_url_resolved_url: null }] };
  await page.route("**/api/student/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const reply = (data: unknown) => route.fulfill({ json: { data } });
    if (path.endsWith("/access")) return reply({ learning: { n5: "full" }, replay_levels: ["n5"], source_grants: [] });
    if (path.endsWith("/programs")) return reply([{ id: 1, code: "n5", name: "JLPT N5", family: "jlpt" }]);
    if (path.endsWith("/chapters")) return reply([chapter]);
    if (path.endsWith("/chapters/9")) return reply(chapter);
    if (path.endsWith("/progress")) return reply({ chapter_id: 9, activities: {}, mini_unlocked: false });
    await route.fallback();
  });
  await page.goto("/learn/n5/chapter-1/grammar");
  await expect(page.getByRole("status").filter({ hasText: "File materi belum tersedia." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Unduh", exact: true })).toHaveCount(0);
  await expect(page.locator("iframe.learning-module-pdf")).toHaveCount(0);
});
