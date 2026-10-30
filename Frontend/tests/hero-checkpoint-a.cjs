// Checkpoint A only. Real local Laravel/PostgreSQL, no response stubs.
const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const out = path.resolve('../test-results/hero-real-api-2b1');
const results = { checkpoint: 'A', started: new Date().toISOString(), mode: 'real Laravel + PostgreSQL', operations: [], requests: [], screenshots: [], restored: false };
const write = () => fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
async function step(name, action) {
  console.log('START', name); const started = Date.now();
  try { const value = await action(); results.operations.push({ name, status: 'PASS', ms: Date.now()-started }); write(); console.log('DONE', name); return value; }
  catch(error) { results.operations.push({ name, status:'FAIL', ms:Date.now()-started, error:error.message }); write(); throw error; }
}
(async () => {
 let browser;
 try {
  browser = await chromium.launch({ channel:'chrome', args:['--disable-gpu','--disable-extensions'], timeout:15000 });
  const adminContext = await browser.newContext({ locale:'id-ID', timezoneId:'Asia/Jakarta', reducedMotion:'reduce' });
  const visitorContext = await browser.newContext({ locale:'id-ID', timezoneId:'Asia/Jakarta', reducedMotion:'reduce' });
  for(const context of [adminContext, visitorContext]) {
   context.setDefaultTimeout(12000); context.setDefaultNavigationTimeout(20000);
   await context.route('**/*',route => ['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
   context.on('response', response => { if(response.url().includes(':8001/')) results.requests.push({url:response.url(),status:response.status(),method:response.request().method()}); });
  }
  const admin = await adminContext.newPage();
  await step('Open local login',()=>admin.goto('http://localhost:3020/login',{waitUntil:'domcontentloaded'}));
  const api = (method, url, data) => admin.evaluate(async ({method,url,data}) => {
   const token = document.cookie.split('; ').find(x=>x.startsWith('XSRF-TOKEN='))?.slice(11);
   const r = await fetch('http://localhost:8001'+url, {method,credentials:'include',signal:AbortSignal.timeout(12000),headers:{Accept:'application/json','Content-Type':'application/json',...(token?{'X-XSRF-TOKEN':decodeURIComponent(token)}:{})},...(data?{body:JSON.stringify(data)}:{})});
   const body = await r.json().catch(()=>null); if(!r.ok) throw Error(`${r.status}: ${JSON.stringify(body)}`); return body;
  },{method,url,data});
  await step('Real CSRF',()=>admin.evaluate(()=>fetch('http://localhost:8001/sanctum/csrf-cookie',{credentials:'include',signal:AbortSignal.timeout(12000)}).then(r=>{if(!r.ok)throw Error(r.status)})));
  await step('Real admin login',()=>api('POST','/api/auth/login',{identity:'hero.qa@example.test',password:fs.readFileSync(process.env.HIRU_HERO_QA_PASSWORD_FILE,'utf8')}));
  const baseline = await step('Record empty QA baseline',()=>api('GET','/api/admin/landing/hero'));
  assert.equal(baseline.data.draft,null); assert.equal(baseline.data.published,null);
  fs.writeFileSync(path.join(out,'baseline-checkpoint-a.json'),JSON.stringify(baseline,null,2));
  const snapshot = JSON.parse(fs.readFileSync(path.join(out,'persisted-snapshot.json'),'utf8'));
  const saved = await step('Restore prior QA draft through real API',()=>api('PATCH','/api/admin/landing/hero/draft',{revision:baseline.data.revision,hero:snapshot.draft}));
  await step('Publish prior QA slides through real API',()=>api('POST','/api/admin/landing/hero/publish',{revision:saved.data.revision}));
  await step('Open Builder',()=>admin.goto('http://localhost:3020/admin/landing-page',{waitUntil:'domcontentloaded'}));
  await admin.getByRole('button',{name:'+ Tambah Slide',exact:true}).waitFor();
  for(const [width,height] of [[1440,900],[768,1024],[390,844],[360,800]]) {
   await step(`Builder ${width} viewport`,()=>admin.setViewportSize({width,height}));
   await admin.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   assert(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await step(`Builder ${width} visible images ready`,()=>expect.poll(()=>admin.locator('img').evaluateAll(images=>images.filter(i=>i.getBoundingClientRect().width>0&&i.getBoundingClientRect().height>0&&getComputedStyle(i).display!=='none').every(i=>i.complete&&i.naturalWidth>0)),{timeout:12000}).toBe(true));
   await step(`Builder ${width} screenshot`,()=>admin.screenshot({path:path.join(out,`checkpoint-a-builder-${width}.png`),fullPage:true,timeout:15000}));
   results.screenshots.push(`checkpoint-a-builder-${width}.png`);
  }
  const visitor = await visitorContext.newPage();
  await step('Separate visitor homepage',()=>visitor.goto('http://localhost:3020',{waitUntil:'domcontentloaded'}));
  const hero=visitor.getByRole('region',{name:'Promosi Hiru Academy'});
  await hero.getByRole('button',{name:'Slide berikutnya',exact:true}).waitFor();
  results.imageReadiness = await hero.locator('img').evaluateAll(images=>images.map(i=>({src:i.currentSrc||i.src,loading:i.loading,complete:i.complete,naturalWidth:i.naturalWidth,display:getComputedStyle(i).display,visible:i.getBoundingClientRect().width>0})));
  write();
  // Diagnose original all-image decode with bounded promise; hidden lazy images need not load.
  results.originalDecodeProbe = await step('Bounded original decode probe',()=>hero.locator('img').evaluateAll(images=>Promise.race([Promise.all(images.map(i=>i.decode())).then(()=> 'resolved').catch(e=>e.message),new Promise(r=>setTimeout(()=>r('timeout after 3000ms'),3000))])));
  for(const [width,height] of [[1440,900],[390,844]]) {
   await step(`Homepage ${width} viewport`,()=>visitor.setViewportSize({width,height}));
   for(const slide of [1,2]) {
    const dot = hero.getByRole('button',{name:`Tampilkan slide ${slide}`,exact:true});
    await step(`Homepage ${width} slide ${slide} unobstructed control`,async()=>{
     await expect.poll(()=>dot.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),{timeout:12000}).toBe(true);
     results.requests.push({check:'control geometry',width,slide,...await dot.evaluate(el=>{const r=el.getBoundingClientRect(),proof=document.querySelector('.proof-strip').getBoundingClientRect();return {dotTop:r.top,dotBottom:r.bottom,proofTop:proof.top};})});
    });
    await step(`Homepage ${width} select slide ${slide}`,()=>dot.click());
    const article=hero.locator('article[aria-hidden=false]');
    await expect(article).toHaveAttribute('aria-label',new RegExp(`^${slide} dari`));
    await step(`Homepage ${width} slide ${slide} visible images ready`,()=>expect.poll(()=>article.locator('img').evaluateAll(images=>images.filter(i=>getComputedStyle(i).display!=='none').every(i=>i.complete&&i.naturalWidth>0)),{timeout:12000}).toBe(true));
    assert(await visitor.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    results.requests.push({check:'visible media',width,slide,images:await article.locator('img').evaluateAll(images=>images.filter(i=>getComputedStyle(i).display!=='none').map(i=>({src:i.src,width:i.naturalWidth,height:i.naturalHeight,fit:getComputedStyle(i).objectFit})))});
    await step(`Homepage ${width} slide ${slide} screenshot`,()=>visitor.screenshot({path:path.join(out,`checkpoint-a-homepage-${width}-slide-${slide}.png`),timeout:15000}));
    results.screenshots.push(`checkpoint-a-homepage-${width}-slide-${slide}.png`);
   }
  }
  results.status='CAPTURED — visual inspection pending';
 } catch(error) {results.status='OPEN';results.error=error.message;console.error(error);process.exitCode=1;}
 finally {
  if(browser) await browser.close();
  const restored=spawnSync('php',['tests/hero-browser-restore.php'],{cwd:path.resolve('../Backend'),env:{...process.env,APP_ENV:'testing',DB_DATABASE:'hiru_academy_test',DB_URL:'',HIRU_TEST_SCHEMA:'hiru_browser_test_hero_2b1_20261030',HIRU_HERO_QA_SNAPSHOT:path.join(out,'checkpoint-a-final-snapshot.json')},encoding:'utf8',timeout:20000});
  results.restoreOutput=restored.stdout+restored.stderr;results.restored=restored.status===0;write();console.log(results.status,results.restoreOutput);
 }
})();
