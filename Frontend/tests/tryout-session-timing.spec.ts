import { expect, test, type Page } from "@playwright/test";
import { assessmentSessions, assessmentSessionLabels, type ServerAttempt } from "../src/lib/assessment-attempt";

// Browser transport fixture only; Laravel persistence tested separately.
async function mockTiming(page: Page, phase: "session" | "break", filtered = false) {
  const durations = { vocabulary_kanji: 20, grammar: 25, reading: 30, audio: 35 };
  let nextCalls = 0;
  let server: ServerAttempt = {
    id: 9, status: "in_progress", revision: 1, timing_mode: "per_session", phase,
    current_session: phase === "break" ? 1 : 0, completed_sessions: phase === "break" ? ["vocabulary_kanji"] : [],
    session_duration_minutes: durations, break_duration_minutes: 1,
    server_now: "2026-10-11T00:00:00Z", expires_at: phase === "break" ? null : "2026-10-11T00:20:00Z",
    break_ends_at: phase === "break" ? "2026-10-11T00:00:05Z" : null,
    questions: assessmentSessions.map((session, index) => ({ id: index + 1, session, question: `Private question ${session}`, options: { A: "First", B: "Second" } })),
    answers: {}, result: null,
  };
  await page.route(/\/(api\/|sanctum\/csrf-cookie)/, async route => {
    const path = new URL(route.request().url()).pathname;
    const headers = { "access-control-allow-origin": new URL(page.url()).origin, "access-control-allow-credentials": "true", "access-control-allow-methods": "GET, POST, PUT, OPTIONS", "access-control-allow-headers": "accept, content-type, x-xsrf-token" };
    const reply = (data: unknown) => route.fulfill({ headers, json: { data } });
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (path === "/sanctum/csrf-cookie") return route.fulfill({ status: 204, headers: { ...headers, "set-cookie": "XSRF-TOKEN=testing; Path=/" } });
    if (path === "/api/me") return reply({ id: 71, name: "Student", email: "timing@example.test", whatsapp: "081234567890", role: "student", account_status: "active" });
    if (path === "/api/student/dashboard") return reply({ programs: [{ id: 5, code: "n5", name: "JLPT N5", family: "jlpt" }], access: { learning: { n5: "full" }, replay_levels: [], source_grants: [{ plan_code: "sensei", program_code: "n5" }] }, chapters: [] });
    if (path === "/api/student/access") return reply({ learning: { n5: "full" }, replay_levels: [], source_grants: [{ plan_code: "sensei", program_code: "n5" }] });
    if (path === "/api/public/programs") return reply([{ id: 5, code: "n5", name: "JLPT N5", family: "jlpt" }]);
    const detail = { id: 2, level: "N5", title: "Timed exam", duration_minutes: null, timing_mode: "per_session", session_duration_minutes: durations, break_duration_minutes: 1, max_score: 4, sessions: Object.fromEntries(assessmentSessions.map((session, index) => [session, assessmentSessionLabels[index]])) };
    if (path === "/api/student/try-outs") return reply([detail]);
    if (path === "/api/student/try-outs/2") return reply(detail);
    if (path.endsWith("/history")) return reply({ best_score: null, attempts: [] });
    if (path.includes("/attempts")) {
      if (path.endsWith("/next-session")) {
        nextCalls++;
        expect(route.request().postDataJSON().revision).toBe(server.revision);
        server = { ...server, phase: "session", revision: server.revision! + 1, server_now: "2026-10-11T00:00:05Z", session_started_at: "2026-10-11T00:00:05Z", expires_at: "2026-10-11T00:25:05Z", break_ends_at: null };
      }
      return reply(filtered ? { ...server, questions: server.phase === "break" ? [] : server.questions.filter(question => question.session === assessmentSessions[server.current_session ?? 0]) } : server);
    }
    return reply([]);
  });
  return { nextCalls: () => nextCalls };
}

for (const width of [390, 1440]) test(`per-session break blocks questions and waits for explicit start at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.clock.install({ time: new Date("2026-10-11T00:00:00Z") });
  const mock = await mockTiming(page, "break", width === 1440);
  await page.goto("/tryout?tryout=2&attempt=9&tryout_question=4&tryout_stage=check");
  await expect(page.getByRole("heading", { name: "Sesi Kosakata & Kanji selesai" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sesi berikutnya: Tata Bahasa" })).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(page.locator(".learning-question-card")).toHaveCount(0);
  const start = page.getByRole("button", { name: "Mulai Sesi Berikutnya", exact: true });
  await expect(start).toBeDisabled();
  await page.clock.runFor(6000);
  await expect(start).toBeEnabled();
  expect(mock.nextCalls()).toBe(0);
  await expect(page.getByRole("radio")).toHaveCount(0);
  await start.click();
  await expect(page.getByRole("heading", { name: "Private question grammar", exact: true })).toBeVisible();
  expect(mock.nextCalls()).toBe(1);
  await expect(page.getByRole("timer")).toContainText("Sisa waktu sesi");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Private question grammar", exact: true })).toBeVisible();
  await expect(page.getByText("Private question audio", { exact: true })).toHaveCount(0);
});

test("active session ignores future URL and checks only current questions", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockTiming(page, "session");
  await page.goto("/tryout?tryout=2&attempt=9&tryout_question=4&tryout_stage=check");
  await expect(page.getByRole("heading", { name: "Private question vocabulary_kanji", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tata Bahasa", exact: true })).toHaveCount(0);
  await expect(page.getByText("Private question audio", { exact: true })).toHaveCount(0);
  await page.locator(".tryout-sidebar-actions").getByRole("button", { name: "Periksa Jawaban", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Periksa Jawaban", exact: true })).toBeVisible();
  await expect(page.locator(".tryout-check-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Selesaikan Sesi", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Selesaikan Sesi?", exact: true });
  await expect(dialog).toContainText("Jawaban sesi Kosakata & Kanji");
  await expect(dialog).toContainText("Masih ada 1 soal");
  await dialog.getByRole("button", { name: "Kembali Periksa", exact: true }).click();
});
