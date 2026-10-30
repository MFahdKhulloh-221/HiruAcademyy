// Real Laravel + isolated PostgreSQL schema. No API stubs. Run with QA servers on 3020/8001.
const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
 const out=path.resolve('../test-results/hero-real-api-2b1');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',args:['--disable-gpu','--disable-extensions']});
 const results=[];let baseline;let admin;
 const origin='http://localhost:3020',api='http://localhost:8001';
 const mark=(name)=>{results.push({name,status:'PASS'});console.log('PASS',name)};
 try{
  const context=await browser.newContext({locale:'id-ID',timezoneId:'Asia/Jakarta'});
  // Safety guard only: real local requests continue; external access is blocked, never stubbed.
  await context.route('**/*',r=>{const u=new URL(r.request().url());return ['localhost','127.0.0.1'].includes(u.hostname)?r.continue():r.abort()});
  admin=await context.newPage();await admin.goto(origin+'/login');
  const request=async(method,url,data)=>admin.evaluate(async({method,url,data})=>{
   const token=document.cookie.split('; ').find(x=>x.startsWith('XSRF-TOKEN='))?.split('=').slice(1).join('=');
   const response=await fetch(url,{method,credentials:'include',headers:{Accept:'application/json','Content-Type':'application/json',...(token?{'X-XSRF-TOKEN':decodeURIComponent(token)}:{})},...(data?{body:JSON.stringify(data)}:{})});return {status:response.status,body:await response.json().catch(()=>null)};
  },{method,url:api+url,data});
  await admin.evaluate(api=>fetch(api+'/sanctum/csrf-cookie',{credentials:'include'}),api);
  const password=fs.readFileSync(process.env.HIRU_HERO_QA_PASSWORD_FILE,'utf8');
  const login=await request('POST','/api/auth/login',{identity:'hero.qa@example.test',password});assert.equal(login.status,200,JSON.stringify(login));assert.equal(login.body.data.role,'admin');
  baseline=await request('GET','/api/admin/landing/hero');assert.equal(baseline.status,200);fs.writeFileSync(path.join(out,'baseline.json'),JSON.stringify(baseline.body,null,2));
  assert.equal(baseline.body.data.published,null);assert.equal(baseline.body.data.draft,null);
  const visitorContext=await browser.newContext({locale:'id-ID',timezoneId:'Asia/Jakarta',hasTouch:true});
  await visitorContext.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
  const visitor=await visitorContext.newPage();await visitor.goto(origin);
  const publicHero=visitor.getByRole('region',{name:'Promosi Hiru Academy'});
  await expect(publicHero.locator('img').first()).toHaveAttribute('src','/banners/hiru-hero-desktop.png');mark('Fallback Batch 1, empty Published');
  await admin.goto(origin+'/admin/landing-page');await admin.getByRole('button',{name:'+ Tambah Slide',exact:true}).waitFor();
  const upload=async(n,file)=>{const response=admin.waitForResponse(r=>r.url()===api+'/api/admin/media'&&r.request().method()==='POST');await admin.locator('input[type=file]').nth(n).setInputFiles(file);const res=await response;assert.equal(res.status(),201,await res.text());await admin.getByText(/berhasil diunggah/).waitFor();return (await res.json()).data};
  const desktop=await upload(0,path.resolve('public/banners/hiru-hero-desktop.png'));
  await admin.getByLabel('Judul internal (untuk Admin)',{exact:true}).fill('QA slide satu');
  await admin.getByRole('button',{name:'+ Tambah Slide',exact:true}).click();
  await admin.getByLabel('Judul internal (untuk Admin)',{exact:true}).fill('QA slide dua');
  const second=await upload(0,path.resolve('../assets/dashboard.png'));
  await upload(1,path.resolve('../assets/flashcard.png'));
  await admin.getByLabel('Headline overlay',{exact:true}).fill('Headline QA kedua');
  await admin.getByLabel('Deskripsi overlay',{exact:true}).fill('Deskripsi tersimpan PostgreSQL lokal.');
  await admin.getByLabel('Label tombol utama',{exact:true}).fill('QA Daftar');
  await admin.getByLabel('URL tujuan utama',{exact:true}).fill('/register');
  await admin.getByLabel('Label tombol sekunder',{exact:true}).fill('QA Program');
  await admin.getByLabel('URL tujuan sekunder',{exact:true}).fill('/program');
  await admin.getByLabel('Tampilkan tulisan overlay',{exact:true}).uncheck();
  await admin.getByLabel('Slide aktif',{exact:true}).check();
  await admin.locator('select').nth(0).selectOption('center');await admin.locator('select').nth(1).selectOption('right');
  await admin.getByRole('button',{name:'Mobile',exact:true}).click();await expect(admin.getByRole('region',{name:'Promosi Hiru Academy'}).locator('img').nth(1)).toHaveAttribute('src',/media\/image/);await admin.getByRole('button',{name:'Desktop',exact:true}).click();
  await admin.getByRole('button',{name:'Duplikat',exact:true}).click();
  admin.once('dialog',dialog=>dialog.dismiss());await admin.getByRole('button',{name:'Hapus',exact:true}).click();
  assert.equal(await admin.getByRole('button',{name:/Slide 3 · Nonaktif/}).count(),1);
  admin.once('dialog',dialog=>dialog.accept());await admin.getByRole('button',{name:'Hapus',exact:true}).click();
  await admin.getByRole('button',{name:'Naik',exact:true}).click();await admin.getByRole('button',{name:'Turun',exact:true}).click();
  await admin.getByLabel('Slide aktif',{exact:true}).uncheck();await admin.getByLabel('Slide aktif',{exact:true}).check();
  await admin.getByRole('button',{name:'Simpan Draft',exact:true}).click();await admin.getByText('Draft Hero berhasil disimpan.',{exact:true}).waitFor();
  let state=(await request('GET','/api/admin/landing/hero')).body.data;assert.equal(state.draft.slider.slides.length,2);assert.equal(state.draft.slider.slides[1].internalTitle,'QA slide dua');assert(state.draft.slider.slides[1].active);assert.equal(state.published,null);
  await admin.reload();await admin.getByRole('button',{name:/QA slide dua/}).waitFor();
  await visitor.reload();await expect(publicHero.locator('img').first()).toHaveAttribute('src','/banners/hiru-hero-desktop.png');mark('CRUD, desktop/mobile upload, content, reload Draft, no Draft leak');
  const deletion=await request('DELETE','/api/admin/media',{path:desktop.path});assert.equal(deletion.status,409);mark('Referenced media deletion rejected 409');
  const invalid=await admin.evaluate(async api=>{const token=decodeURIComponent(document.cookie.split('; ').find(x=>x.startsWith('XSRF-TOKEN=')).split('=')[1]);const body=new FormData();body.append('kind','image');body.append('file',new File(['not an image'],'spoof.png',{type:'image/png'}));const r=await fetch(api+'/api/admin/media',{method:'POST',credentials:'include',headers:{Accept:'application/json','X-XSRF-TOKEN':token},body});return r.status},api);assert.equal(invalid,422);mark('Real spoofed image rejected 422');
  await admin.getByRole('button',{name:'Publikasikan',exact:true}).click();await admin.getByText('Hero berhasil dipublikasikan.',{exact:true}).waitFor();
  await visitor.reload();await publicHero.getByRole('button',{name:'Slide berikutnya',exact:true}).waitFor();
  const published=(await request('GET','/api/public/landing/hero')).body.data;assert.equal(published.slider.slides.length,2);assert.notEqual(published.slider.slides[0].desktopSrc,published.slider.slides[1].desktopSrc);mark('Real publish, separate visitor, two different images');
  for(const [width,height] of [[1440,900],[768,1024],[390,844],[360,800]]){await admin.setViewportSize({width,height});await admin.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await admin.screenshot({path:path.join(out,`builder-${width}.png`),fullPage:true});}
  for(const [width,height] of [[1440,900],[390,844]]){await visitor.setViewportSize({width,height});await publicHero.locator('img').evaluateAll(images=>Promise.all(images.map(i=>i.decode())));assert(await visitor.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await visitor.screenshot({path:path.join(out,`homepage-${width}.png`)});}
  await publicHero.getByRole('button',{name:'Tampilkan slide 2',exact:true}).click();await expect(publicHero.locator('article[aria-hidden=false]')).toHaveAttribute('aria-label',/Headline QA kedua/);await visitor.screenshot({path:path.join(out,'homepage-slide-2.png')});
  await publicHero.getByRole('link',{name:'QA Daftar',exact:false}).click();await visitor.waitForURL(origin+'/register');await visitor.goto(origin);
  await publicHero.getByRole('button',{name:'Slide berikutnya',exact:true}).click();await publicHero.getByRole('link',{name:'QA Program',exact:false}).click();await visitor.waitForURL(origin+'/program');mark('Dots, next, second-slide CTA routes');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
 }catch(error){results.push({name:'execution',status:'FAIL',error:error.message});fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));if(admin)await admin.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});throw error;
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
