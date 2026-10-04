import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route(/\/(api\/|sanctum\/csrf-cookie)/, async route => {
    const path = new URL(route.request().url()).pathname;
    const current = new URL(page.url());
    const membership = current.searchParams.get("membership") ?? "lms";
    const programs = ["dasar", "n5", "n4", "n3", "n2", "n1"].map((code, index) => ({ id: index + 1, code, name: code === "dasar" ? "Dasar Bahasa Jepang" : `JLPT ${code.toUpperCase()}`, family: "jlpt" }));
    const chapters = [1, 4].map(number => ({ id: number, chapter_number: number, title: `Chapter ${number}`, sort_order: number, access: "full", video_lessons: [], modules: [], flashcards: [], mini_checkpoint: { exists: false } }));
    const data = path === "/api/me" ? { id: 901, name: "Browser Student", email: "browser@example.test", whatsapp: "6281999000012", role: current.pathname.startsWith("/admin") ? "admin" : "student", account_status: "active" }
      : path === "/api/public/programs" ? programs
      : path === "/api/student/access" ? { learning: Object.fromEntries(programs.map(item => [item.code, membership === "free" ? "preview" : "full"])), replay_levels: membership === "sensei" ? ["n5", "n4"] : [], source_grants: membership === "free" ? [] : [{ plan_code: membership, program_code: "n4" }] }
      : path.endsWith("/chapters") ? chapters
      : /\/chapters\/\d+$/.test(path) ? chapters.find(item => path.endsWith(`/${item.id}`))
      : path.endsWith("/progress") ? { chapter_id: 1, activities: {}, mini_unlocked: false }
      : path === "/api/student/affiliate" ? { code: null, affiliate: null, totals: { pending: 0, approved: 0, paid: 0 } }
      : [];
    await route.fulfill({ json: { data } });
  });
});

const routes = ["/", "/login", "/register", "/program", "/placement", "/blog", "/testimoni", "/sensei", "/dashboard?membership=free", "/dashboard?membership=lms", "/dashboard?membership=sensei", "/journey?membership=lms", "/journey/n5?membership=lms", "/learn/n5/chapter-1?membership=lms", "/flashcards?membership=lms", "/practice?membership=lms", "/library?membership=lms", "/tryout?membership=lms", "/schedule?membership=sensei", "/replay?membership=sensei", "/mini-checkpoint?membership=sensei", "/admin", "/admin/program-harga", "/admin/kurikulum-materi", "/admin/bank-soal", "/admin/invoice", "/admin/pencairan-komisi", "/admin/pengaturan-integrasi"];

for (const width of [390, 768, 1440]) {
  test.describe(`viewport ${width}`, () => {
    test.use({ viewport: { width, height: 900 } });
    for (const route of routes) {
      test(route, async ({ page }, testInfo) => {
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const response = await page.goto(route);
        expect(response?.status()).toBe(200);
        await expect(page.getByRole("heading").first()).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        expect(errors).toEqual([]);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `Horizontal overflow: ${route}`).toBeLessThanOrEqual(1);
        await page.screenshot({ path: testInfo.outputPath("app.png"), fullPage: true, animations: "disabled" });
      });
    }
  });
}

const responsiveStudentRoutes = [
  "/dashboard?membership=lms",
  "/journey?membership=lms",
  "/learn/n4/chapter-4?membership=lms",
  "/practice?membership=lms",
  "/library?membership=lms",
  "/tryout?membership=lms",
  "/schedule?membership=sensei",
  "/replay?membership=sensei",
  "/mini-checkpoint?membership=sensei",
  "/community?membership=lms",
  "/progress?membership=lms",
  "/leaderboard?membership=lms",
  "/profile?membership=lms",
  "/renewal?membership=lms",
  "/certificate?membership=lms",
  "/notifications?membership=lms",
  "/renewal/membership?membership=lms",
  "/community/post-1?membership=lms",
  "/community/ask?membership=lms",
  "/learn/n4/chapter-1/reading?membership=lms",
  "/affiliate?membership=lms",
];

for (const viewport of [{ width: 320, height: 568 }, { width: 360, height: 800 }, { width: 375, height: 667 }, { width: 390, height: 844 }, { width: 393, height: 852 }, { width: 412, height: 915 }, { width: 430, height: 932 }, { width: 768, height: 1024 }, { width: 820, height: 1180 }, { width: 1024, height: 768 }, { width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
  test.describe(`student responsive ${viewport.width}`, () => {
    test.use({ viewport });
    for (const route of responsiveStudentRoutes) {
      test(route, async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(route);
        await expect(page.getByRole("heading").first()).toBeVisible();
        expect(errors).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `Horizontal overflow: ${route}`).toBeLessThanOrEqual(1);
      });
    }
  });
}

test("free dashboard bento uses full-width mobile cards", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/dashboard?membership=free");
  await expect(page.locator(".dashboard-bento-left")).toBeVisible();
  const content = page.locator(".dash-content");
  const cards = [page.locator(".dashboard-bento-left"), page.locator(".dash-progress-card"), page.locator(".dashboard-bento-leaderboard")];
  const contentWidth = await content.evaluate((element) => element.getBoundingClientRect().width - parseFloat(getComputedStyle(element).paddingLeft) - parseFloat(getComputedStyle(element).paddingRight));
  for (const card of cards) expect(await card.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(contentWidth - 1);
  await expect(page.getByRole("link", { name: /Lanjutkan Belajar/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(393);
  await page.screenshot({ path: "C:/Users/Tulo/AppData/Local/Temp/opencode/dashboard-393.png", fullPage: true, animations: "disabled" });
});

test("dashboard membership lock keeps upgrade action and close control", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard?membership=free");
  const tryout = page.getByRole("button", { name: "Try Out, akses terkunci" });
  await expect(tryout).toHaveCSS("display", "flex");
  await expect(tryout.locator("svg")).toBeVisible();
  await tryout.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Akses Terkunci" })).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Upgrade", exact: true })).toHaveAttribute("href", "/#program");
  await dialog.locator(".locked-modal-close").click();
  await expect(dialog).toHaveCount(0);
});

test("tryout runner uses canonical questions in clean focus workspace without answer keys", async ({ page }) => {
  await page.route("**/api/student/try-outs", route => route.fulfill({ json: { data: [{ id: 7, program_id: 2, title: "Canonical Try Out", max_score: 180, section_passing_score: 19, total_passing_score: null, sessions: {} }] } }));
  await page.route("**/sanctum/csrf-cookie", route => route.fulfill({ status: 204, headers: { "set-cookie": "XSRF-TOKEN=test; Path=/" } }));
  await page.route("**/api/student/try-outs/7/attempts", route => route.fulfill({ json: { data: { id: 11, status: "in_progress", revision: 0, current_session: 0, answers: {}, result: null, questions: [{ id: 1, session: "vocabulary_kanji", question: "Canonical question", options: { A: "First", B: "Second", C: "Third", D: "Fourth" } }] } } }));
  await page.goto("/tryout?membership=lms");
  await page.getByRole("button", { name: "Mulai Try Out", exact: true }).click();
  await page.getByRole("button", { name: "Mulai", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Canonical question", exact: true })).toBeVisible();
  await expect(page.locator(".tryout-clean-focus")).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(4);
  await expect(page.getByText("Jawaban benar:", { exact: false })).toHaveCount(0);
});

test("tryout uses breadcrumb and level filter", async ({ page }) => {
  await page.route("**/api/student/try-outs", route => route.fulfill({ json: { data: [{ id: 7, program_id: 3, title: "N3 | Simulasi Nasional", max_score: 180, section_passing_score: 19, total_passing_score: null, sessions: {} }] } }));
  await page.goto("/tryout?membership=lms");
  await expect(page.getByRole("heading", { name: "Try Out", exact: true })).toBeVisible();
  await expect(page.getByText("N3 | Simulasi Nasional", { exact: true })).toBeVisible();
});

test("canonical practice flow advances through chapter assessments", async ({ page }) => {
  await page.route("**/sanctum/csrf-cookie", route => route.fulfill({ status: 204, headers: { "set-cookie": "XSRF-TOKEN=test; Path=/" } }));
  await page.route("**/api/student/programs/*/chapters/*/attempts", route => route.fulfill({ status: 201, json: { data: { id: 9, status: "in_progress", revision: 0, answers: {}, result: null, questions: [{ id: 1, question: "Practice question", options: { A: "First", B: "Second", C: "Third", D: "Fourth" } }] } } }));
  await page.goto("/practice?membership=lms");
  await expect(page.getByRole("heading", { name: "Latihan Harian", exact: true })).toBeVisible();
  const startBtn = page.getByRole("button", { name: "Mulai Latihan" }).first();
  await expect(startBtn).toBeVisible();
  await startBtn.click();
  await expect(page.getByRole("button", { name: "Kembali ke Daftar Latihan" })).toBeVisible();
  await page.getByRole("button", { name: "Mulai", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Practice question", level: 2 })).toBeVisible();
});

test("student navigation resolves active routes and preserves membership access", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const scenarios = [
    ["/journey?membership=sensei", "Perjalanan Level", "Kelas Saya"],
    ["/journey/n4?membership=sensei", "Perjalanan Level", "Kelas Saya"],
    ["/learn/n4/chapter-4?membership=sensei", "Perjalanan Level", "Kelas Saya"],
    ["/learn/n4/chapter-4/video?membership=sensei", "Perjalanan Level", "Kelas Saya"],
    ["/learn/n4/chapter-4/flashcards?membership=sensei", "Kumpulan Flashcard", "Kelas Saya"],
    ["/learn/n4/chapter-4/checkpoint?membership=sensei", "Perjalanan Level", "Kelas Saya"],
    ["/practice?membership=lms", "Latihan Harian", "Kelas Saya"],
    ["/library?membership=lms", "Perpustakaan", "Kelas Saya"],
    ["/tryout?membership=lms", "Try Out", "Kelas Saya"],
    ["/schedule/chapter-4?membership=lms", "Jadwal", "Kelas Saya"],
    ["/replay/chapter-4?membership=sensei", "Replay", "Kelas Saya"],
    ["/mini-checkpoint?membership=sensei", "Mini Checkpoint", "Kelas Saya"],
    ["/community/post-1?membership=sensei", "Diskusi Member", "Komunitas"],
    ["/community/create?membership=sensei", "Diskusi Member", "Komunitas"],
    ["/community/ask?membership=lms", "Tanya Sensei", "Komunitas"],
    ["/ask-sensei?membership=sensei", "Tanya Sensei", "Komunitas"],
    ["/certificate/n5?membership=lms", "Sertifikat", "Progres"],
    ["/renewal/membership?membership=free", "Membership", "Profil"],
  ] as const;

  for (const [route, activeLabel, groupLabel] of scenarios) {
    await page.goto(route);
    const nav = page.locator(".student-nav-desktop nav[aria-label='Navigasi siswa']");
    await expect(nav.locator(".student-nav-parent").filter({ hasText: groupLabel })).toHaveAttribute("aria-expanded", "true");
    await expect(nav.locator("a, button").filter({ hasText: new RegExp(`^${activeLabel}`) })).toHaveAttribute("aria-current", "page");
  }

  const classLabels = ["Perjalanan Level", "Latihan Harian", "Kumpulan Flashcard", "Perpustakaan", "Try Out", "Jadwal", "Replay", "Mini Checkpoint"];
  for (const membership of ["free", "lms", "sensei"] as const) {
    await page.goto(`/journey?membership=${membership}`);
    const nav = page.locator(".student-nav-desktop nav[aria-label='Navigasi siswa']");
    await expect(nav.getByRole("button", { name: "Kelas Saya", exact: true })).toHaveAttribute("aria-expanded", "true");
    const visibleLabels = await nav.locator(".student-submenu:visible").first().locator("a, button").allTextContents();
    expect(visibleLabels.map((label) => label.trim())).toEqual(classLabels);
    const schedule = nav.locator("a, button").filter({ hasText: /^Jadwal$/ });
    if (membership === "sensei") await expect(schedule).toHaveAttribute("href", `/schedule?membership=${membership}`);
    else await expect(schedule).not.toHaveAttribute("href", /./);
  }
});

test("unauthorized service pages preserve server identity and never reveal query supplied media", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/api/student/access", route => route.fulfill({ json: { data: { learning: {}, replay_levels: [], source_grants: [] } } }));
  await page.route("**/api/student/class-schedules*", route => route.fulfill({ status: 403, json: {} }));
  await page.route("**/api/student/replays*", route => route.fulfill({ status: 403, json: {} }));
  for (const route of ["/schedule?membership=sensei", "/replay?membership=sensei&v=dQw4w9WgXcQ"]) {
    await page.goto(route);
    await expect(page.locator(".sensei-topbar")).toContainText("Free Member");
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page.locator("iframe, video")).toHaveCount(0);
  }
});

test("student breadcrumbs preserve hierarchy and membership", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const scenarios = [
    ["/journey/n5?membership=lms", ["Perjalanan Level", "N5"], "/journey?membership=lms"],
    ["/learn/n5/chapter-1/video?membership=lms", ["Perjalanan Level", "N5", "Chapter 1", "Video Lesson"], "/journey?membership=lms"],
    ["/schedule/chapter-4?membership=sensei", ["Jadwal", "Chapter 4"], "/schedule?membership=sensei"],
    ["/replay/chapter-4?membership=sensei", ["Replay", "Chapter 4"], "/replay?membership=sensei"],
    ["/community/post-1?membership=lms", ["Diskusi Member", "Detail Diskusi"], "/community?membership=lms"],
    ["/community/create?membership=lms", ["Diskusi Member", "Buat Diskusi"], "/community"],
    ["/certificate/n5?membership=lms", ["Sertifikat", "N5"], "/certificate"],
    ["/renewal/membership?membership=free", ["Membership", "Detail Membership"], "/renewal"],
  ] as const;
  for (const [route, labels, parentHref] of scenarios) {
    await page.goto(route);
    const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(breadcrumb.locator("li")).toHaveCount(labels.length);
    await expect(breadcrumb.getByRole("link")).toHaveText(labels.slice(0, -1));
    await expect(breadcrumb.getByRole("link").first()).toHaveAttribute("href", parentHref);
    await expect(breadcrumb.locator("[aria-current='page']")).toHaveText(labels.at(-1)!);
  }
  await page.goto("/learn/n4/chapter-4/flashcards?membership=sensei");
  await expect(page.locator(".student-submenu a[aria-current='page']")).toHaveText("Kumpulan Flashcard");
});

test("mobile navigation preserves route action", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/dashboard?membership=lms");
  await page.getByRole("button", { name: "Buka navigasi", exact: true }).click();
  const mobileNav = page.locator("#student-mobile-panel").getByRole("navigation", { name: "Navigasi siswa", exact: true });
  const mobileGroup = mobileNav.locator(".student-nav-group").first();
  await mobileGroup.locator(".student-nav-parent").click({ force: true });
  await mobileGroup.locator(".student-submenu").getByRole("link", { name: "Perjalanan Level", exact: true }).click({ force: true });
  await expect(page).toHaveURL(/\/journey\?membership=lms/);
});
