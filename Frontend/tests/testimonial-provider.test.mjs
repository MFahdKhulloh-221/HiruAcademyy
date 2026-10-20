import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const context = vm.createContext({ exports: {}, URL });
vm.runInContext(ts.transpileModule(readFileSync(new URL("../src/lib/testimonial-video.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
const parse = context.exports.parseTestimonialVideo;

test("provider links normalize to safe destinations", () => {
  for (const source of ["https://youtu.be/abcdefghijk", "https://youtube.com/watch?v=abcdefghijk", "https://youtube.com/shorts/abcdefghijk", "https://youtube.com/embed/abcdefghijk/"]) {
    assert.equal(parse(source).src, "https://www.youtube-nocookie.com/embed/abcdefghijk");
  }
  assert.equal(parse("https://www.instagram.com/reel/Ab_cd12/?utm_source=share").kind, "instagram");
  assert.equal(parse("https://instagram.com/p/Ab_cd12").src, "");
  for (const source of ["https://drive.google.com/file/d/abcdefghijk/view?usp=sharing", "https://drive.google.com/open?id=abcdefghijk"]) {
    assert.equal(parse(source).src, "https://drive.google.com/file/d/abcdefghijk/preview");
  }
  assert.equal(parse("https://cdn.example.test/clip.mp4?signature=123").kind, "native");
  assert.equal(parse("http://localhost:8001/storage/media/video/clip.webm").kind, "native");
});

test("unsafe schemes credentials host spoofing and malformed provider paths fail closed", () => {
  for (const source of ["https://youtu.be:444/abcdefghijk", "https://drive.google.com:444/file/d/abcdefghijk/view", "https://cdn.example.test/clip%250amp4", "https://cdn.example.test/clip%0a.mp4", "javascript:alert(1)", "data:video/mp4;base64,eA==", "file:///clip.mp4", "https://user:pass@youtube.com/watch?v=abcdefghijk", "http://youtube.com/watch?v=abcdefghijk", "http://instagram.com/p/abcdefghijk", "http://drive.google.com/file/d/abcdefghijk/view", "https://youtube.com.evil.test/watch?v=abcdefghijk", "https://instagram.com.evil.test/reel/abcdefghijk", "https://drive.google.com.evil.test/file/d/abcdefghijk/view", "https://youtube.com/embed/short", "https://youtu.be/abcdefghijk/extra", "https://instagram.com/accounts/login", "https://drive.google.com/drive/folders/abcdefghijk", "http://cdn.example.test/clip.mp4", "https://cdn.example.test/page.html", "https://youtube.com/embed/abcdefghijk//", "https://instagram.com/reel/abc\\def"]) assert.equal(parse(source), null, source);
});
