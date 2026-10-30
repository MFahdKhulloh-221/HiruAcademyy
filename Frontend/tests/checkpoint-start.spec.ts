import { test, expect, type Page } from "@playwright/test";
import { assessmentSessions, assessmentSessionLabels, type ServerAttempt } from "../src/lib/assessment-attempt";

async function mockTryOut(page: Page, answered = 0, duration: number | null = null) {
  const base = Date.parse("2026-10-11T00:00:00Z");
  let deadline = duration === null ? null : base + duration * 1000;
  const questions = assessmentSessions.flatMap((session, section) => Array.from({ length: 25 }, (_, index) => ({ id: 9000 + section * 1000 + index * 7, session, instruction: "Choose one answer", japanese: { text: "学校", reading: "がっこう" }, question: `Question ${section * 25 + index + 1}`, options: { A: "First", B: "Second", C: "Third", D: "Fourth" } })));
  let server: ServerAttempt = { id: 9, status: "in_progress", revision: 0, questions, answers: Object.fromEntries(questions.slice(0, answered).map(item => [item.id, "A"])), result: null };
  const history: { id: number; status: string; expires_at: string | null; server_now: string }[] = [];
  const calls = { starts: 0, submits: 0, saves: 0, failStart: false, failSubmit: false, failSave: false, failRead: false, incompleteExpiry: false, reads: 0, pauseSave: undefined as Promise<void> | undefined, pauseSubmit: undefined as Promise<void> | undefined };
  await page.route(/\/(api\/|sanctum\/csrf-cookie)/, async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const headers = { "access-control-allow-origin": new URL(page.url()).origin, "access-control-allow-credentials": "true", "access-control-allow-methods": "GET, POST, PUT, OPTIONS", "access-control-allow-headers": "accept, content-type, x-xsrf-token" };
    const reply = (data: unknown, status = 200) => route.fulfill({ status, headers, json: { data } });
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (path === "/sanctum/csrf-cookie") return route.fulfill({ status: 204, headers: { ...headers, "set-cookie": "XSRF-TOKEN=testing; Path=/" } });
    if (path === "/api/me") return reply({ id: 71, name: "Student", email: "practice@example.test", whatsapp: "081234567890", role: "student", account_status: "active" });
    if (path === "/api/student/dashboard") return reply({ programs: [{ id: 5, code: "n5", name: "JLPT N5", family: "jlpt" }], access: { learning: { n5: "full" }, replay_levels: [], source_grants: [{ plan_code: "lms", program_code: "n5" }] }, chapters: [] });
    if (path === "/api/student/access") return reply({ learning: { n5: "full" }, replay_levels: [], source_grants: [{ plan_code: "lms", program_code: "n5" }] });
    const detail = { duration_minutes: duration === null ? null : Math.ceil(duration / 60), id: 2, level: "N5", title: "Server Checkpoint", max_score: 180, sessions: Object.fromEntries(assessmentSessions.map((session, index) => [session, assessmentSessionLabels[index]])) };
    if (path === "/api/student/checkpoint-packages") return reply([detail]);
    if (path === "/api/student/checkpoint-packages/2") return reply(detail);
    if (path.endsWith("/history")) return reply({ best_score: null, attempts: history });
    if (path.endsWith("/abandon")) {
      history.length = 0;
      return route.fulfill({ status: 204, headers });
    }
    if (path.includes("/attempts")) {
      if (method === "GET") {
        calls.reads++;
        if (calls.failRead) return reply(null, 503);
      }
      if (method === "POST" && path.endsWith("/attempts")) {
        calls.starts++;
        if (calls.failStart) { calls.failStart = false; return reply(null, 503); }
        deadline = duration === null ? null : await page.evaluate(() => Date.now()) + duration * 1000;
        server = { ...server, id: 10, status: "in_progress", answers: {}, result: null, revision: 0 };
      }
      if (method === "PUT") {
        calls.saves++;
        await calls.pauseSave;
        if (calls.failSave) { calls.failSave = false; return reply(null, 503); }
        const body = route.request().postDataJSON();
        expect(body.revision).toBe(server.revision);
        server = { ...server, answers: body.answers, revision: server.revision! + 1 };
      }
      if (path.endsWith("/submit")) {
        calls.submits++;
        await calls.pauseSubmit;
        expect(route.request().postDataJSON().revision).toBe(server.revision);
        if (calls.failSubmit) { calls.failSubmit = false; return reply(null, 503); }
        const count = Object.keys(server.answers).length;
        server = { ...server, status: "completed", result: { correct: count, wrong: 0, unanswered: 100 - count, overall_pass: false } };
      }
      if (deadline !== null) {
        const now = await page.evaluate(() => Date.now());
        server = { ...server, started_at: new Date(deadline - duration! * 1000).toISOString(), expires_at: new Date(deadline).toISOString(), server_now: new Date(now).toISOString() };
        if (now >= deadline && server.status === "in_progress" && !calls.incompleteExpiry) {
          const count = Object.keys(server.answers).length;
          server = { ...server, status: "completed", completed_at: new Date(now).toISOString(), result: { correct: count, wrong: 0, unanswered: 100 - count } };
        }
      }
      if (path.endsWith("/review")) {
        expect(server.status).toBe("completed");
        return reply({ ...server, questions: server.questions.map(item => ({ ...item, correct_option: "B", explanation: "Backend explanation" })) });
      }
      return reply(server);
    }
    return reply([]);
  });
  return { calls, history, questions, getServer: () => server };
}
for (const width of [1440, 768, 390]) {
  test(`checkpoint collapsible grouped navigator ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockTryOut(page);
    await page.goto('/checkpoint?membership=sensei&checkpoint=2');
    await page.getByRole('button', { name: 'Mulai Checkpoint', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Mulai', exact: true }).click();
    const topbar = page.getByLabel('Informasi pengerjaan Checkpoint', { exact: true });
    await expect(topbar.getByRole('heading', { name: /Server Checkpoint/ })).toBeVisible();
    await expect(topbar).toContainText('Server Checkpoint');
    await expect(topbar).not.toContainText('Terjawab');
    await expect(topbar.getByRole('timer')).toBeVisible();
    const navigator = page.locator('#tryout-question-navigator');
    await expect(navigator).toBeVisible();
    await expect(navigator.getByRole('heading', { name: 'Choose one answer', exact: true })).toBeVisible();
    const card = page.locator('.learning-question-card');
    const before = await card.boundingBox();
    await page.getByRole('button', { name: 'Sembunyikan Navigator' }).click();
    await expect(navigator).toBeHidden();
    const after = await card.boundingBox();
    if (width === 1440) expect(after!.width).toBeGreaterThan(before!.width);
    const fieldsetBox = await card.locator('fieldset').boundingBox();
    const optionBox = await card.locator('fieldset > label').first().boundingBox();
    expect(Math.abs(fieldsetBox!.width - optionBox!.width)).toBeLessThanOrEqual(1);
    const actionsBox = await page.locator('.tryout-placement-style .learning-question-actions').boundingBox();
    expect(Math.abs(after!.width - actionsBox!.width)).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: 'Tampilkan Navigator' }).click();
    await expect(navigator).toBeVisible();
    await navigator.getByRole('button', { name: 'Soal 2', exact: true }).click();
    await expect(navigator.getByRole('button', { name: 'Soal 2', exact: true })).toHaveAttribute('aria-current', 'step');
  });
  test(`checkpoint instructions below simulation info ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockTryOut(page);
    await page.goto('/checkpoint?membership=sensei&checkpoint=2');
    const info = page.locator('.tryout-prestart-info');
    const warning = page.locator('.tryout-prestart .assessment-warning');
    await expect(warning.getByRole('heading', { name: 'Instruksi & Ketentuan Ujian' })).toBeVisible();
    await expect(info).toBeVisible();
    const infoBox = await info.boundingBox();
    const warningBox = await warning.boundingBox();
    expect(infoBox).not.toBeNull();
    expect(warningBox).not.toBeNull();
    expect(warningBox!.y).toBeGreaterThanOrEqual(infoBox!.y + infoBox!.height);
  });
}
test("checkpoint start and exit confirmations preserve normal resume", async ({ page }) => {
  const fixture = await mockTryOut(page, 0, 7200);
  await page.goto('/checkpoint?membership=sensei&checkpoint=2');
  await page.getByRole('button', { name: 'Mulai Checkpoint', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Siap memulai Checkpoint sekarang?');
  expect(fixture.calls.starts).toBe(0);
  await dialog.getByRole('button', { name: 'Kembali', exact: true }).click();
  await page.getByRole('button', { name: 'Mulai Checkpoint', exact: true }).click();
  await dialog.getByRole('button', { name: 'Mulai', exact: true }).click();
  await expect(page.getByLabel('Informasi pengerjaan Checkpoint')).toBeVisible();
  expect(fixture.calls.starts).toBe(1);
  await page.locator('.learning-question-card fieldset > label').first().click();
  await expect.poll(() => fixture.calls.saves).toBe(1);
  fixture.history.push({ id: 10, status: 'in_progress', expires_at: fixture.getServer().expires_at!, server_now: fixture.getServer().server_now! });
  await page.goto('/checkpoint?membership=sensei&checkpoint=2');
  await page.getByRole('button', { name: 'Lanjutkan Checkpoint', exact: true }).click();
  await expect(page.getByRole('radio').first()).toBeChecked();
  expect(fixture.calls.starts).toBe(1);
  await page.getByRole('button', { name: 'Keluar Sesi', exact: true }).click();
  await expect(dialog).toContainText('Yakin ingin keluar sesi?');
  await dialog.getByRole('button', { name: 'Kembali', exact: true }).click();
  await expect(page.getByRole('radio').first()).toBeChecked();
  await page.getByRole('button', { name: 'Keluar Sesi', exact: true }).click();
  await dialog.getByRole('button', { name: 'Keluar Sesi', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Checkpoint', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mulai Checkpoint', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Lanjutkan Checkpoint', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Mulai Checkpoint', exact: true }).click();
  await dialog.getByRole('button', { name: 'Mulai', exact: true }).click();
  await expect(page.getByRole('radio').first()).not.toBeChecked();
  expect(fixture.calls.starts).toBe(2);
});


for (const width of [1440, 768, 390]) test(`shared passage student navigation ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  const fixture = await mockTryOut(page, 0, 7200);
  for (const question of fixture.questions.filter(question => question.session === 'reading').slice(0, 5)) {
    Object.assign(question, { passage: { id: 44, title: 'Bacaan A', body: '<p><strong>\u65e5\u672c\u8a9e</strong>\u3092\u8aad\u307f\u307e\u3059\u3002</p><p><ruby>\u5c71<rt>\u3084\u307e</rt></ruby>\u306b\u884c\u304d\u307e\u3059\u3002</p>' } });
  }
  await page.goto('/checkpoint?membership=sensei');
  await expect(page.getByRole('heading', { name: 'Server Checkpoint', exact: true })).toBeVisible();
  await page.screenshot({ path: `C:/Users/Tulo/AppData/Local/Temp/opencode/studio-student-list-${width}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Mulai Checkpoint', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Server Checkpoint', exact: true })).toBeVisible();
  await page.screenshot({ path: `C:/Users/Tulo/AppData/Local/Temp/opencode/studio-student-info-${width}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Mulai Checkpoint', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mulai', exact: true }).click();
  await page.getByRole('button', { name: 'Reading (Dokkai)', exact: true }).click();
  const passage = page.getByRole('region', { name: 'Isi teks bacaan', exact: true });
  await expect(passage.locator('ruby rt')).toHaveText('\u3084\u307e');
  await page.locator('.learning-question-card fieldset > label').first().click();
  await expect.poll(() => fixture.calls.saves).toBe(1);
  for (let index = 1; index < 5; index++) {
    await page.getByRole('button', { name: 'Selanjutnya', exact: true }).click();
    await expect(passage).toContainText('Bacaan A');
    await expect(page.getByRole('radio').first()).not.toBeChecked();
  }
  await page.screenshot({ path: `C:/Users/Tulo/AppData/Local/Temp/opencode/studio-student-reading-${width}.png`, fullPage: true });
  await expect(page.getByRole('timer')).toContainText('01:59:');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await expect(passage.locator('ruby rt')).toHaveText('\u3084\u307e');
  expect(fixture.calls.starts).toBe(1);
});

test("checkpoint submit result review keep separate endpoints", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-11T00:00:00Z") });
  const fixture = await mockTryOut(page, 0, 600);
  await page.goto("/checkpoint?membership=sensei&checkpoint=2&attempt=9");
  await expect(page.getByLabel("Informasi pengerjaan Checkpoint")).toBeVisible();
  await page.locator('.learning-question-card fieldset > label').first().click();
  await expect.poll(() => fixture.calls.saves).toBe(1);
  await page.getByRole("button", { name: "Periksa Jawaban", exact: true }).click();
  await page.getByRole("button", { name: "Selesaikan Kuis", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Ya, Selesaikan Kuis", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Hasil Server Checkpoint", exact: true })).toBeVisible();
  expect(fixture.calls.submits).toBe(1);
  await page.getByRole("button", { name: "Review Jawaban", exact: true }).click();
  await expect(page.getByText("Backend explanation", { exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.has("tryout_question")).toBe(false);
});

test("checkpoint timer refresh and expiry preserve attempt", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-11T00:00:00Z") });
  const fixture = await mockTryOut(page, 0, 600);
  await page.goto("/checkpoint?membership=sensei&checkpoint=2&attempt=9");
  await expect(page.getByRole("timer")).toContainText(/00:09:\d{2}/);
  const deadline = fixture.getServer().expires_at;
  await page.clock.fastForward(60000);
  await expect(page.getByRole("timer")).toContainText(/00:08:\d{2}/);
  await page.reload();
  await expect(page.getByRole("timer")).toContainText(/00:08:\d{2}/);
  expect(fixture.getServer().expires_at).toBe(deadline);
  await page.clock.fastForward(600000);
  await expect(page.getByRole("heading", { name: "Hasil Server Checkpoint", exact: true })).toBeVisible();
  expect(fixture.calls.starts).toBe(0);
});
