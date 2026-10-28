import { apiRequest, ApiError } from "../src/lib/api";
import { expect, test } from "./canonical-fixture";
import { AttemptPersistence, type ServerAttempt, assessmentSessions } from "../src/lib/assessment-attempt";

for (const width of [1440, 768, 390]) test(`Checkpoint package to review ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  const bank = assessmentSessions.map((session, index) => ({ id: index + 1, chapter_id: 9, question: `Snapshot question ${index + 1}`, options: { A: "First", B: "Second", C: "Third", D: "Fourth" }, correct_option: "A", explanation: "Snapshot explanation", sort_order: index, status: "published", session }));
  type Package = { id: number; program_id: number; title: string; status: string; duration_minutes: number; passing_score: number; access_type: string; questions: { id: number; session: string; audio_url: string | null; reading_passage: string | null }[] };
  const packages: Package[] = [];
  const sessions = Object.fromEntries(assessmentSessions.map(session => [session, session]));
  const meta = (item: Package) => ({ ...item, program: { id: 1, code: "n5", name: "JLPT N5" }, max_score: 100, question_count: item.questions.length, sessions });
  let attempt: { id: number; checkpoint_package_id: number; status: string; revision: number; questions: { id: number; session: string; question: string; options: Record<string, string>; audio_url: string | null; reading_passage: string | null }[]; answers: Record<string, string>; result: unknown; started_at: string; expires_at: string; server_now: string } | undefined;
  let starts = 0, submits = 0;
  let conflict = false;
  const crossDomain: string[] = [];
  page.on("request", request => { if (request.url().includes("/api/student/try-outs")) crossDomain.push(request.url()); });
  await page.route("**/api/admin/programs", route => route.fulfill({ json: { data: [{ id: 1, code: "n5", name: "JLPT N5", family: "jlpt", status: "active" }] } }));
  await page.route("**/api/admin/chapters", route => route.fulfill({ json: { data: [{ id: 9, program_id: 1, title: "Chapter 1", status: "published" }] } }));
  await page.route("**/api/admin/checkpoint-questions", route => route.fulfill({ json: { data: bank } }));
  await page.route("**/api/admin/checkpoint-packages**", async route => {
    const method = route.request().method();
    if (method === "GET") return route.fulfill({ json: { data: packages.map(meta) } });
    const body = route.request().postDataJSON() as Package;
    if (body.status === "published" && new Set(body.questions.map(item => item.session)).size !== 4) return route.fulfill({ status: 422, json: { message: "Paket harus memiliki soal pada empat bagian.", errors: { questions: ["Paket harus memiliki soal pada empat bagian."] } } });
    const item = { ...body, id: 1 };
    packages.splice(0, packages.length, item);
    return route.fulfill({ status: method === "POST" ? 201 : 200, json: { data: meta(item) } });
  });
  await page.route("**/api/student/checkpoint-packages**", async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const reply = (data: unknown, status = 200) => route.fulfill({ status, json: { data } });
    if (path.endsWith("checkpoint-packages")) return reply(packages.filter(item => item.status === "published").map(item => ({ ...meta(item), can_access: true })));
    if (!packages[0] || packages[0].status !== "published") return reply(null, 404);
    if (path.endsWith("/history")) return reply({ best_score: null, attempts: attempt ? [{ id: attempt.id, status: attempt.status, expires_at: attempt.expires_at, server_now: new Date().toISOString(), result: attempt.result }] : [] });
    if (path.endsWith("/1" ) && !path.includes("/attempts")) return reply(meta(packages[0]));
    if (method === "POST" && path.endsWith("/attempts")) {
      starts++;
      attempt ??= { id: 11, checkpoint_package_id: 1, status: "in_progress", revision: 0, questions: packages[0].questions.map(link => { const question = bank.find(item => item.id === link.id)!; return { ...link, question: question.question, options: { ...question.options } }; }), answers: {}, result: null, started_at: new Date().toISOString(), expires_at: new Date(Date.now() + 600000).toISOString(), server_now: new Date().toISOString() };
    }
    if (!attempt || !path.includes("/attempts")) return reply(null, 404);
    if (path.endsWith("/answers")) {
      expect(method).toBe("PUT");
      const body = route.request().postDataJSON();
      expect(Object.keys(body).sort()).toEqual(["answers", "revision"]);
      if (conflict) { conflict = false; return route.fulfill({ status: 409, json: { message: "Jawaban sudah berubah. Muat ulang pengerjaan sebelum mencoba lagi." } }); }
      expect(body.revision).toBe(attempt.revision);
      attempt.answers = { ...attempt.answers, ...body.answers }; attempt.revision++;
    }
    if (path.endsWith("/submit")) {
      submits++;
      expect(route.request().postDataJSON()).toEqual({ revision: attempt.revision });
      attempt.status = "completed"; attempt.revision++;
      attempt.result = { correct: 3, wrong: 1, unanswered: 0, total: 4, passing_score: 75, score: 75, earned: 75, max: 100, percentage: 75, passed: true, overall_pass: true, total_passing_score: 75, sessions: assessmentSessions.map((code, index) => ({ code, label: code, correct: index === 3 ? 0 : 1, wrong: index === 3 ? 1 : 0, unanswered: 0 })) };
    }
    attempt.server_now = new Date().toISOString();
    if (path.endsWith("/review")) {
      expect(attempt.status).toBe("completed");
      return reply({ ...attempt, questions: attempt.questions.map(question => ({ ...question, correct_option: "A", explanation: "Snapshot explanation" })) });
    }
    expect(JSON.stringify(attempt)).not.toContain("correct_option");
    return reply(attempt, method === "POST" && path.endsWith("/attempts") ? 201 : 200);
  });
  await page.goto("/admin/checkpoint");
  await page.getByRole("button", { name: "+ Tambah Checkpoint", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Tambah Checkpoint", exact: true });
  await form.getByLabel("Judul", { exact: true }).fill("Checkpoint full flow");
  await form.getByRole("combobox", { name: "Program", exact: true }).selectOption("1");
  await form.getByLabel("Durasi (menit)", { exact: true }).fill("10");
  await form.getByLabel("Nilai minimum lulus (%)", { exact: true }).fill("75");
  await form.getByRole("combobox", { name: "Akses Checkpoint", exact: true }).selectOption("free");
  for (let index = 0; index < 4; index++) {
    await form.getByRole("checkbox", { name: `Snapshot question ${index + 1} (published)`, exact: true }).check();
    await form.getByRole("combobox", { name: `Bagian soal ${index + 1}`, exact: true }).selectOption(assessmentSessions[index]);
  }
  await form.getByLabel("URL audio", { exact: true }).fill("https://example.test/audio.mp3");
  await form.getByRole("textbox", { name: "Bacaan", exact: true }).fill("Reading passage");
  await form.getByRole("button", { name: "Simpan Checkpoint", exact: true }).click();
  await expect(form).not.toBeVisible();
  await page.getByRole("button", { name: "Kelola Soal / Edit", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit Checkpoint", exact: true });
  await expect(edit.getByRole("checkbox", { checked: true })).toHaveCount(4);
  await expect(edit.getByRole("combobox", { name: "Bagian soal 4", exact: true })).toHaveValue("audio");
  await edit.getByRole("button", { name: "Simpan Checkpoint", exact: true }).click();
  await expect(edit).not.toBeVisible();
  await page.goto("/checkpoint");
  await expect(page.getByRole("heading", { name: "Checkpoint", exact: true })).toBeVisible();
  await expect(page.getByText("Checkpoint full flow", { exact: true })).toHaveCount(0);
  await page.goto("/admin/checkpoint");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("button", { name: "Draft", exact: true })).toBeVisible();
  await page.goto("/checkpoint");
  await page.getByRole("button", { name: "Mulai Checkpoint", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Peringatan", exact: true })).toBeVisible();
  await page.locator(".tryout-prestart").getByRole("button", { name: "Mulai Checkpoint", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Snapshot question 1", exact: true })).toBeVisible();
  await expect(page.getByText("Snapshot explanation", { exact: false })).toHaveCount(0);
  conflict = true;
  await page.locator("label").filter({ has: page.getByRole("radio", { name: "A. First", exact: true }) }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Coba Lagi" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "A. First", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Coba Lagi", exact: true }).click();
  await expect.poll(() => attempt?.answers[1]).toBe("A");
  bank[0].question = "Changed bank question";
  await page.reload();
  await expect(page.getByRole("heading", { name: "Snapshot question 1", exact: true })).toBeVisible();
  await expect(page.getByRole("radio", { name: "A. First", exact: true })).toBeChecked();
  expect(starts).toBe(1);
  for (let index = 1; index < 4; index++) {
    await page.getByRole("button", { name: "Selanjutnya", exact: true }).click();
    await page.locator("label").filter({ has: page.getByRole("radio", { name: index === 3 ? "B. Second" : "A. First", exact: true }) }).click();
    await expect.poll(() => attempt?.answers[index + 1]).toBe(index === 3 ? "B" : "A");
  }
  await page.getByRole("complementary").getByRole("button", { name: "Periksa Jawaban", exact: true }).click();
  page.on("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Selesaikan Kuis", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Hasil Checkpoint full flow", exact: true })).toBeVisible();
  await expect(page.locator(".tryout-result-total strong")).toHaveText("75");
  await expect(page.locator(".tryout-result-total")).toContainText("LULUS");
  expect(submits).toBe(1);
  await page.getByRole("button", { name: "Review Jawaban", exact: true }).click();
  await expect(page.getByText("Penjelasan: Snapshot explanation", { exact: true })).toBeVisible();
  await expect(page.getByText("Jawaban kamu · Benar", { exact: true })).toBeVisible();
  expect(crossDomain).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const domain of ["tryout", "checkpoint"] as const) test(`${domain} isolated conflict, double submit and server expiry`, async () => {
  const root = domain === "checkpoint" ? "/api/student/checkpoint-packages/1/attempts/11" : "/api/student/try-outs/1/attempts/11";
  let server: ServerAttempt = { id: 11, status: "in_progress", revision: 0, questions: [], answers: {}, result: null };
  let conflict = true, posts = 0;
  const calls: string[] = [];
  const request: typeof apiRequest = async <T>(path: string, options: RequestInit = {}) => {
    expect(path.startsWith(root)).toBe(true); calls.push(path);
    if (path.endsWith("/answers")) {
      const body = JSON.parse(String(options.body));
      if (domain === "checkpoint") expect(body).not.toHaveProperty("finish_session");
      if (conflict) { conflict = false; throw new ApiError(409); }
      expect(body.revision).toBe(server.revision);
      server = { ...server, answers: body.answers, revision: server.revision! + 1 };
    }
    if (path.endsWith("/submit")) { posts++; server = { ...server, status: "completed", result: { correct: 1, wrong: 0, unanswered: 0 } }; }
    return { data: server } as T;
  };
  const flow = new AttemptPersistence(server, root, domain, request);
  await expect(flow.save({ 1: "A" })).rejects.toMatchObject({ status: 409 });
  expect(flow.attempt.answers).toEqual({});
  await flow.save({ 1: "A" });
  const first = flow.submit({ 1: "A" });
  expect(flow.submit({ 1: "A" })).toBe(first);
  await first;
  expect(posts).toBe(1);
  expect(flow.attempt.answers).toEqual({ 1: "A" });
  const expired = new AttemptPersistence({ ...server, status: "in_progress", result: null, expires_at: "2026-01-01T00:00:00Z", server_now: "2026-01-01T00:00:01Z", request_started_at: performance.now(), received_at: performance.now() }, root, domain, request);
  await expect(expired.expire()).resolves.toMatchObject({ status: "completed" });
  expect(calls.at(-1)).toBe(root);
  expect(posts).toBe(1);
});
