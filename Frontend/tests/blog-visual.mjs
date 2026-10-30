import { spawn } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import path from "node:path";

const output = process.env.BLOG_QA_OUTPUT;
assert(output, "Set BLOG_QA_OUTPUT outside production source.");
const env = await readFile(".env.local", "utf8");
const line = env.split(/\r?\n/).find(value => value.startsWith("NEXT_PUBLIC_API_URL="));
assert(line, "Local API URL required.");
const api = line.slice(line.indexOf("=") + 1).replace(/^["']|["']$/g, "");
assert(["localhost", "127.0.0.1", "[::1]"].includes(new URL(api).hostname), "Local API only.");
const response = await fetch(`${api}/api/blog`, { signal: AbortSignal.timeout(4000) });
assert(response.ok, "Local backend unavailable.");
const { data: articles } = await response.json();
assert(articles.length, "Local article required.");
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3413"], {
  env: { ...process.env, HIRU_PLAYWRIGHT_PORT: "3411", API_INTERNAL_URL: api }, stdio: "ignore",
});
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { ready = (await fetch("http://127.0.0.1:3413/robots.txt")).ok; } catch { /* Wait for local server readiness. */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert(ready, "Production server did not start.");
  browser = await chromium.launch({ channel: "chromium", args: ["--disable-gpu", "--disable-dev-shm-usage", "--no-sandbox"] });
  await mkdir(output, { recursive: true });
  const report = [];
  for (const [width, height] of [[1440, 900], [768, 1024], [390, 844]]) {
    const context = await browser.newContext({ viewport: { width, height }, locale: "id-ID", timezoneId: "Asia/Jakarta", reducedMotion: "reduce" });
    await context.addInitScript(() => {
      window.qaShift = 0;
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.qaShift += entry.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    for (const [name, route] of [["catalog", "/blog"], ["detail", `/blog/${articles[0].slug}`]]) {
      const result = await page.goto(`http://127.0.0.1:3413${route}`);
      assert.equal(result.status(), 200);
      await page.evaluate(() => document.fonts.ready);
      // Load lazy thumbnails before measuring final screenshot and broken images.
      await page.evaluate(async () => {
        for (const image of document.querySelectorAll("main img")) {
          image.loading = "eager";
          try { await image.decode(); } catch { /* Broken image checked below. */ }
        }
      });
      await page.screenshot({ path: path.join(output, `${name}-${width}-full.png`), fullPage: true });
      await page.screenshot({ path: path.join(output, `${name}-${width}-viewport.png`) });
      const metrics = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        shift: window.qaShift,
        broken: [...document.querySelectorAll("main img")].filter(image => !image.complete || !image.naturalWidth).map(image => image.src),
        columns: getComputedStyle(document.querySelector(".editorial-grid") ?? document.querySelector(".editorial-reader-layout")).gridTemplateColumns,
        sidebar: document.querySelector(".editorial-sidebar") ? getComputedStyle(document.querySelector(".editorial-sidebar")).position : null,
        smallTargets: [...document.querySelectorAll("main button, main input, main .editorial-read")].filter(element => element.getBoundingClientRect().height < 44).map(element => element.textContent),
      }));
      assert.equal(metrics.overflow, false, `${name} overflow ${width}`);
      assert.deepEqual(metrics.broken, [], `${name} broken images ${width}`);
      assert.deepEqual(metrics.smallTargets, [], `${name} small targets ${width}`);
      assert.deepEqual(errors, [], "Runtime errors");
      if (name === "catalog") {
        const search = page.getByRole("searchbox");
        await search.focus();
        await page.keyboard.press("Tab");
        const focus = await page.evaluate(() => { const style = getComputedStyle(document.activeElement); return { width: style.outlineWidth, style: style.outlineStyle }; });
        assert.notEqual(focus.style, "none", "Keyboard focus invisible");
        assert.notEqual(focus.width, "0px", "Keyboard focus missing");
      }
      report.push({ width, height, name, route, ...metrics });
    }
    await context.close();
  }
  await writeFile(path.join(output, "metrics.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  server.kill();
}
