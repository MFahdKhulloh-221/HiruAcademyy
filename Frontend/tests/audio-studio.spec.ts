import { test, expect } from './canonical-fixture';

const original = { id: 10, chapter_id: 1, title: 'Audio awal', audio_url: 'https://example.test/audio.mp3', question: 'Pertanyaan awal', options: { A: 'Satu', B: 'Dua', C: 'Tiga', D: 'Empat' }, correct_option: 'B', explanation: 'Pembahasan awal', sort_order: 0, status: 'draft' };

test.beforeEach(async ({ page }) => {
  await page.route('**/api/admin/chapters', route => route.fulfill({ json: { data: [{ id: 1, program_id: 1, title: 'Chapter satu' }, { id: 2, program_id: 1, title: 'Chapter dua' }] } }));
});

test('audio adapter checkpoints successful creates and retries only pending writes', async ({ page }) => {
  const rows: Record<string, unknown>[] = [{ ...original }];
  const writes: { method: string; path: string; body: Record<string, unknown> }[] = [];
  let fail = true;
  await page.route('**/api/admin/audio-questions**', async route => {
    const method = route.request().method();
    const path = new URL(route.request().url()).pathname;
    if (method === 'GET') return route.fulfill({ json: { data: rows } });
    const body = route.request().postDataJSON();
    writes.push({ method, path, body });
    if (method === 'POST' && fail && writes.filter(item => item.method === 'POST').length === 2) {
      fail = false; return route.fulfill({ status: 422, json: { message: 'Retry test' } });
    }
    const item = { ...body, id: method === 'POST' ? 100 + rows.length : Number(path.split('/').at(-1)) };
    rows.push(item);
    await route.fulfill({ json: { data: item } });
  });
  await page.goto('/admin/audio-question');
  await page.getByLabel('Program', { exact: true }).selectOption('1');
  await page.getByLabel('Chapter', { exact: true }).selectOption('1');
  await expect(page.getByLabel('Judul audio', { exact: true })).toHaveValue(original.title);
  await expect(page.getByRole('tab', { name: 'Reading (Dokkai)' })).toHaveCount(0);
  await expect(page.getByLabel('Bobot poin', { exact: true })).toHaveCount(0);
  for (let index = 0; index < 2; index++) {
    await page.getByText('Aksi soal', { exact: true }).click();
    await page.getByRole('button', { name: 'Duplikat Soal', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Simpan Audio', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Penyimpanan belum selesai' })).toBeVisible();
  expect(writes).toHaveLength(2);
  expect(writes[0].body).toEqual({ chapter_id: 1, title: original.title, audio_url: original.audio_url, question: original.question, options: original.options, correct_option: 'B', explanation: original.explanation, sort_order: 1, status: 'draft' });
  await page.getByRole('button', { name: 'Simpan Audio', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Semua perubahan Audio tersimpan.' })).toBeVisible();
  expect(writes).toHaveLength(3);
  expect(writes.map(item => item.method)).toEqual(['POST', 'POST', 'POST']);
  expect(writes[2].body.sort_order).toBe(2);
  await page.getByRole('button', { name: 'Simpan & Publish Audio', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Audio berhasil dipublikasikan.' })).toBeVisible();
  expect(writes.slice(3)).toHaveLength(3);
  expect(writes.slice(3).every(item => item.method === 'PATCH' && item.body.status === 'published')).toBe(true);
});

test('audio dirty filters preserve edits; upload blocks save and chapter changes', async ({ page }) => {
  let writes = 0;
  let finishUpload!: () => void;
  const upload = new Promise<void>(resolve => { finishUpload = resolve; });
  await page.route('**/api/admin/audio-questions**', async route => {
    if (route.request().method() !== 'GET') writes++;
    await route.fulfill({ json: { data: route.request().method() === 'GET' ? [original] : original } });
  });
  await page.route('**/api/admin/media**', async route => {
    await upload;
    await route.fulfill({ json: { data: { path: 'audio/new.mp3', url: 'https://example.test/new.mp3' } } });
  });
  await page.goto('/admin/audio-question');
  await page.getByLabel('Program', { exact: true }).selectOption('1');
  await page.getByLabel('Chapter', { exact: true }).selectOption('1');
  await page.getByLabel('Judul audio', { exact: true }).fill('Tetap di editor');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByLabel('Chapter', { exact: true }).selectOption('2');
  await expect(page.getByLabel('Chapter', { exact: true })).toHaveValue('1');
  await expect(page.getByLabel('Judul audio', { exact: true })).toHaveValue('Tetap di editor');
  await page.getByLabel('Upload audio', { exact: true }).setInputFiles({ name: 'test.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('audio') });
  await expect(page.getByRole('button', { name: 'Menyimpan...', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Chapter', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Simpan & Publish Audio', exact: true })).toBeDisabled();
  expect(writes).toBe(0);
  finishUpload();
  await expect(page.getByLabel('URL audio', { exact: true })).toHaveValue('audio/new.mp3');
  await expect(page.getByLabel('Judul audio', { exact: true })).toHaveValue('Tetap di editor');
});
