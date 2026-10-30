// UI regression only: hold Published response to reproduce fallback flash deterministically.
const {chromium,expect}=require('@playwright/test');
(async()=>{
 const browser=await chromium.launch({channel:'chrome'});
 try{
  const context=await browser.newContext();
  let release;const gate=new Promise(r=>release=r);
  const snapshot=require('../../test-results/hero-real-api-2b1/persisted-snapshot.json');
  const hero=structuredClone(snapshot.draft);hero.slider.slides=hero.slider.slides.slice(0,1);
  Object.assign(hero.slider.slides[0],{title:'Headline Orange',showOverlay:true,titleHighlights:[{start:9,end:15}],desktopSrc:'/banners/hiru-hero-desktop.png',mobileSrc:''});
  await context.route('**/api/public/landing/hero',async r=>{await gate;await r.fulfill({json:{data:hero}});});
  const page=await context.newPage();
  await page.goto('http://127.0.0.1:3000',{waitUntil:'domcontentloaded'});
  const banner=page.getByRole('region',{name:'Promosi Hiru Academy'});
  await expect(banner).toHaveAttribute('aria-busy','true');
  await expect(banner.locator('h1')).toHaveCount(0);
  await expect(banner.locator('article')).toHaveCount(0);
  await expect(banner.getByRole('status',{name:'Memuat banner'})).toBeVisible();
  await expect(page.getByText('Memuat banner…',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('complementary',{name:'Pencapaian HIRU Academy'})).toHaveCount(0);
  release();
  await expect(banner.getByRole('heading')).toHaveText('Headline Orange');
  await expect(banner.getByRole('heading').getByText('Orange',{exact:true})).toHaveCSS('color','rgb(244, 130, 32)');
  await expect(page.locator('section[aria-label="Promosi Hiru Academy"]')).toHaveCount(1);
  await expect(page.getByRole('complementary',{name:'Pencapaian HIRU Academy'})).toBeVisible();
  console.log('PASS: no default headline before Published; one banner; Published orange rendered.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
