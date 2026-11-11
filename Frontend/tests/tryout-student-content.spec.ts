import { expect, test, type Locator, type Page } from "@playwright/test";
import type { AssessmentPassageBlock } from "../src/lib/assessment-image";
import { assessmentSessionLabels, assessmentSessions, type AttemptQuestion, type ServerAttempt } from "../src/lib/assessment-attempt";

// Browser transport fixtures only. No Laravel persistence or DB integration claimed.
type ImageContent = { image?: string | null; image_alt?: string | null; image_position?: "before" | "after" | null; image_resolved_url?: string | null };
type ContentQuestion = AttemptQuestion & ImageContent & { passage?: { id: number; title: string; body: string; blocks?: AssessmentPassageBlock[] } & ImageContent };
const media = (name: string, position?: "before" | "after" | null): ImageContent => ({ image: `assessment/${name}.svg`, image_alt: `${name} snapshot image`, image_resolved_url: `https://assessment-media.test/${name}.svg`, ...(position === undefined ? {} : { image_position: position }) });
const options = { A: "First", B: "Second", C: "Third", D: "Fourth" };
function questions(): ContentQuestion[] {
  const question = (id: number, session: string, text: string, extra: Partial<ContentQuestion> = {}): ContentQuestion => ({ id, session, question: text, instruction: "Choose one answer", options, ...extra });
  const grammar = { id: 41, title: "Grammar group one", body: "<p>Historical grammar stimulus one</p>", ...media("grammar-one", "after") };
  const reading = { id: 51, title: "Reading group", body: "<p>Historical reading <ruby>山<rt>やま</rt></ruby></p>", ...media("reading", "before") };
  return [
    question(101, "vocabulary_kanji", "Historical vocabulary image", media("vocabulary", "before")),
    question(102, "vocabulary_kanji", "Legacy vocabulary without image"),
    question(201, "grammar", "Grammar first question", { passage: grammar, ...media("grammar-question", "after") }),
    question(202, "grammar", "Grammar second question", { passage: grammar }),
    question(203, "grammar", "Grammar separate group", { passage: { id: 42, title: "Grammar group two", body: "<p>Historical grammar stimulus two</p>", ...media("grammar-two", "before") } }),
    question(204, "grammar", "Grammar standalone", media("standalone", null)),
    question(301, "reading", "Reading first question", { passage: reading, ...media("reading-question", "after") }),
    question(302, "reading", "Reading second question", { passage: reading }),
    question(401, "audio", "Audio question with image", { ...media("audio"), audio_url: "https://assessment-media.test/listening.wav", title: "Snapshot listening" }),
  ];
}

async function mockContent(page: Page, { completed = false, kind = "tryout", failedMedia = false }: { completed?: boolean; kind?: "tryout" | "checkpoint" | "mini"; failedMedia?: boolean } = {}) {
  const items = kind === "tryout" ? questions() : [{ id: 101, question: `${kind} legacy question`, session: kind === "mini" ? 1 : "vocabulary_kanji", part: 1, duration_minutes: 2, options }];
  let server: ServerAttempt = { id: 9, kind: kind === "mini" ? "mini" : undefined, chapter_id: kind === "mini" ? 9 : undefined, session: 1, part: 1, duration_minutes: 2, status: completed ? "completed" : "in_progress", revision: 0, questions: items, answers: completed ? { 101: "B", 102: "A" } : {}, result: completed ? { correct: 1, wrong: 1, unanswered: items.length - 2, earned: 1, max: items.length, overall_pass: false } : null, started_at: "2026-10-11T00:00:00Z", expires_at: "2026-10-11T00:10:00Z", server_now: "2026-10-11T00:00:00Z" };
  const calls = { saves: 0, submits: 0, reviews: 0, media: [] as string[] };
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("https://assessment-media.test/**", async route => {
    calls.media.push(route.request().url());
    if (failedMedia) return route.fulfill({ status: 404, body: "Missing snapshot media" });
    if (route.request().url().endsWith(".wav")) return route.fulfill({ contentType: "audio/wav", body: Buffer.from("RIFF$\0\0\0WAVEfmt ", "binary") });
    return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="500"><rect width="1800" height="500" fill="#f48220"/></svg>' });
  });
  const programs = [{ id: 5, code: "n5", name: "JLPT N5", family: "jlpt" }];
  const access = { learning: { n5: "full" }, replay_levels: [], source_grants: [{ plan_code: "sensei", program_code: "n5" }] };
  const chapter = { id: 9, chapter_number: 1, sort_order: 0, title: "Snapshot chapter", access: "full", flashcards: [], video_lessons: [], modules: [], mini_checkpoint: { exists: true }, mini_checkpoints: [{ session: 1, part: 1, duration_minutes: 2, passing_score: 70, question_count: 1, configuration_valid: true }] };
  const endpoint = kind === "checkpoint" ? "/api/student/checkpoint-packages" : "/api/student/try-outs";
  await page.route(/\/(api\/|sanctum\/csrf-cookie)/, async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const headers = { "access-control-allow-origin": new URL(page.url()).origin, "access-control-allow-credentials": "true", "access-control-allow-methods": "GET, POST, PUT, OPTIONS", "access-control-allow-headers": "accept, content-type, x-xsrf-token" };
    const reply = (data: unknown) => route.fulfill({ headers, json: { data } });
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (path === "/sanctum/csrf-cookie") return route.fulfill({ status: 204, headers: { ...headers, "set-cookie": "XSRF-TOKEN=testing; Path=/" } });
    if (path === "/api/me") return reply({ id: 71, name: "Student", email: "content@example.test", whatsapp: "081234567890", role: "student", account_status: "active" });
    if (path === "/api/public/programs") return reply(programs);
    if (path === "/api/student/access") return reply(access);
    if (path === "/api/student/dashboard") return reply({ programs, access, chapters: [] });
    if (path === "/api/student/programs/5/chapters") return reply([chapter]);
    if (path === "/api/student/programs/5/chapters/9") return reply(chapter);
    if (path.endsWith("/progress")) return reply({ chapter_id: 9, activities: {}, mini_eligible: true, mini_unlocked: true });
    const detail = { id: 2, level: "N5", title: "Snapshot exam", duration_minutes: 10, max_score: items.length, sessions: Object.fromEntries(assessmentSessions.map((session, index) => [session, assessmentSessionLabels[index]])) };
    if (path === endpoint) return reply([detail]);
    if (path === `${endpoint}/2`) return reply(detail);
    if (path.endsWith("/history")) return reply({ best_score: null, attempts: [] });
    if (path.includes("/attempts")) {
      if (path.endsWith("/answers")) {
        calls.saves++;
        const body = route.request().postDataJSON();
        expect(body.revision).toBe(server.revision);
        server = { ...server, answers: body.answers, revision: server.revision! + 1 };
      }
      if (path.endsWith("/submit")) {
        calls.submits++;
        expect(route.request().postDataJSON().revision).toBe(server.revision);
        server = { ...server, status: "completed", result: { correct: 1, wrong: 0, unanswered: items.length - 1, earned: 1, max: items.length, overall_pass: false } };
      }
      if (path.endsWith("/review")) {
        calls.reviews++;
        expect(server.status).toBe("completed");
        return reply({ ...server, questions: server.questions.map(item => ({ ...item, correct_option: "B", explanation: `Historical explanation ${item.id}` })) });
      }
      return reply(server);
    }
    return reply([]);
  });
  return { calls, errors, server: () => server };
}

async function open(page: Page, query = "") {
  await page.clock.install({ time: new Date("2026-10-11T00:00:00Z") });
  await page.goto(`/tryout?tryout=2&attempt=9${query}`);
}
async function next(page: Page) {
  await page.getByRole("button", { name: "Selanjutnya", exact: true }).click();
}
async function imageOrder(image: Locator, text: Locator, position: "before" | "after") {
  await expect(image).toBeVisible();
  await expect(text).toBeVisible();
  const textHandle = await text.elementHandle();
  expect(await image.evaluate((element, other) => Boolean(element.compareDocumentPosition(other!) & Node.DOCUMENT_POSITION_FOLLOWING), textHandle)).toBe(position === "before");
}
const card = (page: Page) => page.locator(".learning-question-card");
async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const width of [1440, 768, 390]) test(`snapshot images and grouped navigation fit ${width}px (mock API)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  const mock = await mockContent(page);
  await open(page);
  await imageOrder(page.getByAltText("vocabulary snapshot image", { exact: true }), card(page).getByRole("heading", { name: "Historical vocabulary image", exact: true }), "before");
  await expect(page.getByAltText("vocabulary snapshot image")).toHaveAttribute("src", "https://assessment-media.test/vocabulary.svg");
  await card(page).locator("label").filter({ has: page.getByRole("radio", { name: "B. Second", exact: true }) }).click();
  await expect.poll(() => mock.server().answers[101]).toBe("B");
  await expect(page.getByRole("timer")).toBeVisible();
  await fits(page);
  await next(page);
  await expect(card(page)).toContainText("Legacy vocabulary without image");
  await expect(card(page).locator("img")).toHaveCount(0);
  await page.getByRole("button", { name: "Tata Bahasa", exact: true }).click();
  await expect(card(page)).toContainText("Grammar first question");
  await expect(page.getByAltText("grammar-one snapshot image", { exact: true })).toHaveCount(1);
  await imageOrder(page.getByAltText("grammar-one snapshot image", { exact: true }), page.getByText("Historical grammar stimulus one", { exact: true }), "after");
  await imageOrder(page.getByAltText("grammar-question snapshot image", { exact: true }), card(page).getByRole("heading", { name: "Grammar first question", exact: true }), "after");
  await fits(page);
  await next(page);
  await expect(card(page)).toContainText("Grammar second question");
  await expect(page.getByAltText("grammar-one snapshot image", { exact: true })).toHaveCount(1);
  await expect(page.getByAltText("grammar-question snapshot image", { exact: true })).toHaveCount(0);
  await next(page);
  await expect(card(page)).toContainText("Grammar separate group");
  await expect(page.getByText("Historical grammar stimulus one", { exact: true })).toHaveCount(0);
  await expect(page.getByAltText("grammar-one snapshot image", { exact: true })).toHaveCount(0);
  await imageOrder(page.getByAltText("grammar-two snapshot image", { exact: true }), page.getByText("Historical grammar stimulus two", { exact: true }), "before");
  await next(page);
  await expect(card(page)).toContainText("Grammar standalone");
  await expect(page.getByText("Historical grammar stimulus two", { exact: true })).toHaveCount(0);
  await expect(page.getByAltText("grammar-two snapshot image", { exact: true })).toHaveCount(0);
  await imageOrder(page.getByAltText("standalone snapshot image", { exact: true }), card(page).getByRole("heading", { name: "Grammar standalone", exact: true }), "before");
  await page.getByRole("button", { name: "Reading (Dokkai)", exact: true }).click();
  await imageOrder(page.getByAltText("reading snapshot image", { exact: true }), page.getByText("Historical reading", { exact: false }), "before");
  await imageOrder(page.getByAltText("reading-question snapshot image", { exact: true }), card(page).getByRole("heading", { name: "Reading first question", exact: true }), "after");
  await expect(page.locator(".exam-reading-passage ruby rt")).toHaveText("やま");
  await fits(page);
  await next(page);
  await expect(card(page)).toContainText("Reading second question");
  await expect(page.getByAltText("reading snapshot image", { exact: true })).toHaveCount(1);
  await expect(page.getByAltText("reading-question snapshot image", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Audio (Choukai)", exact: true }).click();
  await expect(card(page).locator("audio")).toHaveAttribute("controls", "");
  await expect(card(page).locator("audio")).toHaveAttribute("src", "https://assessment-media.test/listening.wav");
  await imageOrder(page.getByAltText("audio snapshot image", { exact: true }), card(page).getByRole("heading", { name: "Audio question with image", exact: true }), "before");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(mock.errors).toEqual([]);
  expect(mock.calls.submits).toBe(0);
});

test("ordered shared passage snapshots render text-image-text at narrow width (mock API)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  const mock = await mockContent(page);
  for (const item of mock.server().questions as ContentQuestion[]) {
    if (!item.passage || !["grammar", "reading"].includes(String(item.session))) continue;
    item.passage.blocks = [
      { type: "text", text: "<p>Awal snapshot berurutan</p>" },
      { type: "image", image: "assessment/ordered.svg", image_alt: "Diagram snapshot tengah", image_resolved_url: "https://assessment-media.test/ordered.svg" },
      { type: "text", text: "<p>Akhir snapshot berurutan</p>" },
    ];
  }
  await open(page);
  for (const session of ["Tata Bahasa", "Reading (Dokkai)"]) {
    await page.getByRole("button", { name: session, exact: true }).click();
    const image = page.getByRole("img", { name: "Diagram snapshot tengah", exact: true });
    await expect(image).toHaveCount(1);
    await imageOrder(image, page.getByText("Awal snapshot berurutan", { exact: true }), "after");
    await imageOrder(image, page.getByText("Akhir snapshot berurutan", { exact: true }), "before");
    await fits(page);
    await next(page);
    await expect(image).toHaveCount(1);
    await expect(page.getByText("Awal snapshot berurutan", { exact: true })).toHaveCount(1);
    await fits(page);
  }
  expect(mock.errors).toEqual([]);
  expect(mock.calls.submits).toBe(0);
});

test("completed result and review retain historical content and answer states (mock API)", async ({ page }) => {
  const mock = await mockContent(page, { completed: true });
  await open(page);
  await expect(page.getByRole("heading", { name: "Hasil Snapshot exam", exact: true })).toBeVisible();
  await expect(page.locator(".tryout-result-reference")).toContainText("Benar1Salah1Kosong7");
  await page.getByRole("button", { name: "Review Jawaban", exact: true }).click();
  await expect(card(page)).toContainText("Historical vocabulary image");
  await expect(page.getByAltText("vocabulary snapshot image", { exact: true })).toHaveCount(1);
  await expect(card(page).getByRole("radio", { name: /^B\. Second/ })).toBeChecked();
  await expect(card(page).locator(".review-correct")).toContainText("Jawaban kamu · Benar");
  await expect(card(page)).toContainText("Historical explanation 101");
  await next(page);
  await expect(card(page).getByRole("radio", { name: /^A\. First/ })).toBeChecked();
  await expect(card(page).locator(".review-wrong")).toContainText("Jawaban kamu · Salah");
  await expect(card(page).locator(".review-correct")).toContainText("Second");
  await page.getByRole("button", { name: "Tata Bahasa", exact: true }).click();
  await expect(card(page).locator("input:checked")).toHaveCount(0);
  await expect(card(page).locator(".review-correct")).toContainText("Second");
  await expect(card(page).locator(".review-wrong")).toHaveCount(0);
  await expect(card(page)).toContainText("Jawaban kamu: Kosong");
  await expect(card(page)).toContainText("Historical explanation 201");
  await expect(page.getByAltText("grammar-one snapshot image", { exact: true })).toHaveCount(1);
  await imageOrder(page.getByAltText("grammar-question snapshot image", { exact: true }), card(page).getByRole("heading", { name: "Grammar first question", exact: true }), "after");
  await imageOrder(page.getByAltText("grammar-one snapshot image", { exact: true }), page.getByText("Historical grammar stimulus one", { exact: true }), "after");
  await expect(card(page).getByRole("radio").first()).toBeDisabled();
  await page.getByRole("button", { name: "Reading (Dokkai)", exact: true }).click();
  await expect(page.getByAltText("reading snapshot image", { exact: true })).toHaveCount(1);
  await expect(page.getByAltText("reading-question snapshot image", { exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Audio (Choukai)", exact: true }).click();
  await expect(card(page).locator("audio")).toHaveCount(1);
  await expect(page.getByAltText("audio snapshot image", { exact: true })).toHaveCount(1);
  expect(mock.calls.reviews).toBe(1);
  expect(mock.calls.saves).toBe(0);
  expect(mock.calls.submits).toBe(0);
  expect(mock.errors).toEqual([]);
});

test("explicit unresolved managed image never requests raw storage; legacy URL still renders (mock API)", async ({ page }) => {
  const mock = await mockContent(page);
  const rawRequests: string[] = [];
  page.on("request", request => { if (new URL(request.url()).pathname.includes("private-unresolved")) rawRequests.push(request.url()); });
  Object.assign(mock.server().questions[0], { image: "assessment/private-unresolved.svg", image_resolved_url: null });
  Object.assign(mock.server().questions[1], { image: "https://assessment-media.test/legacy.svg", image_alt: "Legacy safe URL" });
  await open(page);
  await expect(card(page)).toContainText("Historical vocabulary image");
  await expect(card(page).locator("img")).toHaveCount(0);
  await expect(card(page).getByRole("status")).toHaveText("Gambar tidak tersedia.");
  expect(mock.calls.media).toEqual([]);
  await next(page);
  await expect(page.getByAltText("Legacy safe URL")).toHaveAttribute("src", "https://assessment-media.test/legacy.svg");
  await expect(page.getByAltText("Legacy safe URL")).toHaveJSProperty("naturalWidth", 1800);
  expect(mock.calls.media).toEqual(["https://assessment-media.test/legacy.svg"]);
  expect(rawRequests).toEqual([]);
  expect(mock.errors).toEqual([]);
});

test("failed image response leaves text, answers and navigation usable (mock API)", async ({ page }) => {
  const mock = await mockContent(page, { failedMedia: true });
  await open(page);
  await expect.poll(() => mock.calls.media.includes("https://assessment-media.test/vocabulary.svg")).toBe(true);
  await expect(page.getByAltText("vocabulary snapshot image")).toHaveJSProperty("complete", true);
  await expect(page.getByAltText("vocabulary snapshot image")).toHaveJSProperty("naturalWidth", 0);
  await expect(card(page)).toContainText("Historical vocabulary image");
  await card(page).locator("label").filter({ has: page.getByRole("radio", { name: "A. First", exact: true }) }).click();
  await expect.poll(() => mock.server().answers[101]).toBe("A");
  await next(page);
  await expect(card(page)).toContainText("Legacy vocabulary without image");
  expect(mock.errors).toEqual([]);
});

for (const kind of ["checkpoint", "mini"] as const) test(`${kind} legacy runner keeps answers and no image UI (mock API)`, async ({ page }) => {
  const mock = await mockContent(page, { kind });
  await page.clock.install({ time: new Date("2026-10-11T00:00:00Z") });
  await page.goto(kind === "checkpoint" ? "/checkpoint?checkpoint=2&attempt=9" : "/learn/n5/chapter-1/checkpoint?membership=sensei&attempt=9&mini_session=1&mini_part=1");
  if (kind === "mini") await page.getByRole("button", { name: "Mulai", exact: true }).click();
  await expect(card(page)).toContainText(`${kind} legacy question`);
  await expect(card(page).locator("img")).toHaveCount(0);
  await expect(page.locator(".assessment-content-image")).toHaveCount(0);
  await card(page).locator("label").filter({ has: page.getByRole("radio", { name: "A. First", exact: true }) }).click();
  await expect.poll(() => mock.server().answers[101]).toBe("A");
  await expect(page.getByRole("timer")).toBeVisible();
  expect(mock.calls.media).toEqual([]);
  expect(mock.calls.submits).toBe(0);
  expect(mock.errors).toEqual([]);
});
