import { expect, test } from "./canonical-fixture";
import { assessmentSessions } from "../src/lib/assessment-attempt";

for (const width of [1440, 768, 390]) test(`admin access and free student attempt ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  const program = { id: 1, code: "n5", name: "JLPT N5", family: "jlpt" };
  const questions = assessmentSessions.flatMap((session, section) => Array.from({ length: 25 }, (_, index) => ({ id: section * 25 + index + 1, session, question: `Question ${section * 25 + index + 1}`, options: { A: "First", B: "Second", C: "Third", D: "Fourth" }, correct_option: "A", explanation: "Review explanation", point_value: index < 20 ? 2 : 1, status: "published", sort_order: index, reading_passage: session === "reading" ? "Passage" : null, audio_url: session === "audio" ? "https://example.test/audio.mp3" : null })));
  let item = { id: 7, program_id: 1, title: "Access Try Out", status: "published", access_type: "membership", duration_minutes: null, max_score: 180, total_passing_score: 1, session_passing_scores: null, sort_order: 0, questions };
  let revision = 0;
  let completed = false;
  let answers: Record<string, string> = {};
  await page.route("**/api/admin/programs", r => r.fulfill({ json: { data: [program] } }));
  await page.route("**/api/admin/try-outs**", async r => {
    const path = new URL(r.request().url()).pathname;
    if (r.request().method() === "PATCH") item = { ...item, ...r.request().postDataJSON() };
    await r.fulfill({ json: { data: path.endsWith("/try-outs") ? [item] : item } });
  });
  await page.route("**/api/student/dashboard", r => r.fulfill({ json: { data: { programs: [program], access: { learning: { n5: "preview" }, replay_levels: [], source_grants: [] }, chapters: [] } } }));
  await page.route("**/api/student/try-outs**", async r => {
    const path = new URL(r.request().url()).pathname;
    const reply = (data: unknown) => r.fulfill({ json: { data } });
    if (path.endsWith("/try-outs")) return reply([{ ...item, questions: undefined, level: "N5", can_access: item.access_type === "free" }]);
    if (path.endsWith("/history")) return reply({ attempts: [], best_score: null });
    if (path.includes("/attempts")) {
      if (r.request().method() === "PUT") { answers = r.request().postDataJSON().answers; revision++; }
      if (path.endsWith("/submit")) { completed = true; revision++; }
      const review = path.endsWith("/review");
      return reply({ id: 9, status: completed ? "completed" : "in_progress", revision, answers, current_session: 0, completed_sessions: [], questions: questions.map(q => review ? q : { ...q, correct_option: undefined, explanation: undefined }), result: completed ? { earned: 1, max: 180, correct: 1, wrong: 0, unanswered: 99, sessions: [] } : null });
    }
    return reply({ ...item, level: "N5", sessions: Object.fromEntries(assessmentSessions.map(session => [session, session])) });
  });
  await page.goto("/tryout?tryout=7");
  await expect(page.getByRole("link", { name: "Upgrade Membership", exact: true })).toHaveAttribute("href", "/renewal?target=N5");
  await expect(page.getByRole("button", { name: "Mulai Try Out", exact: true })).toHaveCount(0);
  await page.goto("/admin/try-out");
  await page.getByRole("row").filter({ hasText: "Access Try Out" }).getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("combobox", { name: /^Akses Try Out/ }).selectOption("free");
  await page.getByRole("button", { name: "Simpan Try Out", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(item.access_type).toBe("free");
  await page.goto("/tryout");
  await expect(page.locator(".tryout-status-badge")).toContainText("GRATIS");
  await page.getByRole("button", { name: "Mulai Try Out", exact: true }).click();
  await page.getByRole("button", { name: "Mulai Try Out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Question 1", exact: true })).toBeVisible();
  const saved = page.waitForResponse(r => r.request().method() === "PUT");
  await page.getByRole("radio", { name: "A. First", exact: true }).focus();
  await page.keyboard.press("Space");
  await saved;
  await expect(page.getByText("Review explanation", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Periksa Jawaban", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Periksa Jawaban", exact: true })).toBeFocused();
  const confirmation = page.waitForEvent("dialog");
  const finish = page.getByRole("button", { name: "Selesaikan Kuis", exact: true }).click();
  const dialog = await confirmation;
  expect(dialog.type()).toBe("confirm");
  expect(dialog.message()).toContain("Masih ada 99 soal yang belum dijawab");
  await dialog.accept();
  await finish;
  await page.getByRole("button", { name: "Review Jawaban", exact: true }).click();
  await expect(page.getByText("Review explanation", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
