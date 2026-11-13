import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");

function videoHarness() {
  const provider = vm.createContext({ exports: {}, URL });
  vm.runInContext(ts.transpileModule(read("../src/lib/testimonial-video.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, provider);
  const context = vm.createContext({ exports: {}, require: name => name === "@/lib/testimonial-video" ? provider.exports : {}, URL, process: { env: { NEXT_PUBLIC_API_URL: "http://localhost:8000" } } });
  const source = ts.transpileModule(read("../src/lib/public-content-api.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInContext(source, context);
  return context.exports.testimonialVideo;
}

test("testimonial videos normalize YouTube trailing slashes without accepting malformed IDs", () => {
  const video = videoHarness();
  for (const path of ["youtu.be/dQw4w9WgXcQ", "www.youtube.com/embed/dQw4w9WgXcQ", "www.youtube.com/shorts/dQw4w9WgXcQ", "www.youtube.com/watch?v=dQw4w9WgXcQ"]) {
    const source = `https://${path}`;
    const url = new URL(source);
    url.pathname += "/";
    for (const value of [source, url.href]) {
      assert.equal(video(value)?.kind, "youtube");
      assert.equal(video(value)?.src, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    }
  }
  for (const value of [null, "javascript:alert(1)", "https://www.youtube.com/embed/invalid/", "https://youtu.be/dQw4w9WgXcQ/extra", "https://www.youtube.com/embed/dQw4w9WgXcQ//"]) assert.equal(video(value), null);
  assert.equal(video("testimonials/clip.mp4")?.src, "http://localhost:8000/storage/testimonials/clip.mp4");
  assert.equal(video("testimonials/clip.mp4", "https://media.example.test/clip.mp4")?.src, "https://media.example.test/clip.mp4");
});

test("landing keeps six text stories; showcase delegates videos to validated playback controls", () => {
  const landing = read("../src/app/page.tsx");
  assert.match(landing, /testimonial\.type === "text" && !testimonial\.video_url\)\.slice\(0, 6\)/);
  const showcase = read("../src/app/testimoni/page.tsx");
  assert.match(showcase, /item\.published !== false && item\.show_on_testimonials !== false/);
  assert.match(showcase, /item\.type === "text"/);
  assert.match(showcase, /item\.type === "video"/);
  assert.match(showcase, /<VideoRecommendation key=\{item\.id\} item=\{item\}/);
  const recommendation = read("../src/app/testimoni/video-recommendation.tsx");
  assert.match(recommendation, /open && <TestimonialVideoCard/);
  assert.match(recommendation, /videoResolvedUrl=\{item\.video_url_resolved_url\}/);
  assert.match(recommendation, /thumbnail=\{item\.video_thumbnail\}/);
  const player = read("../src/components/testimonial-video-card.tsx");
  assert.match(player, /sandbox="allow-scripts allow-same-origin allow-presentation"/);
  assert.match(player, /<video controls autoPlay preload="metadata"/);
  assert.match(player, /onClick=\{\(\) => setPlaying\(true\)\}/);
  assert.match(player, /rel="noopener noreferrer"/);
});

test("admin save excludes student identity and ownership; approval requires consent", () => {
  const source = read("../src/components/admin-testimonial-prototype.tsx");
  const tree = ts.createSourceFile("testimonials.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let save;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "save") save = node.getText(tree);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(save, "admin save handler found");
  for (const type of ["text", "video"]) for (const consent of [false, true]) for (const published of [false, true]) {
    let payload;
    const draft = { id: 7, source: "student", user_id: 99, name: "Owner", context: "N4", image: "owner.png", type, quote: "Story", title: "Video", video_url: "https://youtu.be/abcdefghijk", video_thumbnail: "poster.png", consent_public: consent, published, landing: false, show_on_testimonials: true };
    vm.runInNewContext(ts.transpileModule(`${save}\nsave({ preventDefault() {} });`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, { draft, mutate: (_item, body) => { payload = JSON.parse(JSON.stringify(body)); } });
    assert.ok(payload);
    const expected = ["quote", "archived_at", "published", "landing", "show_on_testimonials", ...(type === "video" ? ["title", "video_url", "video_thumbnail"] : []), ...(consent && published ? ["moderation_status"] : [])];
    assert.deepEqual(Object.keys(payload).sort(), expected.sort());
    assert.equal(payload.moderation_status, consent && published ? "approved" : undefined);
  }
});

test("student submission excludes identity and public landing keeps its filter", () => {
  const source = read("../src/app/profile/testimoni/page.tsx");
  const tree = ts.createSourceFile("student.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let fields;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "payload" && ts.isObjectLiteralExpression(node.initializer)) fields = node.initializer.properties.filter(property => !ts.isSpreadAssignment(property)).map(property => property.name.getText(tree));
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.deepEqual(fields, ["type", "quote", "consent_public"]);
  assert.match(source, /type === "video" \? \{ title: draft\.title\.trim\(\), video_url: draft\.videoUrl\.trim\(\) \} : \{\}/);
  assert.match(source, /JSON\.stringify\(payload\)/);
  assert.match(source, /Object\.entries\(payload\)/);
  assert.match(source, /cause\.status === 409/);
  assert.match(source, /if \(!valid \|\| submitting\.current\) return/);
  assert.match(source, /const valid = !!user && !locked && draft\.consent/);
  assert.match(source, /saved\?\.moderation_status === "approved" \|\| !!saved\?\.archived_at/);
  assert.match(read("../src/app/page.tsx"), /\/api\/testimonials\?landing=true/);
  assert.match(read("../src/components/testimonial-card.tsx"), /<StudentAvatar /);
});
