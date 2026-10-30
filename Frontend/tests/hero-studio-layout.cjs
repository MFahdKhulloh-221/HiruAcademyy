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
    for(const [width,height] of [[1440,900],[768,1024],[390,844],[360,800]]){
      await page.setViewportSize({width,height});
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      await page.getByRole('tab',{name:'Konten',exact:true}).click();
      await page.getByLabel('Headline overlay',{exact:true}).fill('Headline studio '+width);
      await page.getByLabel('Deskripsi overlay',{exact:true}).fill('Deskripsi studio '+width);
      const preview=page.getByRole('heading',{name:'Live Preview Banner'}).locator('..').locator('..').locator('..');
      await page.getByRole('tab',{name:'Tombol CTA',exact:true}).click();
      await page.getByLabel('Label tombol utama',{exact:true}).fill('CTA studio '+width);
      await page.locator('section[aria-label="Promosi Hiru Academy"]').getByRole('link',{name:'CTA studio '+width,exact:false,includeHidden:true}).waitFor({state:'attached'});
      const slider=page.getByRole('slider',{name:/Geser tombol kiri\/kanan \(komputer\)/});
      const textBefore=await page.locator('article[aria-hidden=false] h1').boundingBox();
      await slider.fill('100');
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      const buttons=await page.locator('article[aria-hidden=false] a').evaluateAll(links=>links.map(el=>{const r=el.getBoundingClientRect(),b=el.closest('section').getBoundingClientRect();return {left:r.left,right:r.right,min:b.left,max:b.right};}));
      console.log(width,buttons,await page.locator('article[aria-hidden=false] a').first().evaluate(el=>{const a=el.parentElement,b=a.closest('section');return {left:a.style.left,box:a.getBoundingClientRect().toJSON(),bw:b.clientWidth,bo:b.offsetWidth,css:getComputedStyle(a).width,zoom:getComputedStyle(b.parentElement).zoom};}));for(const b of buttons){assert(b.left>=b.min-1);assert(b.right<=b.max+1);}
      const textAfter=await page.locator('article[aria-hidden=false] h1').boundingBox();assert.equal(textBefore.x,textAfter.x);
      await slider.fill('0');
      const geometry=await page.evaluate(()=>{const p=document.querySelector('[role=tabpanel]'),a=document.querySelector('footer[class*=actions]'),r=a.getBoundingClientRect(),h=document.querySelector('[class*=previewPanel]').getBoundingClientRect();return {width:innerWidth,pageScrollY:scrollY,horizontal:document.documentElement.scrollWidth>innerWidth,vertical:document.documentElement.scrollHeight>innerHeight+1,editorScrollable:p.scrollHeight>p.clientHeight,actionBottom:r.bottom,previewTop:h.top,previewBottom:h.bottom};});
      assert.equal(geometry.horizontal,false);assert.equal(geometry.vertical,false);assert.equal(geometry.pageScrollY,0);assert(geometry.actionBottom<=height+1);assert(geometry.previewBottom<=height);
      await page.screenshot({path:path.join(output,`studio-after-${width}.png`)});
      await page.getByRole('tab',{name:'Konten',exact:true}).click();
      await page.getByLabel('Headline overlay',{exact:true}).fill('Headline studio '+width);
      await page.locator('section[aria-label="Promosi Hiru Academy"]').getByRole('heading',{name:'Headline studio '+width,exact:true,includeHidden:true}).waitFor({state:'attached'});
      await page.getByRole('tab',{name:'Tampilan',exact:true}).click();await page.getByLabel('Jeda pergantian banner (detik)',{exact:true}).waitFor();
      await page.getByRole('combobox',{name:/Posisi tulisan & tombol di komputer/}).selectOption('right');
      const content=page.locator('section[aria-label="Promosi Hiru Academy"]').locator('[data-desktop-position]');
      assert.equal(await content.evaluate(el=>getComputedStyle(el).justifyContent),'flex-end');
      await page.getByRole('combobox',{name:/Posisi tulisan & tombol di komputer/}).selectOption('left');
      if(width<1024){await page.getByRole('button',{name:'Perbesar preview',exact:true}).click();await page.getByRole('button',{name:'Ringkas preview',exact:true}).click();}
      measurements.push(geometry);
    }
    fs.writeFileSync(path.join(output,'studio-layout-results.json'),JSON.stringify(measurements,null,2));console.log(measurements);
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
