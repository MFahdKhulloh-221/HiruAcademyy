// UI-only QA with isolated API responses. Does not prove backend persistence.
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const output = path.resolve('../test-results/hero-builder-batch2'); fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', args: ['--disable-gpu', '--disable-extensions'] });
  try {
    const context = await browser.newContext({ locale: 'id-ID', timezoneId: 'Asia/Jakarta', reducedMotion: 'reduce' });
    await context.addCookies([{ name: 'XSRF-TOKEN', value: 'testing', url: 'http://127.0.0.1:3000' }]);
    let state = { draft: null, published: null, revision: 0 };

    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/storage/media/image/11111111-1111-4111-8111-111111111111.png' || url.pathname === '/qa-second-banner.png') return route.fulfill({ contentType: 'image/png', body: fs.readFileSync(path.resolve('../assets/dashboard.png')) });
      if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/sanctum/')) {
        if (url.hostname === '127.0.0.1' && url.port === '3000') return route.continue();
        return route.abort();
      }
      if (url.pathname === '/api/admin/media') return route.fulfill({ status: 201, json: { data: { path: 'media/image/11111111-1111-4111-8111-111111111111.png', url: 'http://127.0.0.1:3000/qa-second-banner.png', mime_type: 'image/png' } } });
      if (url.pathname === '/api/me') return route.fulfill({ json: { data: { id: 901, role: 'admin', name: 'QA Admin', email: 'qa@example.test', whatsapp: '628123456789', account_status: 'active' } } });
      if (url.pathname === '/sanctum/csrf-cookie') return route.fulfill({ status: 204, headers: { 'set-cookie': 'XSRF-TOKEN=testing; Path=/' } });
      if (url.pathname === '/api/public/landing/hero') return route.fulfill({ json: { data: state.published } });
      if (url.pathname.startsWith('/api/admin/landing/hero')) {
        if (route.request().method() !== 'GET') {
          const body = route.request().postDataJSON(); assert.equal(body.revision, state.revision);
          if (url.pathname.endsWith('/draft')) state.draft = body.hero;
          else state.published = structuredClone(state.draft);
          state.revision++;
        }
        return route.fulfill({ json: { data: state } });
      }
      return route.fulfill({ json: { data: [] } });
    });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:3000/admin/landing-page');
    await page.getByRole('button', { name: '+ Tambah Slide', exact: true }).waitFor();
    for (const [width, height] of [[1440,900],[768,1024],[390,844],[360,800]]) {
      await page.setViewportSize({ width, height });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.join(output, `builder-${width}.png`), fullPage: true });
    }
    await page.getByRole('button', { name: 'Duplikat', exact: true }).click();
    await page.getByLabel('Judul internal (untuk Admin)', { exact: true }).fill('Slide QA kedua');
    await page.getByLabel('Headline overlay', { exact: true }).fill('Slide QA kedua');
    await page.locator('input[type=file]').first().setInputFiles(path.resolve('../assets/dashboard.png'));
    await Promise.race([page.getByText(/berhasil diunggah/).waitFor(), page.getByRole('alert').waitFor().then(async () => { throw new Error(await page.getByRole('alert').allTextContents()); })]);
    await page.getByLabel('Tampilkan tulisan overlay', { exact: true }).uncheck();
    await page.getByLabel('Slide aktif', { exact: true }).check();
    await page.getByRole('button', { name: 'Simpan Draft', exact: true }).click();
    await page.getByText('Draft Hero berhasil disimpan.', { exact: true }).waitFor();
    assert.equal(state.published, null);
    await page.reload(); await page.getByRole('button', { name: 'Publikasikan', exact: true }).click();
    await page.getByText('Hero berhasil dipublikasikan.', { exact: true }).waitFor();
    assert.equal(state.published.slider.slides.length, 2);
    await page.goto('http://127.0.0.1:3000');
    const hero = page.getByRole('region', { name: 'Promosi Hiru Academy' });
    await hero.getByRole('button', { name: 'Slide berikutnya', exact: true }).waitFor();
    for (const [width,height] of [[1440,900],[768,1024],[390,844],[360,800]]) {
      await page.setViewportSize({ width,height });
      await hero.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.join(output, `homepage-two-slides-${width}.png`) });
    }
    await hero.getByRole('button', { name: 'Slide berikutnya', exact: true }).click();
    await hero.locator('article[aria-hidden="false"]').filter({ has: page.locator('img[src*="11111111-1111"]') }).waitFor();
    await page.screenshot({ path: path.join(output, 'homepage-slide-2.png') });
    console.log('PASS UI fixture checks. Backend persistence tested separately. Screenshots:', output);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
