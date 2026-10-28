import { expect, test, type Page } from "@playwright/test";
import { dashboardFixture } from "./canonical-fixture";
import type { AuthUser } from "../src/components/auth-provider";
import type { AttemptQuestion, ServerAttempt } from "../src/lib/assessment-attempt";
import type { CanonicalChapter, ChapterProgress, LearningAccess, LearningProgram } from "../src/lib/learning-api";

type MiniAttempt = Omit<ServerAttempt, "questions"> & { chapter_id: number; kind: "mini"; submitted_at: string | null; questions: (Omit<AttemptQuestion, "session"> & { session: number; part: number; duration_minutes: number })[] };

async function mockMiniApi(page: Page, questionCount = 1, faults: { startDelay?: number; saveError?: boolean; submitErrors?: number; miniEligible?: boolean } = {}) {
  const users: Record<string, AuthUser> = {
    A: { id: 71, name: "Mini Account A", email: "mini-a@example.test", whatsapp: "081234567890", role: "student", account_status: "active" },
    B: { id: 72, name: "Mini Account B", email: "mini-b@example.test", whatsapp: "081234567891", role: "student", account_status: "active" },
  };
  const programs: LearningProgram[] = [
    { id: 5, code: "n5", name: "JLPT N5", family: "jlpt" },
    { id: 4, code: "n4", name: "JLPT N4", family: "jlpt" },
  ];
  let account: "A" | "B" | undefined;
  const calls: string[] = [];
  const unknown: string[] = [];
  const errors: string[] = [];
  const attempts = new Map<number, { owner: string; program: number; data: MiniAttempt }>();
  page.on("pageerror", error => errors.push(error.message));
  const count = (method: string, path: string, owner = account) => calls.filter(call => call === `${owner}:${method} ${path}`).length;
  const chapter = (program: number): CanonicalChapter => ({
    id: program === 5 ? 9 : 8, chapter_number: 1, sort_order: 0,
    title: `${account} ${program === 5 ? "N5" : "N4"} content`,
    access: account === "B" && program === 4 ? "none" : "full",
    flashcards: [{ id: program * 10, japanese: program === 5 ? "猫" : "犬", reading: program === 5 ? "ねこ" : "いぬ", meaning: program === 5 ? "Cat" : "Dog", example: null, sort_order: 0 }],
    video_lessons: [], modules: [], mini_checkpoint: { exists: true },
    mini_checkpoints: [1, 2].map(part => ({ session: 1, part, duration_minutes: 2, passing_score: 70, question_count: questionCount, configuration_valid: true })),
  });
  const progress = (program: number): ChapterProgress => ({
    chapter_id: program === 5 ? 9 : 8,
    activities: { flashcard: { total: 1, completed: account === "A" ? 1 : 0, complete: account === "A" } },
    mini_eligible: faults.miniEligible ?? account === "A",
    mini_unlocked: (faults.miniEligible ?? true) && account === "A",
  });
  await page.context().route(/\/(api\/|sanctum\/csrf-cookie)/, async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const headers = {
      "access-control-allow-origin": new URL(page.url()).origin,
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET, POST, PUT, OPTIONS",
      "access-control-allow-headers": "accept, content-type, x-xsrf-token",
    };
    const reply = (data: unknown, status = 200) => route.fulfill({ status, headers, json: { data } });
    const known = path === "/sanctum/csrf-cookie" || ["/api/me", "/api/auth/login", "/api/auth/logout", "/api/public/programs", "/api/student/access", "/api/student/dashboard", "/api/student/gamification", "/api/student/leaderboard", "/api/student/notifications"].includes(path)
      || /^\/api\/student\/programs\/(5|4)\/chapters(?:\/(9|8)(?:\/progress|\/attempts(?:\/\d+(?:\/answers|\/submit|\/review)?)?)?)?$/.test(path);
    if (url.origin !== "http://localhost:8000" || !known) {
      unknown.push(`${method} ${url.href}`);
      await reply({ message: "Unknown mock API request" }, 500);
      return;
    }
    if (method === "OPTIONS") { await route.fulfill({ status: 204, headers }); return; }
    calls.push(`${account}:${method} ${path}`);
    if (path === "/sanctum/csrf-cookie" && method === "GET") {
      await route.fulfill({ status: 204, headers: { ...headers, "set-cookie": "XSRF-TOKEN=mini-test; Path=/; SameSite=Lax" } }); return;
    }
    if (path === "/api/me" && method === "GET") { await reply(account ? users[account] : null, account ? 200 : 401); return; }
    if (path === "/api/auth/login" && method === "POST") {
      const body = request.postDataJSON();
      expect(body.password).toBe("password123");
      expect([users.A.email, users.B.email]).toContain(body.identity);
      account = body.identity === users.A.email ? "A" : "B";
      await reply(users[account]); return;
    }
    if (path === "/api/auth/logout" && method === "POST") {
      account = undefined;
      await route.fulfill({ status: 204, headers }); return;
    }
    if (path === "/api/public/programs" && method === "GET") { await reply(programs); return; }
    if (!account) { await reply(null, 401); return; }
    if (path === "/api/student/notifications") { await reply([]); return; }
    if ((path === "/api/student/access" || path === "/api/student/dashboard") && method === "GET") {
      const access: LearningAccess = { learning: { n5: "full", n4: account === "A" ? "full" : "none" }, replay_levels: [], source_grants: [{ plan_code: account === "A" ? "sensei" : "lms", program_code: "n5" }] };
      await reply(path.endsWith("dashboard") ? dashboardFixture(programs, access, program => [chapter(program)], chapterId => progress(chapterId === 9 ? 5 : 4)) : access); return;
    }
    if (path === "/api/student/leaderboard" && method === "GET" && url.search === "?scope=all") {
      await reply({ scope: "all", week_start: "2026-10-05", week_end: "2026-10-11", entries: [], self: null }); return;
    }
    if (path === "/api/student/gamification" && method === "GET") {
      await reply({ streak_days: 0, weekly_xp: 0, challenge: { active_days: 0, target_days: 5, total_days: 7, starts_on: "2026-10-05", ends_on: "2026-10-11", status: "active", badge: null } }); return;
    }
    const match = /^\/api\/student\/programs\/(5|4)\/chapters(?:\/(9|8)(?:\/(progress|attempts)(?:\/(\d+)(?:\/(answers|submit|review))?)?)?)?$/.exec(path);
    if (match) {
      const program = Number(match[1]);
      const detail = chapter(program);
      if (match[2]) expect(Number(match[2])).toBe(detail.id);
      if (!match[2] && method === "GET") { await reply([detail]); return; }
      if (!match[3] && method === "GET") {
        await reply(detail.access === "none" ? null : detail, detail.access === "none" ? 403 : 200); return;
      }
      if (match[3] === "progress" && method === "GET") { await reply(progress(program)); return; }
      if (match[3] === "attempts") {
        if (!match[4] && method === "POST") {
          const start = request.postDataJSON();
          expect(start).toEqual({ kind: "mini", session: 1, part: expect.any(Number) });
          if (account !== "A") { await reply(null, 403); return; }
          const id = 700 + attempts.size;
          const data: MiniAttempt = {
            id, chapter_id: detail.id, kind: "mini", revision: 0, status: "in_progress",
            questions: Array.from({ length: questionCount }, (_, index) => ({ id: program * 100 + index, question: `${account} ${program === 5 ? "N5" : "N4"} question${index ? ` ${index + 1}` : ""}`, options: { A: "Cat", B: "Dog", C: "Bird", D: "Fish" }, session: 1, part: start.part, duration_minutes: 2 })),
            session: 1, part: start.part, duration_minutes: 2,
            started_at: new Date().toISOString(), expires_at: new Date(Date.now() + 120000).toISOString(), server_now: new Date().toISOString(),
            answers: {}, result: null, submitted_at: null,
          };
          attempts.set(id, { owner: account, program, data });
          if (faults.startDelay) await page.clock.runFor(faults.startDelay);
          await reply(data); return;
        }
        const entry = attempts.get(Number(match[4]));
        if (!entry || entry.owner !== account || entry.program !== program) { await reply(null, 404); return; }
        const data = entry.data;
        data.server_now = new Date().toISOString();
        if (data.status !== "completed" && Date.now() >= Date.parse(data.expires_at!)) {
          data.status = "completed";
          data.submitted_at = data.server_now;
          data.revision = (data.revision ?? 0) + 1;
          const correct = data.answers[program * 100] === "A" ? 1 : 0;
          data.result = { correct, wrong: Object.keys(data.answers).length - correct, unanswered: 1 - Object.keys(data.answers).length, total: 1, percentage: correct * 100, passed: correct === 1, passing_score: 70 };
        }
        if (!match[5] && method === "GET") { await reply(data); return; }
        if ((match[5] === "answers" && method === "PUT") || (match[5] === "submit" && method === "POST")) {
          const body = request.postDataJSON();
          if (match[5] === "answers" && faults.saveError) { await reply(null, 503); return; }
          if (match[5] === "submit" && (faults.submitErrors ?? 0) > 0) { faults.submitErrors!--; await reply(null, 503); return; }
          if (data.status === "completed") { await reply(data); return; }
          expect(Object.keys(body).sort()).toEqual(["answers", "revision"]);
          expect(body.revision).toBe(data.revision);
          for (const [id, answer] of Object.entries(body.answers)) {
            expect(id).toBe(String(program * 100));
            expect(["A", "B", "C", "D"]).toContain(answer);
          }
          data.answers = body.answers;
          data.revision = (data.revision ?? 0) + 1;
          if (match[5] === "submit") {
            data.status = "completed";
            data.submitted_at = new Date().toISOString();
            const correct = body.answers[program * 100] === "A" ? 1 : 0;
            data.result = { correct, wrong: Object.keys(body.answers).length - correct, unanswered: 1 - Object.keys(body.answers).length, total: 1, percentage: correct * 100, ...{ passed: correct === 1, passing_score: 70 } };
          }
          await reply(data); return;
        }
        if (match[5] === "review" && method === "GET") {
          if (data.status !== "completed") { await reply(null, 403); return; }
          await reply({ ...data, questions: data.questions.map(question => ({ ...question, correct_option: "A", explanation: "Mock review explanation" })) }); return;
        }
      }
    }
    unknown.push(`${method} ${url.href}`);
    await reply({ message: "Unknown mock API method" }, 500);
  });
  return { count, calls, unknown, errors, attempts, users };
}

async function loginMini(page: Page, email: string) {
  await page.getByLabel("Email / WhatsApp").fill(email);
  await page.getByLabel("Kata Sandi", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30000 });
  await expect(page.getByRole("heading", { name: "Papan Peringkat", exact: true })).toBeVisible();
}

async function openMini(page: Page) {
  await page.getByRole("button", { name: "Kelas Saya", exact: true }).click();
  await page.getByRole("link", { name: "Mini Checkpoint", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Mini Checkpoint Evaluasi Bertahap" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mulai Mini Checkpoint" })).toHaveCount(2);
}

test.describe("Mini learning regression — mock API only, no backend or DB", () => {
  test.setTimeout(60000);
  test("full learning access without Mini entitlement stays locked despite completed activities", async ({ page }) => {
    const api = await mockMiniApi(page, 1, { miniEligible: false });
    await page.goto("/login");
    await loginMini(page, api.users.A.email);
    await page.goto("/mini-checkpoint");
    await expect(page.getByRole("button", { name: "Mulai Mini Checkpoint", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Terkunci", exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Terkunci", exact: true }).first().click();
    await expect(page.getByRole("dialog")).toContainText("Khusus member Belajar dengan Sensei. Mini Checkpoint tersedia untuk N5, N4, N3, dan N2.");
  });

  test("unlocked N5/N4 reuse catalog and preserve autosave, resume, submit and canonical result", async ({ page }) => {
    const api = await mockMiniApi(page);
    await page.goto("/login");
    await loginMini(page, api.users.A.email);
    const before = api.count("GET", "/api/student/dashboard");
    await openMini(page);
    const initial = api.count("GET", "/api/student/dashboard");
    expect(initial).toBe(before + 1);
    await page.getByLabel("Pilih Level:").selectOption("n5");
    await page.getByRole("button", { name: "Mulai Mini Checkpoint" }).click();
    await expect(page.getByRole("button", { name: "Mulai", exact: true })).toBeEnabled();
    expect(api.count("GET", "/api/student/dashboard"), "Mini runner must reuse resolved catalog").toBe(initial);
    await page.getByRole("button", { name: "Mulai", exact: true }).click();
    await expect(page.getByRole("heading", { name: "A N5 question" })).toBeVisible();
    await expect(page.getByText("Jawaban benar:", { exact: false })).toHaveCount(0);
    await page.getByRole("radio", { name: "A. Cat" }).check();
    await expect.poll(() => api.count("PUT", "/api/student/programs/5/chapters/9/attempts/700/answers")).toBe(1);
    await expect.poll(() => api.attempts.get(700)?.data.answers).toEqual({ "500": "A" });
    await page.reload();
    await expect(page.getByRole("heading", { name: "Mini Checkpoint Evaluasi Bertahap" })).toBeVisible();
    await page.getByLabel("Pilih Level:").selectOption("n5");
    await page.getByRole("button", { name: "Mulai Mini Checkpoint" }).click();
    await expect(page.getByRole("radio", { name: "A. Cat" })).toBeChecked();
    await page.getByRole("button", { name: "Kumpulkan Jawaban" }).click();
    await expect(page.getByRole("heading", { name: "Hasil Mini Checkpoint" })).toBeVisible();
    await expect(page.locator(".checkpoint-result-stats")).toContainText("100");
    expect(await page.getByText("LULUS", { exact: true }).count(), "Canonical passed flag must render pass status").toBe(1);
    expect(api.count("POST", "/api/student/programs/5/chapters/9/attempts/700/submit")).toBe(1);
    await page.getByRole("button", { name: "Kembali ke Daftar" }).click();
    await page.getByLabel("Pilih Level:").selectOption("n4");
    const n4ProgressBefore = api.count("GET", "/api/student/programs/4/chapters/8/progress");
    await page.getByRole("button", { name: "Mulai Mini Checkpoint" }).click();
    await expect(page.getByRole("button", { name: "Mulai", exact: true })).toBeEnabled();
    await expect(page.locator(".learning-question-page").getByRole("alert"), "Switching program must not resume previous program attempt").toHaveCount(0);
    await expect(page.getByRole("heading", { name: "A N5 question" })).toHaveCount(0);
    await page.getByRole("button", { name: "Mulai", exact: true }).click();
    await expect(page.getByRole("heading", { name: "A N4 question" })).toBeVisible();
    expect(api.count("GET", "/api/student/programs/4/chapters/8/attempts/700")).toBe(0);
    expect(api.count("GET", "/api/student/programs/4/chapters/8")).toBe(1);
    expect(api.count("GET", "/api/student/programs/4/chapters/8/progress")).toBeGreaterThan(n4ProgressBefore);
    await expect(page.getByRole("radio", { name: "A. Cat" })).not.toBeChecked();
    await page.getByRole("radio", { name: "B. Dog" }).check();
    await expect.poll(() => api.attempts.get(701)?.data.answers).toEqual({ "400": "B" });
    await page.getByRole("button", { name: "Kumpulkan Jawaban" }).click();
    await expect(page.getByRole("heading", { name: "Hasil Mini Checkpoint" })).toBeVisible();
    await expect(page.getByText("TIDAK LULUS", { exact: true })).toBeVisible();
    expect(api.attempts.get(700)?.data.answers).toEqual({ "500": "A" });
    expect(api.unknown).toEqual([]);
    expect(api.errors).toEqual([]);
  });

  test("canonical Mini deadline survives refresh, saves and session/part reselect; expired submit uses saved answers", async ({ page }) => {
    const api = await mockMiniApi(page);
    await page.goto("/login");
    await loginMini(page, api.users.A.email);
    await openMini(page);
    await page.getByLabel("Pilih Level:").selectOption("n5");
    await page.getByRole("button", { name: "Mulai Mini Checkpoint" }).click();
    await page.getByRole("button", { name: "Mulai", exact: true }).click();
    await expect(page.getByRole("heading", { name: "A N5 question" })).toBeVisible();
    await expect(page.getByRole("timer")).toContainText("2:00");
    const data = api.attempts.get(700)!.data;
    const deadline = data.expires_at;
    await page.getByRole("radio", { name: "A. Cat" }).check();
    await expect.poll(() => data.answers).toEqual({ "500": "A" });
    await page.getByLabel("Sesi / Part").selectOption("1/2");
    await expect(page.getByRole("button", { name: "Mulai", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Mulai", exact: true }).click();
    expect(api.attempts.get(701)?.data.part).toBe(2);
    await page.getByLabel("Sesi / Part").selectOption("1/1");
    await expect(page.getByRole("radio", { name: "A. Cat" })).toBeChecked();
    expect(data.expires_at).toBe(deadline);
    data.expires_at = new Date(Date.now() + 3000).toISOString();
    await page.reload();
    await page.getByLabel("Pilih Level:").selectOption("n5");
    await page.getByRole("button", { name: "Mulai Mini Checkpoint" }).click();
    await expect(page.getByRole("timer")).toContainText(/0:0[1-3]/);
    await expect(page.getByRole("heading", { name: "Hasil Mini Checkpoint" })).toBeVisible();
    expect(data.answers).toEqual({ "500": "A" });
    expect(api.count("POST", "/api/student/programs/5/chapters/9/attempts/700/submit")).toBe(1);
    await page.getByRole("button", { name: "Review Jawaban" }).click();
    await expect(page.getByText("Jawaban benar: Cat", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Kembali ke Hasil" }).click();
    await page.getByRole("button", { name: "Coba Lagi", exact: true }).click();
    await expect(page.getByRole("timer")).toContainText(/1:59|2:00/);
    expect(api.attempts.get(702)?.data.answers).toEqual({});
    expect(api.unknown).toEqual([]);
    expect(api.errors).toEqual([]);
  });

  test("uniform duration is group deadline, never sum of question durations; navigation and saves keep expiry", async ({ page }) => {
    const api = await mockMiniApi(page, 2);
    await page.goto("/login");
    await loginMini(page, api.users.A.email);
    await openMini(page);
    await page.getByLabel("Pilih Level:").selectOption("n5");
    await page.getByRole("button", { name: "Mulai Mini Checkpoint" }).click();
    await page.getByRole("button", { name: "Mulai", exact: true }).click();
    await expect(page.getByRole("timer")).toContainText(/2:00|1:59/);
    const deadline = api.attempts.get(700)!.data.expires_at;
    await page.getByRole("radio", { name: "A. Cat" }).check();
    await page.getByRole("button", { name: "Selanjutnya", exact: true }).click();
    await expect(page.getByRole("heading", { name: "A N5 question 2" })).toBeVisible();
    await expect(page.getByRole("timer")).not.toContainText("4:");
    await expect.poll(() => api.attempts.get(700)?.data.answers).toEqual({ "500": "A" });
    expect(api.attempts.get(700)!.data.expires_at).toBe(deadline);
    expect(api.errors).toEqual([]);
  });

  test("delayed Mini start charges full roundtrip conservatively, not extra usable deadline time", async ({ page }) => {
    const api = await mockMiniApi(page, 1, { startDelay: 10000 });
    await page.goto("/login");
    await loginMini(page, api.users.A.email);
    await openMini(page);
    await page.getByLabel("Pilih Level:").selectOption("n5");
    await page.getByRole("button", { name: "Mulai Mini Checkpoint" }).click();
    await expect(page.getByRole("button", { name: "Mulai", exact: true })).toBeEnabled();
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await page.getByRole("button", { name: "Mulai", exact: true }).click();
    await expect(page.getByRole("timer")).toContainText("1:50");
    expect(api.attempts.get(700)?.data.duration_minutes).toBe(2);
    expect(api.errors).toEqual([]);
  });

  test("Mini expiry ignores autosave error, submits once, locks answers after failure and allows explicit retry", async ({ page }) => {
    const api = await mockMiniApi(page, 1, { saveError: true, submitErrors: 1 });
    await page.goto("/login");
    await loginMini(page, api.users.A.email);
    await openMini(page);
    await page.getByLabel("Pilih Level:").selectOption("n5");
    await page.getByRole("button", { name: "Mulai Mini Checkpoint" }).click();
    await expect(page.getByRole("button", { name: "Mulai", exact: true })).toBeEnabled();
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await page.getByRole("button", { name: "Mulai", exact: true }).click();
    await page.getByRole("radio", { name: "A. Cat" }).check();
    await expect(page.locator(".learning-question-page").getByRole("alert")).toBeVisible();
    await page.clock.runFor(121000);
    await expect.poll(() => api.count("POST", "/api/student/programs/5/chapters/9/attempts/700/submit")).toBe(1);
    await expect(page.getByRole("button", { name: "Coba Lagi", exact: true })).toBeEnabled();
    await expect(page.getByRole("radio", { name: "B. Dog" })).toBeDisabled();
    await page.clock.runFor(30000);
    expect(api.count("POST", "/api/student/programs/5/chapters/9/attempts/700/submit")).toBe(1);
    api.attempts.get(700)!.data.expires_at = new Date(Date.now() - 1000).toISOString();
    await page.getByRole("button", { name: "Coba Lagi", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Hasil Mini Checkpoint" })).toBeVisible();
    expect(api.count("POST", "/api/student/programs/5/chapters/9/attempts/700/submit")).toBe(2);
    expect(api.attempts.get(700)!.data.answers).toEqual({});
    expect(api.errors).toEqual([]);
  });

  test("same browser context logout A/login B clears content, progress, answers and rejects A attempt", async ({ page, context }) => {
    const api = await mockMiniApi(page);
    await page.goto("/login");
    await loginMini(page, api.users.A.email);
    await openMini(page);
    await page.getByLabel("Pilih Level:").selectOption("n5");
    await page.getByRole("button", { name: "Mulai Mini Checkpoint" }).click();
    await page.getByRole("button", { name: "Mulai", exact: true }).click();
    await expect(page.getByRole("heading", { name: "A N5 question" })).toBeVisible();
    await page.getByRole("radio", { name: "A. Cat" }).check();
    await expect.poll(() => api.attempts.get(700)?.data.answers).toEqual({ "500": "A" });
    await page.getByRole("button", { name: "Keluar", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(api.count("POST", "/api/auth/logout", "A")).toBe(1);
    await loginMini(page, api.users.B.email);
    expect(page.context()).toBe(context);
    await expect(page.getByText("Mini Account B", { exact: true })).toBeVisible();
    await expect(page.getByText("0%", { exact: true })).toBeVisible();
    await expect(page.getByText("Mini Account A", { exact: true })).toHaveCount(0);
    await page.goto("/mini-checkpoint?membership=sensei&attempt=700");
    await expect(page.getByRole("heading", { name: "Mini Checkpoint Evaluasi Bertahap" })).toBeVisible();
    await expect(page.getByText("B N5 content", { exact: false })).toBeVisible();
    await expect(page.getByText("B N4 content", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mulai Mini Checkpoint" })).toHaveCount(0);
    await expect(page.getByText("A N5 content", { exact: false })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "A N5 question" })).toHaveCount(0);
    await expect(page.getByText("Belajar Mandiri", { exact: true }).first()).toBeVisible();
    await page.goto("/learn/n5/chapter-1/checkpoint?membership=sensei&attempt=700");
    await expect(page.getByRole("button", { name: "Mulai", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "A N5 question" })).toHaveCount(0);
    await page.goto("/learn/n4/chapter-1/checkpoint?membership=sensei&attempt=700");
    await expect(page.getByRole("alert").filter({ hasText: "Permintaan belum berhasil. Silakan coba lagi." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Kumpulkan Jawaban" })).toHaveCount(0);
    expect(api.count("GET", "/api/student/programs/4/chapters/8", "B")).toBe(1);
    const denied = await page.evaluate(async () => {
      const response = await fetch("http://localhost:8000/api/student/programs/5/chapters/9/attempts/700", { credentials: "include" });
      return { status: response.status, body: await response.json() };
    });
    expect(denied).toEqual({ status: 404, body: { data: null } });
    expect(api.count("POST", "/api/student/programs/5/chapters/9/attempts", "B")).toBe(0);
    expect(api.count("GET", "/api/student/dashboard", "B")).toBeGreaterThan(0);
    expect(await page.evaluate(() => Object.keys(localStorage).filter(key => /learning-progress|attempt|auth-token/.test(key)))).toEqual([]);
    expect(api.unknown).toEqual([]);
    expect(api.errors).toEqual([]);
  });
});
