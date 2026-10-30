import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('local real API preserves existing Try Out bank and create form', async ({ page, context }) => {
  test.skip(process.env.HIRU_STUDIO_LOCAL_QA !== '1', 'Explicit local session required.');
  const session = JSON.parse(readFileSync('C:/Users/Tulo/AppData/Local/Temp/opencode/studio-local-session.json', 'utf8'));
  await context.addCookies([{ name: session.name, value: session.value, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const failures: string[] = [];
  page.on('response', response => { if (response.url().includes('/api/admin/try-outs') && !response.ok()) failures.push(`${response.status()} ${response.url()}`); });
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/admin/try-out');
    await expect(page.getByRole('button', { name: 'Buka Builder', exact: true })).toHaveCount(6, { timeout: 30000 });
    await page.getByRole('searchbox', { name: 'Cari Try Out', exact: true }).fill('Demo');
    await expect(page.getByRole('button', { name: 'Buka Builder', exact: true })).toHaveCount(1);
    await page.getByRole('searchbox', { name: 'Cari Try Out', exact: true }).fill('');
    await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('Published');
    await expect(page.getByRole('button', { name: 'Buka Builder', exact: true })).toHaveCount(6);
    await page.screenshot({ path: `C:/Users/Tulo/AppData/Local/Temp/opencode/studio-real-list-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Buka Builder', exact: true }).last().click();
    await page.getByRole('tab', { name: 'Reading (Dokkai)', exact: true }).click();
    await expect(page.getByText('25 soal dalam sesi', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Pertanyaan', exact: true })).not.toBeEmpty();
    await page.goto('/admin/try-out');
    await page.getByRole('button', { name: '+ Buat Try Out', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Informasi Dasar', exact: true })).toBeVisible();
    await expect(page.getByText('Pengaturan Lanjutan', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Buat & Buka Builder', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `C:/Users/Tulo/AppData/Local/Temp/opencode/studio-real-form-${width}.png`, fullPage: true });
    await page.getByText('Pengaturan Lanjutan', { exact: true }).click();
    await page.getByRole('dialog').getByRole('combobox', { name: 'Status', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('dialog').getByRole('combobox', { name: 'Status', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Buat & Buka Builder', exact: true })).toBeInViewport();
    await page.screenshot({ path: `C:/Users/Tulo/AppData/Local/Temp/opencode/studio-real-form-advanced-${width}.png`, fullPage: true });
  }
  expect(failures).toEqual([]);
});
