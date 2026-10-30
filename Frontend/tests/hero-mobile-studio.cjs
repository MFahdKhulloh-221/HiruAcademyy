// UI-only QA with isolated API responses. Does not prove backend persistence.
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const output = path.resolve('../test-results/hero-mobile-studio'); fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  console.log('Browser ready');
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
    page.setDefaultTimeout(15000);
    await page.goto('http://127.0.0.1:3000/admin/landing-page', { waitUntil: 'domcontentloaded', timeout: 20000 });
    const { expect } = require('@playwright/test');
    const results=[];
    for(const [width,height] of [[360,800],[390,844],[768,1024],[1440,900]]) {
      console.log('QA viewport',width);
      await page.setViewportSize({width,height});
      await page.getByRole('tab',{name:'Isi banner',exact:true}).click();
      await page.getByLabel('Judul pada banner',{exact:true}).fill('Judul QA '+width);
      await page.getByLabel('Penjelasan di bawah judul').fill('Deskripsi QA');
      const preview=page.locator('[class*=previewPanel]');
      const before=await preview.boundingBox();
      await page.getByRole('tab',{name:'Tombol',exact:true}).click();
      await page.getByLabel('Tulisan tombol utama',{exact:true}).fill('Mulai QA');
      await expect(page.locator('article[aria-hidden=false]').getByRole('link',{name:'Mulai QA'})).toBeAttached();
      const after=await preview.boundingBox();
      assert.equal(before.y,after.y);
      await page.getByRole('tab',{name:'Tampilan',exact:true}).click();
      await page.getByLabel('Ganti banner otomatis',{exact:true}).check();
      await page.getByRole('tab',{name:'Isi banner',exact:true}).click();
      await page.locator('input[type=file]').first().setInputFiles(path.resolve('../assets/dashboard.png'));
      await expect(page.getByRole('status').filter({hasText:'berhasil diunggah'})).toBeVisible();
      await page.getByRole('button',{name:'Hapus gambar komputer',exact:true}).click();
      await expect(page.getByText('Unggah gambar komputer untuk melihat contoh tampilan.')).toBeVisible();
      await page.locator('input[type=file]').first().setInputFiles(path.resolve('../assets/dashboard.png'));
      await page.getByRole('button',{name:'Simpan perubahan',exact:true}).click();
      await expect(page.getByRole('button',{name:'Tampilkan di halaman utama',exact:true})).toBeEnabled();
      await page.getByRole('button',{name:'Mobile',exact:true}).click();
      if(width<1024){
        await page.getByRole('button',{name:'Perbesar contoh tampilan'}).click();
        await page.screenshot({path:path.join(output,`expanded-${width}.png`)});
        await page.getByRole('button',{name:'Perkecil contoh tampilan'}).click();
      }
      await page.getByLabel('Judul pada banner',{exact:true}).fill('Judul akhir '+width);
      const geometry=await page.evaluate(()=>{
        const form=document.querySelector('[role=tabpanel]'),preview=document.querySelector('[class*=previewPanel]'),bar=document.querySelector('footer[class*=actions]');
        return {width:innerWidth,horizontal:document.documentElement.scrollWidth>innerWidth,vertical:document.documentElement.scrollHeight>innerHeight+1,formScroll:form.scrollHeight>form.clientHeight,previewBottom:preview.getBoundingClientRect().bottom,actionBottom:bar.getBoundingClientRect().bottom};
      });
      assert.equal(geometry.horizontal,false);assert.equal(geometry.vertical,false);assert(geometry.formScroll);assert(geometry.actionBottom<=height+1);
      await page.screenshot({path:path.join(output,`studio-${width}.png`)});
      if(width<640){
        await page.setViewportSize({width,height:500});
        await page.getByLabel('Judul pada banner',{exact:true}).focus();
        await expect(page.getByRole('button',{name:'Simpan perubahan',exact:true})).toBeInViewport();
        await expect(preview).toBeInViewport();
        await page.screenshot({path:path.join(output,`keyboard-resize-${width}.png`)});
        console.log('QA viewport',width);
      await page.setViewportSize({width,height});
      }
      await page.getByRole('button',{name:'Desktop',exact:true}).click();
      results.push(geometry);
    }
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));console.log(results);
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
