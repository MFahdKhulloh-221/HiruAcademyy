import { expect, test } from "@playwright/test";

for (const [width, height] of [[1280, 720], [1366, 768], [1440, 900], [768, 1024], [390, 844]]) {
  test(`reading layout and answers ${width}x${height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    let failed = true;
    let answers: Record<string, string> = {};
    let completed = false;
    const passage = "毎朝、図書館で日本語を勉強します。友達と本を読んで、新しい言葉を書きます。午後は家に帰ります。";
    const questions = [1, 2].map(id => ({ id, question: `Pertanyaan Reading ${id}`, passage: { id: 7, title: "図書館の一日", body: `${passage}\n\n${passage.repeat(80)}` }, options: { A: "図書館で勉強します。", B: "家で休みます。", C: "友達と買い物に行きます。", D: "学校で働きます。" } }));
    const attempt = () => ({ id: 9, chapter_id: 11, kind: "reading", status: completed ? "completed" : "in_progress", revision: 1, questions, answers, result: completed ? { correct: 2, wrong: 0, unanswered: 0, percentage: 100 } : null });
    await page.route(/\/(api\/|sanctum\/csrf-cookie)/, async route => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();
      const headers = { "access-control-allow-origin": "http://localhost:3000", "access-control-allow-credentials": "true", "access-control-allow-methods": "GET, PUT, POST, OPTIONS", "access-control-allow-headers": "accept, content-type, x-xsrf-token" };
      const reply = (data: unknown) => route.fulfill({ headers, json: { data } });
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
      if (path === "/sanctum/csrf-cookie") return route.fulfill({ status: 204, headers: { ...headers, "set-cookie": "XSRF-TOKEN=test; Path=/" } });
      if (path === "/api/me") return reply({ id: 71, name: "Siswa", email: "student@example.test", whatsapp: "628123456789", role: "student", account_status: "active" });
      if (path === "/api/student/dashboard") return reply({ programs: [{ id: 1, code: "n5", name: "JLPT N5", family: "jlpt" }], access: { learning: { n5: "full" }, replay_levels: [], source_grants: [{ plan_code: "lms", program_code: "n5" }] }, chapters: [] });
      if (path === "/api/student/access") return reply({ learning: { n5: "full" }, replay_levels: [], source_grants: [{ plan_code: "lms", program_code: "n5" }] });
      const chapter = { id: 11, chapter_number: 1, title: "Chapter Satu", sort_order: 1, access: "full" };
      if (path.endsWith("/chapters")) return reply([chapter]);
      if (path.endsWith("/progress")) return reply({ chapter_id: 11, activities: {}, mini_unlocked: false });
      if (path === "/api/student/programs/1/chapters/11") return reply(chapter);
      if (path.includes("/attempts")) {
        if (failed) return route.fulfill({ headers, status: 503, json: { message: "Unavailable" } });
        if (method === "PUT") answers = route.request().postDataJSON().answers;
        if (path.endsWith("/submit")) completed = true;
        return reply(attempt());
      }
      return reply([]);
    });
    await page.goto("/learn/n5/chapter-1/reading?attempt=9");
    await expect(page.getByRole("alert").filter({ hasText: "Permintaan belum berhasil" })).toBeVisible();
    failed = false;
    await page.reload();
    const runner = page.locator(".reading-assessment");
    await expect(runner.getByRole("heading", { name: "Pertanyaan Reading 1", exact: true })).toBeVisible();
    const layout = await runner.evaluate(el => {
      const h2 = el.querySelector('.learning-question-card h2')!;
      const passage = el.querySelector('.reading-passage > p')!;
      const labels = [...el.querySelectorAll('label')];
      return { questionFont: parseFloat(getComputedStyle(h2).fontSize), passageFont: parseFloat(getComputedStyle(passage).fontSize), labels: labels.map(label => { const r = label.getBoundingClientRect(); return { height: r.height, width: r.width, fits: label.scrollWidth <= label.clientWidth }; }) };
    });
    expect(layout.passageFont).toBeGreaterThanOrEqual(16);
    if (width >= 1024) {
      expect(layout.passageFont).toBeLessThanOrEqual(20);
      expect(layout.questionFont).toBeLessThanOrEqual(22);
      expect(await runner.locator('.learning-question-head h1').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeLessThanOrEqual(30);
      expect(await runner.getByRole('button', { name: 'Selanjutnya', exact: true }).evaluate(el => el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(height);
    }
    for (const label of layout.labels) { expect(label.height).toBeGreaterThanOrEqual(44); expect(label.fits).toBe(true); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`reading-${width}.png`), fullPage: true });
    const passagePanel = runner.locator('.reading-passage');
    const questionCard = runner.locator('.learning-question-card');
    const passageBox = await passagePanel.boundingBox();
    const questionBox = await questionCard.boundingBox();
    expect(passageBox).not.toBeNull();
    expect(questionBox).not.toBeNull();
    if (width >= 1024) {
      expect(passageBox!.x + passageBox!.width).toBeLessThanOrEqual(questionBox!.x);
      expect(await passagePanel.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
      await passagePanel.evaluate(el => { el.scrollTop = 160; });
    } else {
      expect(passageBox!.y + passageBox!.height).toBeLessThanOrEqual(questionBox!.y);
    }
    const passageNode = await passagePanel.elementHandle();
    const url = page.url();
    await runner.getByRole('radio', { name: 'A. 図書館で勉強します。', exact: true }).check();
    await expect(runner.getByRole('status')).toHaveText('Tersimpan');
    await runner.getByRole('button', { name: 'Selanjutnya', exact: true }).click();
    await expect(runner.getByRole('heading', { name: 'Pertanyaan Reading 2', exact: true })).toBeVisible();
    expect(page.url()).toBe(url);
    await expect(passagePanel).toHaveCount(1);
    expect(await passagePanel.evaluate((el, previous) => el === previous, passageNode)).toBe(true);
    if (width >= 1024) expect(await passagePanel.evaluate(el => el.scrollTop)).toBe(160);
    await runner.getByRole('button', { name: 'Soal 1', exact: true }).click();
    await expect(runner.getByRole('radio', { name: 'A. 図書館で勉強します。', exact: true })).toBeChecked();
    await runner.getByRole('button', { name: 'Soal 2', exact: true }).click();
    await runner.getByRole('button', { name: 'Sebelumnya', exact: true }).click();
    await expect(runner.getByRole('radio', { name: 'A. 図書館で勉強します。', exact: true })).toBeChecked();
    await page.reload();
    await expect(page.getByRole('radio', { name: 'A. 図書館で勉強します。', exact: true })).toBeChecked();
    await page.getByRole('button', { name: 'Selanjutnya', exact: true }).click();
    await page.getByRole('radio', { name: 'B. 家で休みます。', exact: true }).check();
    await expect(page.getByRole('button', { name: 'Kumpulkan Jawaban', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Kumpulkan Jawaban', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Hasil Reading', exact: true })).toBeVisible();
    await expect(page.locator('.checkpoint-recommendation')).toContainText(/belum|tidak.*tersedia/i);
  });
}
