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

test("landing and testimonial pages render validated videos with existing playback controls", () => {
  for (const path of ["../src/app/page.tsx", "../src/app/testimoni/page.tsx"]) {
    const source = read(path);
    assert.match(source, /<TestimonialVideoCard/);
    assert.match(source, /className="testimonial-video-grid"/);
    assert.match(source, /videoResolvedUrl=\{testimonial\.video_url_resolved_url\}/);
    assert.match(source, /thumbnail=\{testimonial\.video_thumbnail\}/);
    assert.match(source, /\.type === "text"/);
    assert.match(source, /\.type === "video"/);
    assert.match(source, /key=\{testimonial\.id\}/);
  }
  const player = read("../src/components/testimonial-video-card.tsx");
  assert.match(player, /sandbox="allow-scripts allow-same-origin allow-presentation"/);
  assert.match(player, /<video controls autoPlay preload="metadata"/);
  assert.match(player, /onClick=\{\(\) => setPlaying\(true\)\}/);
  assert.match(player, /rel="noopener noreferrer"/);
});

test("student admin PATCH is restricted, manual save excludes student metadata", () => {
  const source = read("../src/components/admin-testimonial-prototype.tsx");
  const tree = ts.createSourceFile("testimonials.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let patchFields;
  let manualFields;
  let patchBody;
  function visit(node) {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === "StudentPatch") patchFields = node.type.members.map(member => member.name.getText(tree));
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "next" && ts.isObjectLiteralExpression(node.initializer)) manualFields = node.initializer.properties.map(property => property.name?.getText(tree));
    if (ts.isFunctionDeclaration(node) && node.name?.text === "patchStudent") patchBody = node.body.getText(tree);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.deepEqual(patchFields, ["moderation_status", "moderation_note", "published", "landing", "show_on_testimonials", "sort_order"]);
  assert.deepEqual(manualFields, ["id", "type", "title", "videoThumbnail", "showOnTestimonials", "name", "context", "quote", "image", "videoUrl", "videoTitle", "published", "landing", "order"]);
  assert.match(patchBody, /row\.source !== "student"/);
  assert.match(patchBody, /body: JSON\.stringify\(patch\)/);
  assert.match(source, /patchStudent\(row, \{ moderation_status: "approved" \}\)/);
});

test("student submission excludes identity and public landing keeps its filter", () => {
  const source = read("../src/app/profile/testimoni/page.tsx");
  const tree = ts.createSourceFile("student.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let fields;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(tree) === "JSON.stringify" && ts.isObjectLiteralExpression(node.arguments[0])) fields = node.arguments[0].properties.filter(property => !ts.isSpreadAssignment(property)).map(property => property.name.getText(tree));
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.deepEqual(fields, ["type", "context", "quote", "consent_public"]);
  assert.match(source, /type === "video" \? \{ title: title\.trim\(\), video_url: videoUrl\.trim\(\), video_thumbnail: thumbnail\.trim\(\) \} : \{\}/);
  assert.match(source, /cause\.status === 409/);
  assert.match(source, /if \(submitting\.current \|\| locked\) return/);
  assert.match(read("../src/app/page.tsx"), /\/api\/testimonials\?landing=true/);
  assert.match(read("../src/app/testimoni/page.tsx"), /<StudentAvatar /);
});
