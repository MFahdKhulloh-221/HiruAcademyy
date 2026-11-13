import { test, expect } from './canonical-fixture';

for (const width of [390, 1440]) for (const kind of ['checkpoint', 'tryout'] as const) test(`${kind} admin publish without Audio ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  const endpoint = kind === 'checkpoint' ? 'checkpoint-packages' : 'try-outs';
  const title = kind === 'checkpoint' ? 'Checkpoint R19' : 'Try Out R19';
  let item = {
    id: 7, title, program_id: 1, studio_revision: 'a'.repeat(64),
    max_score: 3, sort_order: 1, status: 'draft', duration_minutes: 30,
    total_passing_score: null, session_passing_scores: null, passages: [],
    questions: ['vocabulary_kanji', 'grammar', 'reading'].map((session, index) => ({
      id: 70 + index, session, question: `Question ${index + 1}`,
      options: { A: 'One', B: 'Two', C: 'Three', D: 'Four' }, correct_option: 'A',
      explanation: '', point_value: 1, sort_order: index, status: 'published',
      reading_passage: session === 'reading' ? 'Reading text' : null,
      passage_id: null, audio_url: null,
    })),
  };
  let writes = 0;
  await page.route('**/api/admin/programs', route => route.fulfill({ json: { data: [{ id: 1, code: 'n5', name: 'JLPT N5', family: 'jlpt', status: 'active' }] } }));
  await page.route(`**/api/admin/${endpoint}**`, async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'PUT') {
      expect(path).toBe(`/api/admin/${endpoint}/7/studio`);
      const body = route.request().postDataJSON();
      expect(body.revision).toBe(item.studio_revision);
      expect(body.settings.status).toBe('published');
      expect(body.questions.map((question: { content: { session: string } }) => question.content.session)).toEqual(['vocabulary_kanji', 'grammar', 'reading']);
      expect(body.deleted_question_ids).toEqual([]);
      writes++;
      item = { ...item, ...body.settings };
    }
    const { questions, passages, studio_revision, ...summary } = item;
    await route.fulfill({ json: { data: path.endsWith(`/${endpoint}`) ? [{ ...summary, question_count: questions.length, published_question_count: questions.length }] : { ...summary, questions, passages, studio_revision } } });
  });
  await page.goto(kind === 'checkpoint' ? '/admin/checkpoint' : '/admin/try-out');
  await page.getByRole('button', { name: 'Detail', exact: true }).click();
  const dialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: kind === 'checkpoint' ? 'Edit Checkpoint' : 'Edit Try Out', exact: true }) });
  await dialog.getByRole('combobox', { name: 'Status', exact: true }).selectOption('Published');
  await dialog.getByRole('button', { name: kind === 'checkpoint' ? 'Simpan Checkpoint' : 'Simpan Try Out', exact: true }).click();
  if (kind === 'checkpoint') {
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('status').filter({ hasText: 'Checkpoint berhasil disimpan.' })).toBeVisible();
    expect(writes).toBe(1);
  } else {
    await expect(page.getByRole('dialog', { name: 'Tindakan belum berhasil' })).toContainText('Setiap sesi membutuhkan soal Published.');
    expect(writes).toBe(0);
  }
});
