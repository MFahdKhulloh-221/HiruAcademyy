import { test, expect, type Page } from "@playwright/test";
import { assessmentSessions, assessmentSessionLabels, type ServerAttempt } from "../src/lib/assessment-attempt";

async function mockTryOut(page: Page, answered = 0, duration: number | null = null) {
  const base = Date.parse("2026-10-11T00:00:00Z");
  let deadline = duration === null ? null : base + duration * 1000;
  const questions = assessmentSessions.flatMap((session, section) => Array.from({ length: 25 }, (_, index) => ({ id: 9000 + section * 1000 + index * 7, session, instruction: "Choose one answer", japanese: { text: "学校", reading: "がっこう" }, question: `Question ${section * 25 + index + 1}`, options: { A: "First", B: "Second", C: "Third", D: "Fourth" } })));
  let server: ServerAttempt = { id: 9, status: "in_progress", revision: 0, questions, answers: Object.fromEntries(questions.slice(0, answered).map(item => [item.id, "A"])), result: null };
  const calls = { starts: 0, submits: 0, saves: 0, failSubmit: false, failSave: false, failRead: false, incompleteExpiry: false, reads: 0, pauseSave: undefined as Promise<void> | undefined, pauseSubmit: undefined as Promise<void> | undefined };
  await page.route(/\/(api\/|sanctum\/csrf-cookie)/, async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const headers = { "access-control-allow-origin": new URL(page.url()).origin, "access-control-allow-credentials": "true", "access-control-allow-methods": "GET, POST, PUT, OPTIONS", "access-control-allow-headers": "accept, content-type, x-xsrf-token" };
    const reply = (data: unknown, status = 200) => route.fulfill({ status, headers, json: { data } });
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (path === "/sanctum/csrf-cookie") return route.fulfill({ status: 204, headers: { ...headers, "set-cookie": "XSRF-TOKEN=testing; Path=/" } });
    if (path === "/api/me") return reply({ id: 71, name: "Student", email: "practice@example.test", whatsapp: "081234567890", role: "student", account_status: "active" });
    if (path === "/api/public/programs") return reply([{ id: 5, code: "n5", name: "JLPT N5", family: "jlpt" }]);
    if (path === "/api/student/access") return reply({ learning: { n5: "full" }, replay_levels: [], source_grants: [{ plan_code: "lms", program_code: "n5" }] });
    const detail = { duration_minutes: duration === null ? null : Math.ceil(duration / 60), id: 2, level: "N5", title: "Server Try Out", max_score: 180, sessions: Object.fromEntries(assessmentSessions.map((session, index) => [session, assessmentSessionLabels[index]])) };
    if (path === "/api/student/try-outs") return reply([detail]);
    if (path === "/api/student/try-outs/2") return reply(detail);
    if (path.endsWith("/history")) return reply({ best_score: null, attempts: [] });
    if (path.includes("/attempts")) {
      if (method === "GET") {
        calls.reads++;
        if (calls.failRead) { calls.failRead = false; return reply(null, 503); }
      }
      if (method === "POST" && path.endsWith("/attempts")) {
        calls.starts++;
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
  return { calls, questions, getServer: () => server };
}

for (const stage of ["", "&tryout_stage=check"]) {
  test(`total countdown persists through sessions, refresh and expiry ${stage}`, async ({ page }) => {
    await page.clock.install({ time: new Date("2026-10-11T00:00:00Z") });
    const mock = await mockTryOut(page, 50, 120);
    let dialogs = 0;
    page.on("dialog", async dialog => { dialogs++; await dialog.dismiss(); });
    await page.goto(`/tryout?tryout=2&attempt=9${stage}`);
    const timer = page.getByRole("timer");
    await expect(timer).toBeVisible();
    await page.clock.pauseAt(await page.evaluate(() => new Date(Date.now() + 1000)));
    const start = await timer.locator("strong").innerText();
    const seconds = start.split(":").reduce((minutes, value) => minutes * 60 + Number(value), 0);
    const afterFive = `01:${String(seconds - 65).padStart(2, "0")}`;
    await expect(timer).toContainText("TIMER");
    await expect(timer).toContainText("Sisa waktu ujian");
    await page.clock.runFor(5000);
    await expect(timer).toContainText(afterFive);
    if (!stage) {
      await page.getByRole("button", { name: "Tata Bahasa", exact: true }).click();
      await expect(timer).toContainText(afterFive);
      await page.getByRole("button", { name: "Periksa Jawaban", exact: true }).click();
    }
    await page.reload();
    await expect.poll(async () => { await page.clock.runFor(1); return await page.getByRole("heading", { name: "Periksa Jawaban", exact: true }).isVisible(); }).toBe(true);
    await expect(timer).toContainText(afterFive);
    await page.clock.runFor(115000);
    await expect(page.getByRole("heading", { name: "Hasil Server Try Out", exact: true })).toBeVisible();
    expect(mock.calls.saves).toBe(0);
    expect(mock.calls.submits).toBe(0);
    expect(dialogs).toBe(0);
    expect(mock.getServer().answers).toHaveProperty(String(mock.questions[0].id), "A");
    await page.getByRole("button", { name: "Ulangi Try Out", exact: true }).click();
    await expect(timer).toContainText("02:00");
    await page.clock.runFor(1000);
    await expect(timer).toContainText("01:59");
    expect(mock.calls.starts).toBe(1);
  });
}

for (const failure of ["network", "incomplete"]) {
  test(`expiry ${failure} keeps answer check until authoritative retry`, async ({ page }) => {
    await page.clock.install({ time: new Date("2026-10-11T00:00:00Z") });
    const mock = await mockTryOut(page, 0, 30);
    await page.goto("/tryout?tryout=2&attempt=9&tryout_stage=check");
    await expect(page.getByRole("timer")).toBeVisible();
    await page.clock.pauseAt(await page.evaluate(() => new Date(Date.now() + 1000)));
    const reads = mock.calls.reads;
    if (failure === "network") mock.calls.failRead = true;
    else mock.calls.incompleteExpiry = true;
    await page.clock.runFor(30000);
    await expect(page.getByRole("alert").filter({ hasText: failure === "network" ? "HTTP 503" : "backend belum mengonfirmasi" })).toBeVisible();
    await expect(page.locator(".tryout-result-page")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Periksa Jawaban", exact: true })).toBeVisible();
    mock.calls.incompleteExpiry = false;
    await page.getByRole("button", { name: "Coba Lagi", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Hasil Server Try Out", exact: true })).toBeVisible();
    expect(mock.calls.saves).toBe(0);
    expect(mock.calls.submits).toBe(0);
    expect(mock.calls.reads).toBe(reads + 2);
  });
}

test("manual synchronization crossing expiry never confirms or autosaves late snapshot", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-11T00:00:00Z") });
  const mock = await mockTryOut(page, 0, 30);
  await page.goto("/tryout?tryout=2&attempt=9&tryout_stage=check");
  await expect(page.getByRole("timer")).toBeVisible();
  await page.clock.pauseAt(await page.evaluate(() => new Date(Date.now() + 1000)));
  let release!: () => void;
  mock.calls.pauseSave = new Promise<void>(resolve => { release = resolve; });
  let dialogs = 0;
  page.on("dialog", async dialog => { dialogs++; await dialog.dismiss(); });
  await page.getByRole("button", { name: "Selesaikan Kuis", exact: true }).click();
  await expect.poll(() => mock.calls.saves).toBe(1);
  await page.clock.runFor(30000);
  release();
  await expect(page.getByRole("heading", { name: "Hasil Server Try Out", exact: true })).toBeVisible();
  expect(dialogs).toBe(0);
  expect(mock.calls.saves).toBe(1);
  expect(mock.calls.submits).toBe(0);
});

for (const width of [1280, 360]) {
  test(`check navigation, autosave, refresh and history at ${width}px (mock API)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const mock = await mockTryOut(page, 80);
    await page.goto("/tryout?tryout=2&attempt=9");
    await expect(page.getByRole("heading", { name: "Soal 1 dari 100", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Periksa Jawaban", exact: true }).click();
    const check = page.locator(".tryout-answer-check");
    await expect(check.getByRole("heading", { name: "Periksa Jawaban", exact: true })).toBeVisible();
    await expect(check).toContainText("Server Try Out • Attempt 9");
    await expect(check).toContainText("Total Soal: 100 • Terjawab: 80 • Belum Dijawab: 20");
    await expect(check).toContainText("Masih ada 20 soal yang belum dijawab. Kamu tetap dapat menyelesaikan Try Out, tetapi soal yang kosong akan dihitung sebagai tidak benar.");
    await expect(check.locator(".tryout-check-numbers button")).toHaveText(Array.from({ length: 100 }, (_, index) => String(index + 1)));
    await expect(check.locator(".answered")).toHaveCount(80);
    await expect(check.locator(".unanswered")).toHaveCount(20);
    await expect(check.getByRole("button", { name: "Soal 81, Belum Dijawab", exact: true })).toBeVisible();
    await expect(check.getByRole("heading", { name: "Periksa Jawaban", exact: true })).toBeFocused();
    for (const [index, label] of assessmentSessionLabels.entries()) {
      const card = check.locator(".tryout-check-card").nth(index);
      await expect(card.getByRole("heading", { name: label, exact: true })).toBeVisible();
      await expect(card.locator("p")).toHaveText(index < 3 ? "25/25 dijawab" : "5/25 dijawab");
      expect(await card.locator(".tryout-check-numbers").evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(5);
    }
    expect(mock.calls.submits).toBe(0);
    expect(mock.calls.saves).toBe(0);
    await expect(page.getByText("Jawaban benar:")).toHaveCount(0);
    expect(await check.locator("button").evaluateAll(buttons => buttons.every(button => { const rect = button.getBoundingClientRect(); return rect.width >= 44 && rect.height >= 44; }))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (width === 360) {
      const widths = await check.locator(".tryout-check-actions button").evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().width));
      expect(widths[0]).toBe(widths[1]);
      expect(widths[0]).toBeGreaterThan(250);
    }
    await check.getByRole("button", { name: "Soal 30, Terjawab", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Question 30", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tata Bahasa", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(new RegExp(`tryout_question=${mock.questions[29].id}`));
    await page.goBack();
    await expect(check).toBeVisible();
    await expect(check.getByRole("heading", { name: "Periksa Jawaban", exact: true })).toBeFocused();
    await page.goForward();
    await expect(page.getByRole("heading", { name: "Question 30", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Periksa Jawaban", exact: true }).click();
    await check.getByRole("button", { name: "Soal 80, Terjawab", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Question 80", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Audio (Choukai)", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Selanjutnya", exact: true }).click();
    await page.locator("label").filter({ has: page.getByRole("radio", { name: "A. First", exact: true }) }).click();
    await expect(page.getByRole("status")).toHaveText("Tersimpan");
    await page.getByRole("button", { name: "Periksa Jawaban", exact: true }).click();
    await expect(check.getByRole("button", { name: "Soal 81, Terjawab", exact: true })).toBeVisible();
    await expect(check).toContainText("Total Soal: 100 • Terjawab: 81 • Belum Dijawab: 19");
    await page.reload();
    await expect(check).toBeVisible();
    await expect(check).toContainText("Server Try Out • Attempt 9");
    await check.getByRole("button", { name: "Kembali ke Soal", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Question 81", exact: true })).toBeVisible();
    await expect(page.getByRole("radio", { name: "A. First", exact: true })).toBeChecked();
    expect(mock.calls.starts).toBe(0);
    expect(mock.calls.submits).toBe(0);
  });
}

test("autosave response preserves newer question navigation (mock API)", async ({ page }) => {
  const mock = await mockTryOut(page);
  await page.goto("/tryout?tryout=2&attempt=9");
  await expect(page.getByRole("heading", { name: "Question 1", exact: true })).toBeVisible();
  let release!: () => void;
  mock.calls.pauseSave = new Promise<void>(resolve => { release = resolve; });
  await page.locator("label").filter({ has: page.getByRole("radio", { name: "A. First", exact: true }) }).click();
  await page.getByRole("button", { name: "Periksa Jawaban", exact: true }).click();
  await page.getByRole("button", { name: "Soal 30, Belum Dijawab", exact: true }).click();
  release();
  await expect(page.getByRole("status")).toHaveText("Tersimpan");
  await expect(page.getByRole("heading", { name: "Question 30", exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`tryout_question=${mock.questions[29].id}`));
  await expect(page.locator(".tryout-answer-check")).toHaveCount(0);
  expect(mock.calls.starts).toBe(0);
  expect(mock.calls.submits).toBe(0);
});

for (const answered of [0, 50, 80, 100]) {
  test(`explicit confirmation submits ${answered}/100 once and retry clears check (mock API)`, async ({ page }) => {
    const mock = await mockTryOut(page, answered);
    await page.goto("/tryout?tryout=2&attempt=9&tryout_stage=check");
    await expect(page.getByRole("heading", { name: "Periksa Jawaban", exact: true })).toBeVisible();
    expect(mock.calls.submits).toBe(0);
    let confirmations = 0;
    page.on("dialog", async dialog => {
      confirmations++;
      expect(mock.calls.saves).toBeGreaterThan(0);
      expect(mock.calls.submits).toBe(0);
      expect(dialog.message()).toContain("Selesaikan Kuis? Jawaban akan dikumpulkan secara final dan tidak dapat diubah.");
      if (answered < 100) expect(dialog.message()).toContain(`Masih ada ${100 - answered} soal yang belum dijawab.`);
      await dialog.accept();
    });
    await page.getByRole("button", { name: "Selesaikan Kuis", exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    await expect(page.getByRole("heading", { name: "Hasil Server Try Out", exact: true })).toBeVisible();
    expect(confirmations).toBe(1);
    expect(mock.calls.submits).toBe(1);
    expect(mock.calls.saves).toBe(1);
    expect(Object.keys(mock.getServer().answers)).toHaveLength(answered);
    await expect(page.getByText("Jawaban benar:")).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Hasil Server Try Out", exact: true })).toBeVisible();
    await expect(page.locator(".tryout-answer-check")).toHaveCount(0);
    await page.getByRole("button", { name: "Ulangi Try Out", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Soal 1 dari 100", exact: true })).toBeVisible();
    await expect(page).toHaveURL(/attempt=10/);
    expect(new URL(page.url()).searchParams.has("tryout_stage")).toBe(false);
    expect(new URL(page.url()).searchParams.has("tryout_question")).toBe(false);
    expect(mock.calls.starts).toBe(1);
  });
}

test("queue flush precedes confirmation; cancellation and failures retain check (mock API)", async ({ page }) => {
  const mock = await mockTryOut(page);
  await page.goto("/tryout?tryout=2&attempt=9");
  await expect(page.getByRole("heading", { name: "Question 1", exact: true })).toBeVisible();
  let release!: () => void;
  mock.calls.pauseSave = new Promise<void>(resolve => { release = resolve; });
  await page.locator("label").filter({ has: page.getByRole("radio", { name: "A. First", exact: true }) }).click();
  await page.getByRole("button", { name: "Periksa Jawaban", exact: true }).click();
  const finish = page.getByRole("button", { name: "Selesaikan Kuis", exact: true });
  let dialogs = 0;
  page.on("dialog", async dialog => { dialogs++; expect(mock.getServer().answers).toEqual({ [mock.questions[0].id]: "A" }); await dialog.dismiss(); });
  await finish.click();
  const syncing = page.getByRole("button", { name: "Menyinkronkan…", exact: true });
  await expect(syncing).toBeDisabled();
  await expect(syncing).toHaveAttribute("aria-busy", "true");
  await expect(page.locator(".tryout-answer-check")).toHaveAttribute("aria-busy", "true");
  expect(dialogs).toBe(0);
  release();
  await expect(finish).toBeEnabled();
  expect(dialogs).toBe(1);
  expect(mock.calls.submits).toBe(0);
  mock.calls.failSave = true;
  await finish.click();
  await expect(page.getByRole("alert").filter({ hasText: "Permintaan belum berhasil" })).toBeVisible();
  expect(dialogs).toBe(1);
  expect(mock.calls.submits).toBe(0);
  page.removeAllListeners("dialog");
  page.on("dialog", dialog => dialog.accept());
  mock.calls.failSubmit = true;
  await finish.click();
  await expect(page.getByRole("alert").filter({ hasText: "Permintaan belum berhasil" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Periksa Jawaban", exact: true })).toBeVisible();
  await expect(page.locator(".tryout-result-page")).toHaveCount(0);
  await expect(finish).toBeEnabled();
  expect(mock.calls.submits).toBe(1);
  let releaseSubmit!: () => void;
  mock.calls.pauseSubmit = new Promise<void>(resolve => { releaseSubmit = resolve; });
  await finish.click();
  const submitting = page.getByRole("button", { name: "Mengumpulkan…", exact: true });
  await expect(submitting).toBeDisabled();
  await expect(submitting).toHaveAttribute("aria-busy", "true");
  releaseSubmit();
  await expect(page.getByRole("heading", { name: "Hasil Server Try Out", exact: true })).toBeVisible();
  expect(mock.calls.submits).toBe(2);
});

test("Try Out result distinguishes point thresholds from correct-answer thresholds", async ({ page }) => {
  const mock = await mockTryOut(page);
  Object.assign(mock.getServer(), { status: "completed", result: { earned: 75, max: 100, correct: 3, wrong: 1, unanswered: 0, overall_pass: false, sessions: [
    { code: "grammar", label: "Tata Bahasa", earned: 25, max: 30, correct: 1, wrong: 0, unanswered: 0, passing_score: 20, passing_score_basis: "points", pass: true },
    { code: "audio", label: "Audio", earned: 0, max: 30, correct: 0, wrong: 1, unanswered: 0, passing_score: 19, passing_score_basis: "correct_answers", pass: false },
  ] } });
  await page.goto("/tryout?tryout=2&attempt=9");
  const sections = page.locator(".tryout-result-sessions article");
  await expect(sections.nth(0)).toContainText("25 / 30");
  await expect(sections.nth(0)).toContainText("Passing score: 20 • Skor");
  await expect(sections.nth(1)).toContainText("Passing score: 19 • Jawaban benar");
  await expect(page.locator(".tryout-result-total")).toContainText("75");
  await expect(page.locator(".tryout-result-total")).toContainText("/ 100");
});

test("Try Out renders persisted instruction and semantic furigana", async ({ page }) => {
  await mockTryOut(page);
  await page.goto("/tryout?tryout=2&attempt=9");
  await expect(page.getByText("Choose one answer", { exact: true })).toBeVisible();
  await expect(page.locator("ruby")).toContainText("学校");
  await expect(page.locator("ruby rt")).toHaveText("がっこう");
});

async function inspectMobileMenu(page: Page, stage: string, testInfo: import("@playwright/test").TestInfo) {
  for (const [position, fraction] of [["top", 0], ["middle", 0.5], ["bottom", 1]] as const) {
    await page.evaluate(f => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), fraction);
    const metrics = await page.evaluate(() => {
      const menu = document.querySelector<HTMLElement>(".student-mobile-trigger")!;
      const box = menu.getBoundingClientRect();
      const visible = box.bottom > 0 && box.top < innerHeight;
      const overlaps = visible ? [...document.querySelectorAll("main h1, main h2, main p, main label, main button, main a")].filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top;
      }).map(el => el.textContent?.trim()) : [];
      const hit = visible ? document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) : null;
      return { scroll: scrollY, position: getComputedStyle(menu).position, box: box.toJSON(), overlaps, hit: hit?.closest("button")?.getAttribute("aria-label") };
    });
    await testInfo.attach(`${stage}-${position}-geometry`, { body: JSON.stringify(metrics), contentType: "application/json" });
    expect(metrics.overlaps, `${stage} ${position}: menu must not cover content`).toEqual([]);
    if (metrics.box.bottom > 0 && metrics.box.top < 1000) expect(metrics.hit).toBe("Buka navigasi");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`viewport-${stage}-${position}.png`), fullPage: false });
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: "Buka navigasi", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Navigasi siswa seluler" })).toBeVisible();
  await page.locator(".student-mobile-close").click();
}

for (const width of [1440, 390]) {
  test(`B1 last question, confirmation and review ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.install({ time: new Date("2026-10-11T00:00:00Z") });
    const mock = await mockTryOut(page, 0, 600);
    const server = mock.getServer();
    server.questions = server.questions.slice(0, 3);
    server.answers = { [server.questions[0].id]: "A", [server.questions[1].id]: "B" };
    await page.goto("/tryout?tryout=2&attempt=9");
    await expect(page.getByRole("heading", { name: "Question 1", exact: true })).toBeVisible();
    await expect(page.getByRole("timer")).toBeVisible();
    expect(await page.locator(".learning-question-head").evaluate(el => el.getBoundingClientRect().height)).toBeLessThan(150);
    await page.screenshot({ path: testInfo.outputPath(`first-${width}.png`), fullPage: true });
    if (width === 390) await inspectMobileMenu(page, "first", testInfo);
    await page.getByRole("button", { name: "Selanjutnya", exact: true }).click();
    await page.getByRole("button", { name: "Selanjutnya", exact: true }).click();
    const last = page.locator(".learning-question-actions").getByRole("button", { name: "Periksa Jawaban", exact: true });
    await expect(last).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`last-${width}.png`), fullPage: true });
    if (width === 390) await inspectMobileMenu(page, "last", testInfo);
    await last.click();
    await expect(page.getByRole("heading", { name: "Periksa Jawaban", exact: true })).toBeVisible();
    await expect(page.locator(".tryout-answer-check")).toContainText("Total Soal: 3 • Terjawab: 2 • Belum Dijawab: 1");
    await expect(page.getByText("Jawaban benar", { exact: false })).toHaveCount(0);
    expect(mock.calls.submits).toBe(0);
    await page.screenshot({ path: testInfo.outputPath(`check-${width}.png`), fullPage: true });
    if (width === 390) await inspectMobileMenu(page, "check", testInfo);
    await page.getByRole("button", { name: "Soal 1, Terjawab", exact: true }).click();
    await expect(page.getByRole("radio", { name: "A. First", exact: true })).toBeChecked();
    await page.locator(".tryout-sidebar-actions").getByRole("button", { name: "Periksa Jawaban", exact: true }).click();
    let confirmations = 0;
    page.on("dialog", async dialog => { confirmations++; await dialog.accept(); });
    await page.getByRole("button", { name: "Selesaikan Kuis", exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    await expect(page.getByRole("heading", { name: "Hasil Server Try Out", exact: true })).toBeVisible();
    expect(confirmations).toBe(1);
    expect(mock.calls.submits).toBe(1);
    await page.getByRole("button", { name: "Review Jawaban", exact: true }).click();
    await expect(page.getByText("Jawaban kamu · Salah", { exact: true })).toBeVisible();
    await expect(page.locator("label.review-correct")).toContainText("B.");
    await expect(page.locator("label.review-correct")).toHaveCSS("color", "rgb(37, 78, 43)");
    await expect(page.getByText("Backend explanation", { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`review-wrong-${width}.png`), fullPage: true });
    if (width === 390) await inspectMobileMenu(page, "review-wrong", testInfo);
    await page.getByRole("button", { name: "Selanjutnya", exact: true }).click();
    await expect(page.getByText("Jawaban kamu · Benar", { exact: true })).toBeVisible();
    await expect(page.locator("label.review-wrong")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`review-correct-${width}.png`), fullPage: true });
    if (width === 390) await inspectMobileMenu(page, "review-correct", testInfo);
    await page.getByRole("button", { name: "Selanjutnya", exact: true }).click();
    await expect(page.getByText("Tidak dijawab", { exact: true })).toBeVisible();
    await expect(page.getByRole("radio").first()).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath(`review-empty-${width}.png`), fullPage: true });
    if (width === 390) await inspectMobileMenu(page, "review-empty", testInfo);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Kembali ke Hasil", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Hasil Server Try Out", exact: true })).toBeVisible();
    expect(mock.calls.submits).toBe(1);
  });
}
