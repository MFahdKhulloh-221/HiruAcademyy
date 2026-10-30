import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
function load(path, require) {
  const context = vm.createContext({ exports: {}, require, URL, process: { env: { NEXT_PUBLIC_API_URL: "https://api.example.test" } } });
  vm.runInContext(ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  return context.exports;
}
const media = load("../src/lib/public-content-api.ts", () => ({}));
const helper = load("../src/lib/blog-thumbnail.ts", () => media);

test("brand fallback is stable and local PNG exists", () => {
  for (const slug of ["tips-belajar", "grammar", "jlpt-n4", "listening", ""]) {
    const fallback = helper.blogThumbnailFallback(slug);
    assert.equal(fallback, "/brand/hiru-atas.png");
    assert.equal(helper.blogThumbnailSource(null, slug), fallback);
    const asset = fallback.split("/").at(-1);
    const copy = readFileSync(new URL(`../public/brand/${asset}`, import.meta.url));
    assert.equal(copy.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    const original = new URL(`../../assets/${asset}`, import.meta.url);
    if (existsSync(original)) assert.deepEqual(copy, readFileSync(original));
  }
});

test("empty, unsafe and loopback sources fall back; valid images survive", () => {
  const source = value => helper.blogThumbnailSource(value, "jlpt-n4");
  const fallback = helper.blogThumbnailFallback("jlpt-n4");
  for (const value of [null, "", " ", "javascript:alert(1)", "//example.test/img.png", "https://user:pass@example.test/x.png", "http://localhost:8000/x.png", "http://foo.localhost/x.png", "http://127.0.0.2/x.png", "http://[::1]/x.png", "http://0.0.0.0/x.png"]) assert.equal(source(value), fallback);
  assert.equal(source("https://cdn.example.test/image.png"), "https://cdn.example.test/image.png");
  assert.equal(source("media/blog/image.png"), "https://api.example.test/storage/media/blog/image.png");
  assert.equal(source("/blog/tamnel1.png"), "/blog/tamnel1.png");
  assert.equal(helper.blogThumbnailSource("media/blog/image.png", "jlpt-n4", "https://cdn.example.test/signed.png?signature=123"), "https://cdn.example.test/signed.png?signature=123");
});

test("broken remote switches once to local; updated source renders again", () => {
  let failed = "";
  const component = load("../src/components/blog-thumbnail.tsx", name => name === "react" ? { useState: () => [failed, value => { failed = value; }] } : name === "react/jsx-runtime" ? { jsx: (type, props) => props } : name === "next/image" ? {} : helper).BlogThumbnail;
  const article = { slug: "jlpt-n4", title: "JLPT", thumbnail: "https://cdn.example.test/broken.png" };
  const first = component({ article });
  assert.equal(first.src, article.thumbnail);
  assert.equal(first.alt, article.title);
  first.onError();
  const second = component({ article });
  assert.equal(second.src, helper.blogThumbnailFallback(article.slug));
  assert.equal(second.onError, undefined);
  assert.equal(component({ article: { ...article, thumbnail: "https://cdn.example.test/new.png" } }).src, "https://cdn.example.test/new.png");
});

test("SSR catalog and detail retain shared thumbnail and interactive filters", () => {
  assert.match(read("../src/app/blog/page.tsx"), /<BlogThumbnail article=\{featured\}/);
  assert.match(read("../src/app/blog/[slug]/page.tsx"), /<BlogThumbnail article=\{article\}/);
  const catalog = read("../src/components/blog-catalog.tsx");
  assert.match(catalog, /<BlogThumbnail article=\{article\}/);
  assert.match(catalog, /article.category === activeCategory/);
  assert.match(catalog, /includes\(query.trim\(\).toLocaleLowerCase\("id-ID"\)\)/);
  assert.match(read("../src/app/blog/article/page.tsx"), /permanentRedirect/);
});
