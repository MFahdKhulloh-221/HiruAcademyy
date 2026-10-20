import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("student type switch reloads safely and video submission never uses admin upload", () => {
  const source = read("../src/app/profile/testimoni/page.tsx");
  assert.match(source, /\/api\/student\/testimonial\?type=\$\{type\}/);
  assert.match(source, /\[version, type\]/);
  assert.match(source, /controller\.abort\(\)/);
  assert.match(source, /if \(loading \|\| loadError\) return/);
  assert.match(source, /setLoading\(true\); setError\(""\); setLoadError\(""\); setType\(value\)/);
  assert.match(source, /url\.protocol === "https:" && !url\.username && !url\.password/);
  assert.match(source, /type === "video" \? \{ title: title\.trim\(\), video_url: videoUrl\.trim\(\), video_thumbnail: thumbnail\.trim\(\) \} : \{\}/);
  assert.match(source, /Testimoni Tertulis/);
  assert.match(source, /Platform video/);
  assert.match(source, /role="tablist"/);
  assert.match(source, /aria-selected=\{type === value\}/);
  assert.match(source, /"ArrowLeft", "ArrowRight", "Home", "End"/);
  assert.match(source, /consent_public: true/);
  assert.match(source, /testimonialVideo\(videoUrl\.trim\(\)\)\?\.kind === "native"/);
  assert.match(source, /<ProfileIdentity /);
  assert.match(source, /<TestimonialVideoCard /);
  assert.doesNotMatch(source, /AdminMediaUpload|\/api\/admin/);
});

test("admin moderation retains backend approval and independent display channels", () => {
  const source = read("../src/components/admin-testimonial-prototype.tsx");
  assert.match(source, /patchStudent\(row, \{ moderation_status: "approved" \}\)/);
  assert.match(source, /show_on_testimonials: draft\.showOnTestimonials/);
  assert.match(source, /Testimoni Biasa/);
  assert.match(source, /status === "published" \? row\.published : status === "inactive" \? !row\.published/);
  assert.match(source, /<option value="inactive">Nonaktif<\/option>/);
  assert.match(source, /role="tablist"/);
  assert.match(source, /role="tabpanel"/);
  assert.match(source, /landing: draft\.landing/);
  assert.match(source, /draft\.type !== "video" && !draft\.quote\.trim\(\)/);
  assert.match(source, /contentMedia\(draft\.videoThumbnail, draft\.video_thumbnail_resolved_url\)/);
  assert.match(source, /kind="image" onUploaded=\{\(videoThumbnail, url\)/);
  assert.match(source, /Hapus testimoni \{deleting\?\.name\} \(\{deleting\?\.type === "video" \? "Video" : "Teks"\}\)/);
  const preview = read("../src/components/admin-profile-preview.tsx");
  assert.match(preview, /testimonial\.type !== "video" && <article/);
  assert.match(preview, /testimonial\.type === "video" && testimonial\.videoUrl/);
  assert.match(preview, /<TestimonialVideoCard /);
  assert.doesNotMatch(preview, /AdminVideoPreview/);
});
