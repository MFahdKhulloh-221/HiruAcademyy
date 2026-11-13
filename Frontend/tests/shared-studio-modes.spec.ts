import { test, expect } from './canonical-fixture';

test('Try Out retains session tabs, points, and Audio editor outside chapter mode', async ({ page }) => {
  const question = { id: 70, session: 'audio', question: '音声の質問', audio_url: 'https://example.test/audio.mp3', options: { A: 'A', B: 'B', C: 'C', D: 'D' }, correct_option: 'A', explanation: '', point_value: 2.25, sort_order: 0, status: 'draft', reading_passage: null, passage_id: null };
  const item = { studio_revision: 'a'.repeat(64), id: 7, title: 'Try Out N5', program_id: 1, max_score: 180, sort_order: 0, status: 'draft', duration_minutes: 120, total_passing_score: null, session_passing_scores: null, passages: [], questions: [question] };
  await page.route('**/api/admin/try-outs**', route => route.fulfill({ json: { data: new URL(route.request().url()).pathname.endsWith('/try-outs') ? [item] : item } }));
  await page.goto('/admin/try-out');
  await page.getByRole('tab', { name: 'Bank Soal', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Reading (Dokkai)', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Audio (Choukai)', exact: true }).click();
  await expect(page.getByLabel('URL audio', { exact: true })).toHaveValue(question.audio_url);
  await expect(page.getByLabel('Judul audio', { exact: true })).toHaveCount(0);
  await page.getByText('Pengaturan soal', { exact: true }).click();
  await expect(page.getByLabel('Bobot poin', { exact: true })).toHaveValue('2.25');
});
