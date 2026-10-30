// Run with local Next dev server: node tests/hero-banner-check.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { chromium } = require('@playwright/test');

async function main() {
  const filename = path.resolve('src/components/hero-banner-slider.tsx');
  const component = new Module(filename, module);
  component.filename = filename;
  component.paths = module.paths;
  component.require = (id) => id.endsWith('.css') ? new Proxy({}, { get: (_, key) => key }) : require(id);
  component._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, filename);
  const slide = { id: 'one', desktopSrc: '/banners/hiru-hero-desktop.png', imageAlt: 'Banner', title: 'Belajar', primaryLabel: 'Coba Gratis', primaryHref: '/register' };
  const render = (slides) => renderToStaticMarkup(React.createElement(component.exports.HeroBannerSlider, { slides }));
  assert.equal(render([]), '');
  assert(!render([slide]).includes('Slide berikutnya'));
  const multiple = render([slide, { ...slide, id: 'two' }]);
  for (const label of ['Slide sebelumnya', 'Slide berikutnya', 'Tampilkan slide 2', 'Jeda rotasi banner']) assert(multiple.includes(label));
  assert(multiple.includes('tabindex="-1"'));

  const output = path.resolve('../test-results/hero-banner-batch1');
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', args: ['--disable-gpu', '--disable-extensions'] });
  try {
    const context = await browser.newContext({ locale: 'id-ID', timezoneId: 'Asia/Jakarta', reducedMotion: 'reduce' });
    // Block every external request: visual checks must never contact production.
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.protocol === 'file:' || url.protocol === 'data:' || ['127.0.0.1', 'localhost'].includes(url.hostname) && url.port === '3000') return route.continue();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: url.pathname.endsWith('/landing/hero') ? null : [] }) });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    for (const [width, height] of [[1440, 900], [768, 1024], [390, 844], [360, 800]]) {
      await page.setViewportSize({ width, height });
      await page.goto('http://127.0.0.1:3000');
      const hero = page.getByRole('region', { name: 'Promosi Hiru Academy' });
      await hero.waitFor();
      await page.getByText('Memuat Hero…', { exact: true }).waitFor({ state: 'hidden' });
      await hero.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
      assert.equal(await hero.getByRole('button').count(), 0);
      assert.equal(await hero.getByRole('link', { name: 'Coba Gratis' }).getAttribute('href'), '/register');
      assert.equal(await hero.getByRole('link', { name: 'Lihat Program' }).getAttribute('href'), '/program');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const layout = await hero.evaluate(element => {
        const heading = element.querySelector('h1').getBoundingClientRect();
        const links = [...element.querySelectorAll('a')].map(a => a.getBoundingClientRect());
        const box = element.getBoundingClientRect();
        return { inside: heading.top >= box.top && heading.bottom <= box.bottom && links.every(a => a.bottom <= box.bottom), fit: getComputedStyle(element.querySelector('img')).objectFit };
      });
      assert(layout.inside);
      assert.equal(layout.fit, 'cover');
      await page.screenshot({ path: path.join(output, `homepage-${width}.png`) });
      await hero.screenshot({ path: path.join(output, `hero-${width}.png`) });
    }
    assert.equal(await page.locator('.hero-grid, .hero-visual, .hero-copy').count(), 0);
    for (const selector of ['.public-header', '.proof-strip', '#program', '.lms-showcase', '.landing-sensei', '.landing-testimonials', '.final-cta', '.public-footer']) assert.equal(await page.locator(selector).count(), 1, selector);
    assert(await page.evaluate(() => document.querySelector('.public-header').nextElementSibling.id === 'top'));
    for (const [name, destination] of [['Coba Gratis', '/register'], ['Lihat Program', '/program']]) {
      await page.getByRole('region', { name: 'Promosi Hiru Academy' }).getByRole('link', { name }).click();
      await page.waitForURL(`http://127.0.0.1:3000${destination}`);
      await page.goto('http://127.0.0.1:3000');
      await page.getByText('Memuat Hero…', { exact: true }).waitFor({ state: 'hidden' });
    }
    fs.writeFileSync(path.join(output, 'observations.json'), JSON.stringify({ browser: browser.version(), errors, ctaClicks: ['/register', '/program'], externalRequests: 'stubbed, no production access' }, null, 2));
    console.log('Console/network observations:', JSON.stringify(errors));
    const preview = process.env.HERO_PREVIEW;
    if (preview) {
      for (const [width, height] of [[1440, 900], [768, 1024], [390, 844], [360, 800]]) {
        await page.setViewportSize({ width, height });
        await page.goto(require('node:url').pathToFileURL(preview).href);
        await page.locator('.hero img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
        await page.locator('.hero').screenshot({ path: path.join(output, `preview-${width}.png`) });
      }
    }
  } finally { await browser.close(); }
  console.log(`Hero checks passed; screenshots: ${output}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
