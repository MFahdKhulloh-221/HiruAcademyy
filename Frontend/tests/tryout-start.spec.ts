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
    const detail = { duration_minutes: duration === null ? null : Math.ceil(duration / 60), id: 2, level: "N5", title: "Server Try Out", max_score: 180, sessions: Object.fromEntries(assessmentSessions.map((session, index) => [session, assessmentSessionLabels[index]])) };
    if (path === "/api/student/try-outs") return reply([detail]);
    if (path === "/api/student/try-outs/2") return reply(detail);
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
  test(`tryout collapsible grouped navigator ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockTryOut(page);
    await page.goto('/tryout?membership=sensei&tryout=2');
    await page.getByRole('button', { name: 'Mulai Try Out', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Mulai', exact: true }).click();
    const topbar = page.getByLabel('Informasi pengerjaan Try Out', { exact: true });
    await expect(topbar.getByRole('heading', { name: /Server Try Out/ })).toBeVisible();
    await expect(topbar).toContainText('Server Try Out');
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
  test(`tryout instructions below simulation info ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockTryOut(page);
    await page.goto('/tryout?membership=sensei&tryout=2');
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
for (const width of [1440, 390]) {
  test(`B2-A warning start retry cancel ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const mock = await mockTryOut(page, 0, 600);
    await page.goto('/tryout?tryout=2');
    await expect(page.getByRole('heading', { name: 'Peringatan' })).toBeVisible();
    await expect(page.getByText('OPEN:', { exact: false })).toHaveCount(0);
    await expect(page.getByText('Pengerjaan dibatasi 10 menit', { exact: false })).toBeVisible();
    expect(mock.calls.starts).toBe(0);
    await page.screenshot({ path: testInfo.outputPath(`warning-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Kembali', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Simulasi yang tersedia' })).toBeVisible();
    expect(mock.calls.starts).toBe(0);
    await page.getByRole('button', { name: 'Mulai Try Out', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Peringatan' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Peringatan' })).toBeVisible();
    expect(mock.calls.starts).toBe(0);
    mock.calls.failStart = true;
    await page.getByRole('button', { name: 'Mulai Try Out', exact: true }).click();
    await expect(page.locator('.tryout-prestart').getByRole('alert')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mulai Try Out', exact: true })).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath(`error-${width}.png`), fullPage: true });
    expect(mock.calls.starts).toBe(1);
    await page.getByRole('button', { name: 'Mulai Try Out', exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    await expect(page.getByRole('heading', { name: 'Question 1', exact: true })).toBeVisible();
    expect(mock.calls.starts).toBe(2);
    await expect(page.getByRole('timer')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
  test(`B2-A resume ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.install({ time: new Date('2026-10-11T00:00:00Z') });
    const mock = await mockTryOut(page, 1, 600);
    mock.history.push({ id: 9, status: 'in_progress', expires_at: '2026-10-11T00:10:00Z', server_now: '2026-10-11T00:00:00Z' });
    await page.goto('/tryout?tryout=2');
    await expect(page.getByRole('button', { name: 'Lanjutkan Try Out', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`active-${width}.png`), fullPage: true });
    mock.calls.failRead = true;
    await page.getByRole('button', { name: 'Lanjutkan Try Out', exact: true }).click();
    await expect(page.locator('.tryout-prestart').getByRole('alert')).toBeVisible();
    expect(mock.calls.starts).toBe(0);
    expect(new URL(page.url()).searchParams.get('attempt')).toBe('9');
    await expect(page.getByRole('heading', { name: 'Question 1', exact: true })).toHaveCount(0);
    mock.calls.failRead = false;
    await page.getByRole('button', { name: 'Lanjutkan Try Out', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'A. First', exact: true })).toBeChecked();
    await expect(page.getByRole('timer')).toContainText(/10:00|09:5\d/);
    expect(mock.getServer().expires_at).toBe('2026-10-11T00:10:00.000Z');
    expect(mock.calls.reads).toBeGreaterThanOrEqual(2);
    expect(new URL(page.url()).searchParams.get('attempt')).toBe('9');
    await page.reload();
    await expect(page.getByRole('radio', { name: 'A. First', exact: true })).toBeChecked();
    expect(mock.calls.starts).toBe(0);
  });
}
for (const status of ['completed', 'expired', 'in_progress']) {
  test(`B2-A no resume ${status} past deadline`, async ({ page }) => {
    const mock = await mockTryOut(page);
    mock.history.push({ id: 9, status, expires_at: '2026-10-11T00:00:00Z', server_now: '2026-10-11T00:01:00Z' });
    await page.goto('/tryout?tryout=2');
    await expect(page.getByRole('heading', { name: 'Peringatan' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lanjutkan Try Out', exact: true })).toHaveCount(0);
    expect(mock.calls.starts).toBe(0);
  });
}
for (const width of [1440, 768, 390]) {
  test(`timer deadline countdown refresh suspended tab and expiry ${width}`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.install({ time: new Date('2026-10-11T00:00:00Z') });
    await page.clock.pauseAt(new Date('2026-10-11T00:00:00Z'));
    const mock = await mockTryOut(page, 1, 600);
    await page.goto('/tryout?tryout=2&attempt=9');
    const timer = page.getByRole('timer');
    await expect.poll(async () => { await page.clock.runFor(1); return timer.count(); }).toBe(1);
    const seconds = async () => {
      const [minutes, seconds] = (await timer.locator('strong').innerText()).split(':').map(Number);
      return minutes * 60 + seconds;
    };
    const initialSeconds = await seconds();
    expect(initialSeconds).toBeGreaterThanOrEqual(599);
    expect(initialSeconds).toBeLessThanOrEqual(600);
    await page.clock.runFor(5000);
    await expect(timer.locator('strong')).toHaveText('09:55');
    await page.getByRole('button', { name: 'Selanjutnya', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Question 2', exact: true })).toBeVisible();
    await expect(timer.locator('strong')).toHaveText('09:55');
    await page.getByRole('button', { name: 'Sebelumnya', exact: true }).click();
    await expect(timer.locator('strong')).toHaveText('09:55');
    await page.reload();
    await expect.poll(async () => { await page.clock.runFor(1); return timer.count(); }).toBe(1);
    await expect(timer.locator('strong')).toHaveText('09:55');
    const other = await context.newPage();
    await other.bringToFront();
    // Simulate a throttled/suspended interval: one tick after 60 seconds, not 60 ticks.
    await page.clock.fastForward(60000);
    await page.bringToFront();
    await other.close();
    await expect(timer.locator('strong')).toHaveText('08:55');
    expect(mock.calls.starts).toBe(0);
    await expect(page.getByText('Backend explanation', { exact: true })).toHaveCount(0);
    await timer.scrollIntoViewIfNeeded();
    await expect(timer).toBeInViewport();
    const layout = await timer.evaluate(el => {
      const rect = el.getBoundingClientRect();
      const title = el.parentElement!.querySelector('h1')!.getBoundingClientRect();
      return { readable: parseFloat(getComputedStyle(el.querySelector('strong')!).fontSize) >= 16, clear: rect.right <= title.left || rect.left >= title.right || rect.bottom <= title.top || rect.top >= title.bottom, unobscured: el.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)) };
    });
    expect(layout).toEqual({ readable: true, clear: true, unobscured: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.clock.fastForward(533000);
    await expect(timer.locator('strong')).toHaveText('00:02');
    await page.clock.runFor(2000);
    await expect(page.getByRole('heading', { name: 'Hasil Server Try Out', exact: true })).toBeVisible();
    expect(mock.getServer().status).toBe('completed');
    expect(mock.calls.submits).toBe(0);
    expect(mock.calls.starts).toBe(0);
  });
}

test('timer expired attempt on open uses backend result without a new start', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-11T00:11:00Z') });
  const mock = await mockTryOut(page, 1, 600);
  await page.goto('/tryout?tryout=2&attempt=9');
  await expect(page.getByRole('heading', { name: 'Hasil Server Try Out', exact: true })).toBeVisible();
  await expect(page.getByRole('timer')).toHaveCount(0);
  expect(mock.calls.starts).toBe(0);
  expect(mock.calls.submits).toBe(0);
  expect(mock.getServer().status).toBe('completed');
});


test("tryout start and exit confirmations preserve normal resume", async ({ page }) => {
  const fixture = await mockTryOut(page, 0, 7200);
  await page.goto('/tryout?membership=sensei&tryout=2');
  await page.getByRole('button', { name: 'Mulai Try Out', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Siap memulai Try Out sekarang?');
  expect(fixture.calls.starts).toBe(0);
  await dialog.getByRole('button', { name: 'Kembali', exact: true }).click();
  await page.getByRole('button', { name: 'Mulai Try Out', exact: true }).click();
  await dialog.getByRole('button', { name: 'Mulai', exact: true }).click();
  await expect(page.getByLabel('Informasi pengerjaan Try Out')).toBeVisible();
  expect(fixture.calls.starts).toBe(1);
  await page.locator('.learning-question-card fieldset > label').first().click();
  await expect.poll(() => fixture.calls.saves).toBe(1);
  fixture.history.push({ id: 10, status: 'in_progress', expires_at: fixture.getServer().expires_at!, server_now: fixture.getServer().server_now! });
  await page.goto('/tryout?membership=sensei&tryout=2');
  await page.getByRole('button', { name: 'Lanjutkan Try Out', exact: true }).click();
  await expect(page.getByRole('radio').first()).toBeChecked();
  expect(fixture.calls.starts).toBe(1);
  await page.getByRole('button', { name: 'Keluar Sesi', exact: true }).click();
  await expect(dialog).toContainText('Yakin ingin keluar sesi?');
  await dialog.getByRole('button', { name: 'Kembali', exact: true }).click();
  await expect(page.getByRole('radio').first()).toBeChecked();
  await page.getByRole('button', { name: 'Keluar Sesi', exact: true }).click();
  await dialog.getByRole('button', { name: 'Keluar Sesi', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Try Out', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mulai Try Out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Lanjutkan Try Out', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Mulai Try Out', exact: true }).click();
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
  await page.goto('/tryout?membership=sensei');
  await expect(page.getByRole('heading', { name: 'Server Try Out', exact: true })).toBeVisible();
  await page.screenshot({ path: `C:/Users/Tulo/AppData/Local/Temp/opencode/studio-student-list-${width}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Mulai Try Out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Server Try Out', exact: true })).toBeVisible();
  await page.screenshot({ path: `C:/Users/Tulo/AppData/Local/Temp/opencode/studio-student-info-${width}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Mulai Try Out', exact: true }).click();
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
