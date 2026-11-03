// Focused CSS geometry regression; no API or database writes.
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const css = fs.readFileSync(path.resolve('src/components/hero-banner-slider.module.css'), 'utf8');
    for (const width of [360, 390, 768, 980, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(`<style>*{box-sizing:border-box}body{margin:0}${css}</style><section class="hero"><div class="viewport"><article class="slide active"><div class="art"></div><div class="content"><div class="copy"><p class="eyebrow">LIVE CLASS + LMS DALAM SATU ALUR BELAJAR</p><h1>Belajar Bahasa Jepang Terarah dari Dasar sampai Siap JLPT</h1><p class="description">Placement test, pembelajaran, flashcard, latihan, try out, komunitas, dan kelas bersama Sensei tersedia dalam satu pengalaman belajar yang konsisten.</p><div class="actions"><a class="primary">Coba Gratis</a><a class="secondary">Lihat Program</a></div></div></div></article></div><div class="controls"><button class="arrow previous">‹</button><div class="dots"><button class="dot dotActive"></button><button class="dot"></button></div><button class="arrow next">›</button></div></section>`);
      const geometry = await page.evaluate(() => {
        const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return {top:r.top,bottom:r.bottom,width:r.width}; };
        return {art:rect('.art'),content:rect('.content'),controls:rect('.controls'),horizontal:document.documentElement.scrollWidth>innerWidth};
      });
      assert.equal(geometry.horizontal, false);
      if (width < 768) {
        assert(geometry.art.top >= geometry.content.bottom - 1, 'image must follow content');
        assert(geometry.controls.top >= geometry.art.bottom, 'controls must not cover image');
      } else assert.equal(geometry.art.top, geometry.content.top, 'desktop layout must remain overlaid');
      console.log('PASS', width, geometry);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
