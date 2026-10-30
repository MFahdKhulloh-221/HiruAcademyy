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
    const measurements=[];
    for (const [width,height] of [[1440,900],[768,1024],[390,844],[360,800]]) {
      await page.setViewportSize({width,height});
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.locator('img').evaluateAll(images=>Promise.all(images.map(img=>img.decode().catch(()=>{}))));
      const sizes=await page.locator('fieldset').evaluate(el=>{
        const rows=[]; for(let n=el;n;n=n.parentElement){const s=getComputedStyle(n),r=n.getBoundingClientRect();rows.push({tag:n.tagName,selector:n.className,width:r.width,display:s.display,columns:s.gridTemplateColumns,maxWidth:s.maxWidth,overflow:s.overflow});}
        return {parents:rows,children:[...el.children].map(n=>({selector:n.className,width:n.getBoundingClientRect().width})),preview:el.querySelector('[class*="desktopPreview"]').getBoundingClientRect().width,overflow:document.documentElement.scrollWidth>innerWidth};
      });
      measurements.push({width,height,...sizes});
      assert.equal(sizes.overflow,false);
      if (process.env.QA_PHASE === 'after') {
        const geometry=await page.locator('[class*="desktopPreview"]').evaluate(el=>{const frame=el.parentElement.getBoundingClientRect(),banner=el.querySelector('section>div').getBoundingClientRect();return {frame:frame.width,width:banner.width,height:banner.height,scroll:el.parentElement.scrollWidth>el.parentElement.clientWidth+1};});
        assert(Math.abs(geometry.width/geometry.height-3)<.02);
        assert(Math.abs(geometry.frame-geometry.width)<1);
        assert.equal(geometry.scroll,false);
      }
      await page.screenshot({path:path.join(output,`layout-${process.env.QA_PHASE||'before'}-${width}.png`),fullPage:true});
      if(process.env.QA_PHASE==='after') {
        await page.getByRole('button',{name:'Mobile',exact:true}).click();
        await page.screenshot({path:path.join(output,`layout-mobile-preview-${width}.png`),fullPage:true});
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await page.getByRole('button',{name:'Desktop',exact:true}).click();
      }
    }
    fs.writeFileSync(path.join(output,`layout-${process.env.QA_PHASE||'before'}.json`),JSON.stringify(measurements,null,2));
    console.log(JSON.stringify(measurements[0],null,2));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});