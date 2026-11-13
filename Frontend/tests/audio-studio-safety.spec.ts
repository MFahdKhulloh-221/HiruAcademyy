import { test, expect } from './canonical-fixture';

test('audio save gate rejects duplicate writes and retries only failed deletes', async ({ page }) => {
  const base = { chapter_id: 1, title: null, audio_url: null, question: 'Soal audio', options: { A: 'A', B: 'B', C: 'C', D: 'D' }, correct_option: 'A', explanation: '', sort_order: 0, status: 'draft' };
  const questions = [1, 2, 3].map(id => ({ ...base, id, sort_order: id - 1 }));
  const deleted: number[] = [];
  let patches = 0;
  let failDelete = true;
  let finishSave!: () => void;
  const saveGate = new Promise<void>(resolve => { finishSave = resolve; });
  await page.route('**/api/admin/chapters', route => route.fulfill({ json: { data: [{ id: 1, program_id: 1, title: 'Chapter satu' }] } }));
  await page.route('**/api/admin/audio-questions**', async route => {
    const method = route.request().method();
    const id = Number(new URL(route.request().url()).pathname.split('/').at(-1));
    if (method === 'PATCH') {
      patches++;
      await saveGate;
      return route.fulfill({ json: { data: { ...base, ...route.request().postDataJSON(), id } } });
    }
    if (method === 'DELETE') {
      deleted.push(id);
      if (id === 3 && failDelete) { failDelete = false; return route.fulfill({ status: 422, json: { message: 'Delete retry' } }); }
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: { data: questions } });
  });
  await page.goto('/admin/audio-question');
  await page.getByLabel('Program', { exact: true }).selectOption('1');
  await page.getByLabel('Chapter', { exact: true }).selectOption('1');
  // Nullable title/audio remain editable without inventing stricter backend requirements.
  await page.getByLabel('Judul audio', { exact: true }).fill('Judul baru');
  for (let index = 0; index < 2; index++) {
    await page.getByRole('button', { name: 'Soal Berikutnya', exact: true }).click();
    await page.getByText('Aksi soal', { exact: true }).click();
    await page.getByRole('button', { name: 'Hapus Soal', exact: true }).click();
    await page.getByRole('button', { name: 'Hapus dari Editor', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Simpan Audio', exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect.poll(() => patches).toBe(1);
  await expect(page.getByLabel('Chapter', { exact: true })).toBeDisabled();
  finishSave();
  await expect(page.getByRole('alert').filter({ hasText: 'Penyimpanan belum selesai' })).toBeVisible();
  expect(deleted).toEqual([2, 3]);
  await page.getByRole('button', { name: 'Simpan Audio', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Semua perubahan Audio tersimpan.' })).toBeVisible();
  expect(patches).toBe(1);
  expect(deleted).toEqual([2, 3, 3]);
});
