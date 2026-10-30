import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('real local draft save reopen publish without changing existing bank', async ({ page, context }) => {
  test.skip(process.env.HIRU_STUDIO_LOCAL_QA !== '1', 'Explicit local QA only.');
  const session = JSON.parse(readFileSync('C:/Users/Tulo/AppData/Local/Temp/opencode/studio-local-session.json', 'utf8'));
  await context.addCookies([{ name: session.name, value: session.value, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await page.goto('/admin/try-out');
  await expect(page.getByRole('button', { name: 'Buka Builder', exact: true })).toHaveCount(6, { timeout: 30000 });
  async function api(path: string, method = 'GET', body?: unknown) {
    return page.evaluate(async ({ path, method, body }) => {
      if (method !== 'GET') await fetch('http://localhost:8000/sanctum/csrf-cookie', { credentials: 'include' });
      const csrf = document.cookie.split('; ').find(cookie => cookie.startsWith('XSRF-TOKEN='))?.slice(11);
      const response = await fetch(`http://localhost:8000${path}`, { method, credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(csrf ? { 'X-XSRF-TOKEN': decodeURIComponent(csrf) } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, body: await response.json().catch(() => null) };
    }, { path, method, body });
  }
  const before = await api('/api/admin/try-outs');
  expect(before.status).toBe(200);
  const title = `QA-STUDIO-INTEGRATION-${Date.now()}`;
  let id: number | undefined;
  try {
    await page.getByRole('button', { name: '+ Buat Try Out', exact: true }).click();
    await page.getByRole('dialog').getByLabel('Judul', { exact: true }).fill(title);
    await page.getByRole('button', { name: 'Buat & Buka Builder', exact: true }).click();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible({ timeout: 30000 });
    const catalog = await api('/api/admin/try-outs');
    id = catalog.body.data.find((item: { title: string }) => item.title === title).id;
    await page.getByRole('button', { name: '+ Tambah Soal', exact: true }).click();
    await page.getByRole('textbox', { name: 'Pertanyaan', exact: true }).fill('QA question vocabulary');
    for (const letter of ['A', 'B', 'C', 'D']) await page.getByRole('textbox', { name: `Pilihan ${letter}`, exact: true }).fill(`QA ${letter}`);
    await page.getByLabel('Jawaban Benar', { exact: true }).selectOption('0');
    await page.getByLabel('Bobot poin', { exact: true }).fill('45');
    await page.getByRole('button', { name: 'Simpan Try Out', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Try Out berhasil disimpan.' })).toBeVisible({ timeout: 30000 });
    await page.reload();
    const row = page.getByRole('row').filter({ hasText: title });
    await row.getByRole('button', { name: 'Buka Builder', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Pertanyaan', exact: true })).toContainText('QA question vocabulary');
    const invalid = await api(`/api/admin/try-outs/${id}`, 'PATCH', { status: 'published' });
    expect(invalid.status).toBe(422);
    for (const section of ['grammar', 'reading', 'audio']) {
      const result = await api(`/api/admin/try-outs/${id}/questions`, 'POST', { session: section, question: `QA ${section}`, options: { A: 'One', B: 'Two', C: 'Three', D: 'Four' }, correct_option: 'A', point_value: 45, status: 'published', reading_passage: section === 'reading' ? 'QA legacy reading' : null, audio_url: section === 'audio' ? 'https://example.test/qa.mp3' : null });
      expect(result.status).toBe(201);
    }
    const detail = await api(`/api/admin/try-outs/${id}`);
    expect(detail.body.data.questions).toHaveLength(4);
    expect(detail.body.data.access_type).toBe('membership');
    const shared = await api(`/api/admin/try-outs/${id}/studio`, 'PUT', {
      revision: detail.body.data.studio_revision, settings: { status: 'draft' },
      passages: [{ id: 'qa-shared', title: 'QA shared reading', body: '<p><ruby>\u5c71<rt>\u3084\u307e</rt></ruby> QA passage</p>' }],
      questions: detail.body.data.questions.map((question: Record<string, unknown>) => {
        const { id: questionId, try_out_id, audio_url_resolved_url, ...content } = question;
        void try_out_id; void audio_url_resolved_url;
        return { id: String(questionId), content: { ...content, ...(content.session === 'reading' ? { passage_id: 'qa-shared', reading_passage: null } : {}) } };
      }), deleted_question_ids: [], deleted_passage_ids: [],
    });
    expect(shared.status).toBe(200);
    const reopened = await api(`/api/admin/try-outs/${id}`);
    expect(reopened.body.data.passages).toHaveLength(1);
    expect(reopened.body.data.questions.find((question: { session: string }) => question.session === 'reading').passage_id).toBe(reopened.body.data.passages[0].id);
    expect(reopened.body.data.passages[0].body).toContain('<ruby>');
    const first = detail.body.data.questions.find((question: { session: string }) => question.session === 'vocabulary_kanji');
    expect((await api(`/api/admin/try-outs/${id}/questions/${first.id}`, 'PATCH', { status: 'published' })).status).toBe(200);
    expect((await api(`/api/admin/try-outs/${id}`, 'PATCH', { access_type: 'free', status: 'published' })).status).toBe(200);
    expect((await api(`/api/admin/try-outs/${id}`)).body.data.status).toBe('published');
    const studentSession = JSON.parse(readFileSync('C:/Users/Tulo/AppData/Local/Temp/opencode/studio-student-session.json', 'utf8'));
    const studentContext = await context.browser()!.newContext();
    try {
      await studentContext.addCookies([{ name: studentSession.name, value: studentSession.value, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
      const students = await studentContext.request.get('http://localhost:8000/api/student/try-outs', { headers: { Accept: 'application/json', Origin: 'http://localhost:3000', Referer: 'http://localhost:3000/' } });
      expect(students.status()).toBe(200);
      expect((await students.json()).data.some((item: { id: number }) => item.id === id)).toBe(true);
    } finally { await studentContext.close(); }
  } finally {
    if (id) {
      const detail = await api(`/api/admin/try-outs/${id}`);
      expect(detail.body.data.title).toBe(title);
      expect(detail.body.data.questions.every((question: { question: string }) => question.question.startsWith('QA'))).toBe(true);
      expect((await api(`/api/admin/try-outs/${id}`, 'DELETE')).status).toBe(204);
    }
    const after = await api('/api/admin/try-outs');
    expect(after.body).toEqual(before.body);
  }
});
