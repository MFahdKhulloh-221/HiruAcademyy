import { expect, test } from "./canonical-fixture";
import { assessmentSessions, assessmentSessionLabels, currentAnswers, type ServerAttempt } from "../src/lib/assessment-attempt";

for (const marked of [true, false]) test(`Checkpoint ${marked ? "marked skips" : "unmarked keeps"} empty Audio session`, async ({ page }) => {
  await page.setViewportSize({ width: marked ? 390 : 1440, height: 1000 });
  const sessions = assessmentSessions.filter(session => session !== "audio");
  const attempt: ServerAttempt = {
    id: 19, status: "in_progress", revision: 0, current_session: 0,
    ...(marked ? { active_sessions: sessions } : {}),
    questions: sessions.map((session, index) => ({ id: index + 1, session, question: `R19 question ${index + 1}`, options: { A: "First", B: "Second", C: "Third", D: "Fourth" } })),
    answers: {}, result: null,
  };
  const detail = { id: 19, program_id: 1, level: "N5", title: "R19 Checkpoint", max_score: 3, duration_minutes: null, can_access: true, sessions: Object.fromEntries(sessions.map(session => [session, assessmentSessionLabels[assessmentSessions.indexOf(session)]])) };
  await page.route("**/api/student/checkpoint-packages**", async route => {
    const path = new URL(route.request().url()).pathname;
    const reply = (data: unknown) => route.fulfill({ json: { data } });
    if (path.endsWith("/checkpoint-packages")) return reply([detail]);
    if (path.endsWith("/history")) return reply({ best_score: null, attempts: [] });
    if (!path.includes("/attempts")) return reply(detail);
    return reply(attempt);
  });
  await page.goto("/checkpoint?checkpoint=19");
  await page.getByRole("button", { name: "Mulai Checkpoint", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Mulai", exact: true }).click();
  await expect(page.getByRole("heading", { name: "R19 question 1", exact: true })).toBeVisible();
  const audio = page.getByRole("button", { name: "Audio (Choukai)", exact: true });
  if (marked) await expect(audio).toHaveCount(0);
  else await expect(audio).toBeDisabled();
  await page.getByRole("button", { name: "Reading (Dokkai)", exact: true }).click();
  await expect(page.getByRole("heading", { name: "R19 question 3", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reading (Dokkai)", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("complementary").getByRole("button", { name: "Periksa Jawaban", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Periksa Jawaban", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Reading (Dokkai)", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Audio (Choukai)", exact: true })).toHaveCount(marked ? 0 : 1);
  expect(currentAnswers({ ...attempt, current_session: 3 }, { 3: "A" })).toEqual({});
  expect(currentAnswers({ ...attempt, current_session: 2 }, { 1: "B", 3: "A" })).toEqual({ 3: "A" });
});
