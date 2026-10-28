import { expect, test } from "./canonical-fixture";

for (const width of [1440, 768, 390]) test(`practice completion updates recommendations ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  let complete = false;
  let answers: Record<string, string> = {};
  let revision = 0;
  let fail = false;
  let empty = false;
  let locked = false;
  const program = { id: 1, code: "n5", name: "JLPT N5", family: "jlpt" };
  const access = { learning: { n5: "full" }, replay_levels: [], source_grants: [{ plan_code: "lms", program_code: "n5" }] };
  const chapter = () => ({ id: 11, chapter_number: 1, title: "Practice Chapter", sort_order: 1, access: locked ? "locked" : "full" });
  const progress = () => ({ chapter_id: 11, activities: { reading: { total: empty ? 0 : 1, completed: complete ? 1 : 0, complete, completed_ids: complete ? [81] : [] }, audio: { total: 0, completed: 0, complete: false } }, mini_unlocked: false });
  const question = { id: 81, question: "Real bank question", options: { A: "First", B: "Second", C: "Third", D: "Fourth" } };
  const attempt = () => ({ id: 4, kind: "reading", chapter_id: 11, revision, status: complete ? "completed" : "in_progress", answers, questions: [question], result: complete ? { correct: 1, wrong: 0, unanswered: 0, percentage: 100 } : null });
  await page.route(/\/api\/student\//, async r => {
    const path = new URL(r.request().url()).pathname;
    const reply = (data: unknown) => r.fulfill({ json: { data } });
    if (path.endsWith("/dashboard")) {
      if (fail) return r.fulfill({ status: 503, json: {} });
      return reply({ programs: [program], access, chapters: [{ program_id: 1, chapter: chapter(), ...(locked ? {} : { progress: progress() }) }] });
    }
    if (path.endsWith("/chapters")) return reply([chapter()]);
    if (path.endsWith("/chapters/11")) return reply(chapter());
    if (path.endsWith("/progress")) return reply(progress());
    if (path.includes("/attempts")) {
      if (path.endsWith("/answers")) { answers = r.request().postDataJSON().answers; revision++; }
      if (path.endsWith("/submit")) {
        expect(r.request().postDataJSON().answers).toEqual({ "81": "A" });
        complete = true;
      }
      return reply(attempt());
    }
    await r.fallback();
  });
  await page.goto("/dashboard");
  const recommendations = page.getByRole("region", { name: "Rekomendasi latihan", exact: true });
  await expect(recommendations.getByRole("link")).toHaveCount(1);
  await expect(recommendations).toContainText("Reading (0/1)");
  await recommendations.getByRole("link").click();
  await expect(page.getByRole("heading", { name: "Real bank question", exact: true })).toBeVisible();
  await expect(page.getByText("Jawaban benar:", { exact: false })).toHaveCount(0);
  const saved = page.waitForResponse(response => response.url().endsWith("/answers") && response.request().method() === "PUT");
  await page.getByRole("radio", { name: "A. First", exact: true }).check();
  await saved;
  await page.getByRole("button", { name: "Kumpulkan Jawaban", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Hasil Reading", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Kembali ke Daftar Latihan", exact: true }).click();
  await expect(page.locator(".practice-journey-card")).toContainText("1/1 soal selesai");
  await expect(page.getByRole("button", { name: "Latihan Lagi", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Kosakata", exact: true })).toHaveCount(0);
  await page.goto("/dashboard");
  await expect(recommendations.getByRole("link")).toHaveCount(0);
  await expect(recommendations).toContainText("Tidak ada latihan belum selesai");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  fail = true;
  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: "Permintaan belum berhasil" })).toBeVisible();
  fail = false;
  empty = true;
  await page.getByRole("button", { name: "Coba Lagi", exact: true }).click();
  await expect(recommendations.getByRole("link")).toHaveCount(0);
  await page.goto("/practice");
  await expect(page.getByRole("status")).toContainText("Belum ada latihan soal");
  locked = true;
  empty = false;
  await page.reload();
  await expect(page.locator(".practice-journey-card")).toHaveCount(0);
});
