import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("student histories load together without overwriting dirty drafts; uploads stay student-scoped", () => {
  const source = read("../src/app/profile/testimoni/page.tsx");
  assert.match(source, /Promise\.all\(\(\["text", "video"\] as const\)\.map/);
  assert.match(source, /\/api\/student\/testimonial\?type=\$\{kind\}/);
  assert.match(source, /\[user, revision\]/);
  assert.match(source, /controller\.abort\(\)/);
  assert.match(source, /if \(!dirty\.current\[kind\]\)/);
  assert.match(source, /dirty\.current\[type\] = true/);
  assert.match(source, /url\.protocol === "https:" && !url\.username && !url\.password && !url\.port/);
  assert.match(source, /video\.kind !== "native"/);
  assert.match(source, /draft\.thumbnailFile instanceof File/);
  assert.match(source, /bytes\[0\] === 0xff && bytes\[1\] === 0xd8 && bytes\[2\] === 0xff/);
  assert.match(source, /\[137, 80, 78, 71, 13, 10, 26, 10\]/);
  assert.match(source, /body\.append\("video_thumbnail", file, file\.name\)/);
  assert.match(source, /body\.append\("_method", "PUT"\)/);
  assert.match(source, /<TestimonialFields/);
  assert.match(source, /<TestimonialPreview/);
  assert.doesNotMatch(source, /AdminMediaUpload|\/api\/admin/);
  const builder = read("../src/components/testimonial-builder.tsx");
  assert.match(builder, /<label htmlFor=\{`\$\{id\}-type`\}>Jenis Testimoni/);
  assert.match(builder, /<select/);
  assert.match(builder, /accept="image\/png,image\/jpeg"/);
  assert.match(builder, /<VideoRecommendation/);
});

test("admin publication requires consent, approval and no archive; landing remains text-only", () => {
  const source = read("../src/components/admin-testimonial-prototype.tsx");
  assert.match(source, /item\.consent_public === true && item\.moderation_status === "approved" && !!item\.published && !item\.archived_at && !!\(item\.landing \|\| item\.show_on_testimonials\)/);
  assert.match(source, /item\.type === "text" && !item\.video_url/);
  assert.match(source, /selected\.length >= 6/);
  assert.match(source, /show_on_testimonials: draft\.show_on_testimonials/);
  assert.match(source, /landing: !!draft\.landing/);
  assert.match(source, /draft\.consent_public === true && draft\.published \? \{ moderation_status: "approved" \}/);
  assert.match(source, /readOnly=\{draft\.source === "student"\}/);
  assert.match(source, /role="tablist"/);
  assert.match(source, /role="tabpanel"/);
  assert.match(source, /"ArrowLeft", "ArrowRight", "Home", "End"/);
  assert.match(source, /kind="image" label="Thumbnail video"/);
  const builder = read("../src/components/testimonial-builder.tsx");
  assert.match(builder, /testimonialVideo\(value\.video_url, value\.video_url_resolved_url\)/);
  assert.match(builder, /<TestimonialCard/);
  assert.match(builder, /<VideoRecommendation/);
});
