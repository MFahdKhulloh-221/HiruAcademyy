import { expect, test } from "./canonical-fixture";

for (const direct of [false, true]) test(`locked Checkpoint completed history ${direct ? "direct URL" : "catalog"}`, async ({ page }) => {
  const calls: string[] = [];
  const attempt = { id: 11, status: "completed", questions: [{ id: 1, session: "grammar", question: "Historical question", options: { A: "First", B: "Second" } }], answers: { 1: "A" }, result: { correct: 1, wrong: 0, unanswered: 0, earned: 100, max: 100, sessions: [] } };
  await page.route("**/api/student/checkpoint-packages**", async route => {
    const path = new URL(route.request().url()).pathname;
    calls.push(`${route.request().method()} ${path}`);
    if (path.endsWith("checkpoint-packages")) return route.fulfill({ json: { data: [{ id: 1, program_id: 1, level: "n5", title: "Historical Checkpoint", can_access: false, sessions: { grammar: "Grammar" } }] } });
    if (path.endsWith("/history")) return route.fulfill({ json: { data: { best_score: 100, attempts: [{ id: 11, status: "completed" }] } } });
    if (path.endsWith("/result")) return route.fulfill({ json: { data: attempt } });
    if (path.endsWith("/review")) return route.fulfill({ json: { data: { ...attempt, questions: attempt.questions.map(question => ({ ...question, correct_option: "A", explanation: "Historical explanation" })) } } });
    return route.fulfill({ status: 403, json: { message: "Locked" } });
  });
  await page.goto(direct ? "/checkpoint?checkpoint=1&attempt=11" : "/checkpoint");
  if (!direct) {
    await page.getByRole("button", { name: "Riwayat Checkpoint", exact: true }).click();
    await page.getByRole("button", { name: "Lihat Hasil #11", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "Hasil Historical Checkpoint", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Total Skor", exact: true }).locator("..")).toContainText(/100\s*\/\s*100/);
  await expect(page.getByRole("button", { name: /Ulangi|Mulai|Lanjutkan/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Review Jawaban", exact: true }).click();
  await expect(page.getByText("Historical explanation", { exact: false })).toBeVisible();
  for (const radio of await page.getByRole("radio").all()) await expect(radio).toBeDisabled();
  expect(calls).toContain("GET /api/student/checkpoint-packages/1/attempts/11/result");
  expect(calls.every(call => call.startsWith("GET "))).toBe(true);
  expect(calls).not.toContain("GET /api/student/checkpoint-packages/1");
  expect(calls).not.toContain("GET /api/student/checkpoint-packages/1/attempts/11");
});

test("locked Checkpoint rejects unfinished result without offering start", async ({ page }) => {
  const writes: string[] = [];
  await page.route("**/api/student/checkpoint-packages**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== "GET") writes.push(path);
    const data = path.endsWith("checkpoint-packages")
      ? [{ id: 1, level: "n5", title: "Locked Checkpoint", can_access: false, sessions: {} }]
      : path.endsWith("/history") ? { best_score: null, attempts: [] }
      : { id: 11, status: "in_progress", questions: [], answers: {}, result: null };
    await route.fulfill({ json: { data } });
  });
  await page.goto("/checkpoint?checkpoint=1&attempt=11");
  await expect(page.getByRole("region", { name: "Riwayat Checkpoint" }).getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: /Ulangi|Mulai|Lanjutkan/ })).toHaveCount(0);
  expect(writes).toEqual([]);
});
