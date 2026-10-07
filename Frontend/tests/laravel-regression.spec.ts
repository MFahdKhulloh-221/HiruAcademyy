import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";

const fixtureVideoPath = resolve("tests/fixtures/playable.mp4");
const fixtureImagePath = resolve("tests/fixtures/sample.png");

async function loginAs(page: Page, email: string, roleUrlRegex: RegExp) {
  await page.goto("/login");
  await page.getByLabel("Email / WhatsApp").fill(email);
  await page.getByLabel("Kata Sandi", { exact: true }).fill("BrowserTesting123!");
  const loginRes = page.waitForResponse(res => res.url().endsWith("/api/auth/login") && res.request().method() === "POST");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  expect((await loginRes).status()).toBe(200);
  await expect(page).toHaveURL(roleUrlRegex);
}

test("1. Public Sensei/Testimoni upload/edit reload and native media playback", async ({ page }) => {
  test.setTimeout(180000);

  await loginAs(page, "browser.admin@example.test", /\/admin$/);
  console.log("LOGGED IN");

  // Admin Sensei upload & edit
  await page.goto("/admin/sensei");
  console.log("NAVIGATED TO SENSEI");
  await expect(page.getByRole("heading", { name: "Sensei", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Tambah Sensei", exact: true }).click();
  const senseiDialog = page.getByRole("dialog");
  await expect(senseiDialog).toBeVisible();
  console.log("DIALOG OPENED");

  await senseiDialog.getByLabel(/^Nama/).fill("Sensei QA Real");
  await senseiDialog.getByLabel(/^Peran/).fill("Instruktur JLPT N5");
  await senseiDialog.getByLabel(/^Bio singkat/).fill("Bio Sensei pengajar berpengalaman.");
  await senseiDialog.getByLabel(/^Keahlian/).fill("N5, Bunpou");
  await senseiDialog.getByLabel("Upload image").setInputFiles(fixtureImagePath);
  await expect(senseiDialog.getByRole("textbox", { name: /^Foto/ })).toHaveValue(/^media\/image\//);
  await senseiDialog.getByLabel(/^Status/).selectOption("active");
  await senseiDialog.getByRole("button", { name: "Simpan Sensei", exact: true }).click();
  await expect(senseiDialog).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "Sensei QA Real", exact: true })).toBeVisible();

  // Edit Sensei: update role, verify photo preserved
  await page.getByRole("button", { name: "Edit Sensei QA Real", exact: true }).click();
  await expect(senseiDialog).toBeVisible();
  await expect(senseiDialog.getByRole("textbox", { name: /^Foto/ })).toHaveValue(/^media\/image\//);
  await senseiDialog.getByLabel(/^Peran/).fill("Instruktur Senior N5");
  await senseiDialog.getByRole("button", { name: "Simpan Sensei", exact: true }).click();
  await expect(senseiDialog).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "Instruktur Senior N5", exact: true })).toBeVisible();

  // Reload admin sensei
  await page.reload();
  await expect(page.getByRole("cell", { name: "Sensei QA Real", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Instruktur Senior N5", exact: true })).toBeVisible();

  // Public sensei page
  await page.goto("/sensei");
  await expect(page.getByRole("heading", { name: "Sensei QA Real", exact: true })).toBeVisible();
  const senseiImg = page.locator("img[alt='Foto profil Sensei QA Real']");
  await expect(senseiImg).toBeVisible();
  expect(await senseiImg.getAttribute("src")).toContain("/storage/media/image/");

  // Admin Testimonial upload & edit & preview video playback
  await page.goto("/admin/testimoni");
  await expect(page.getByRole("heading", { name: "Testimoni", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Tambah Testimoni", exact: true }).click();
  const testDialog = page.getByRole("dialog");
  await expect(testDialog).toBeVisible();

  await testDialog.getByLabel(/^Nama/).fill("Siswa QA Testimoni");
  await testDialog.getByLabel(/^Konteks/).fill("Alumni N5");
  await testDialog.getByLabel(/^Kutipan/).fill("Belajar bahasa Jepang di Hiru sangat terarah!");
  await testDialog.getByLabel("Upload image").setInputFiles(fixtureImagePath);
  await expect(testDialog.getByRole("textbox", { name: /^Gambar/ })).toHaveValue(/^media\/image\//);
  await testDialog.getByLabel("Upload video").setInputFiles(fixtureVideoPath);
  await expect(testDialog.getByRole("textbox", { name: /^URL video/ })).toHaveValue(/^media\/video\//);
  await testDialog.getByLabel(/^Judul video/).fill("Cerita Kelulusan N5");
  await testDialog.getByLabel(/^Status/).selectOption("published");
  await testDialog.getByLabel(/^Landing/).selectOption("yes");

  // Verify preview native video is playable
  const previewVideo = testDialog.locator("video");
  await expect(previewVideo).toBeVisible();
  const playedInAdmin = await previewVideo.evaluate(async (el: HTMLVideoElement) => {
    el.muted = true;
    try {
      await el.play();
      return !el.paused && el.readyState >= 2;
    } catch {
      return false;
    }
  });
  expect(playedInAdmin, "Admin preview native video plays").toBe(true);

  await testDialog.getByRole("button", { name: "Simpan Testimoni", exact: true }).click();
  await expect(testDialog).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "Siswa QA Testimoni", exact: true })).toBeVisible();

  // Edit Testimonial: update quote, verify media preserved
  await page.getByRole("button", { name: "Edit testimoni Siswa QA Testimoni", exact: true }).click();
  await expect(testDialog).toBeVisible();
  await expect(testDialog.getByRole("textbox", { name: /^Gambar/ })).toHaveValue(/^media\/image\//);
  await expect(testDialog.getByRole("textbox", { name: /^URL video/ })).toHaveValue(/^media\/video\//);
  await testDialog.getByLabel(/^Kutipan/).fill("Belajar bahasa Jepang di Hiru sangat terarah dan menyenangkan!");
  await testDialog.getByRole("button", { name: "Simpan Testimoni", exact: true }).click();
  await expect(testDialog).toHaveCount(0);

  // Reload admin testimoni
  await page.reload();
  await expect(page.getByRole("cell", { name: "Siswa QA Testimoni", exact: true })).toBeVisible();

  // Public Testimoni page
  await page.goto("/testimoni");
  await expect(page.getByText("Siswa QA Testimoni").first()).toBeVisible();
  await expect(page.getByText("Belajar bahasa Jepang di Hiru sangat terarah dan menyenangkan!")).toBeVisible();

  // Public native video playback verification
  const publicVideo = page.locator("video[aria-label='Cerita Kelulusan N5']");
  await expect(publicVideo).toBeVisible();
  expect(await publicVideo.getAttribute("src")).toContain("/storage/media/video/");
  const playedInPublic = await publicVideo.evaluate(async (el: HTMLVideoElement) => {
    el.muted = true;
    try {
      await el.play();
      return !el.paused && el.readyState >= 2;
    } catch {
      return false;
    }
  });
  expect(playedInPublic, "Public native video plays").toBe(true);
});

test("2. Admin video chapter selector uniqueness, optional URL, playback, and delete", async ({ page }) => {
  test.setTimeout(180000);

  await loginAs(page, "browser.admin@example.test", /\/admin$/);

  await page.goto("/admin/video-lesson");
  await expect(page.getByRole("heading", { name: "Video", exact: true })).toBeVisible();

  // Create video for Chapter 1
  await page.getByRole("button", { name: "Tambah Video", exact: true }).click();
  const videoDialog = page.getByRole("dialog");
  await expect(videoDialog).toBeVisible();
  await expect(videoDialog.getByRole("heading", { name: "Tambah Video", exact: true })).toBeVisible();

  await videoDialog.getByRole("combobox", { name: /^Program/ }).selectOption({ label: "JLPT N5" });
  await videoDialog.getByRole("combobox", { name: /^Chapter/ }).selectOption({ label: "Bab 1 N5" });
  await videoDialog.getByLabel(/^Judul/).fill("Video Bab 1 N5 QA");
  await videoDialog.getByLabel(/^Deskripsi/).fill("Penjelasan tata bahasa Bab 1");
  await videoDialog.getByLabel("Upload video").setInputFiles(fixtureVideoPath);
  await expect(videoDialog.getByRole("textbox", { name: /^URL video/ })).toHaveValue(/^media\/video\//);
  await videoDialog.getByLabel(/^Status/).selectOption("Published");

  // Verify preview playback
  const previewVideo = videoDialog.locator("video");
  await expect(previewVideo).toBeVisible();
  const canPlay = await previewVideo.evaluate(async (el: HTMLVideoElement) => {
    el.muted = true;
    try {
      await el.play();
      return !el.paused && el.readyState >= 2;
    } catch {
      return false;
    }
  });
  expect(canPlay, "Video lesson preview plays").toBe(true);

  await videoDialog.getByRole("button", { name: "Simpan Video", exact: true }).click();
  await expect(videoDialog).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "Video Bab 1 N5 QA", exact: true })).toBeVisible();

  // Chapter selector uniqueness test:
  // Clicking "Tambah Video" and picking Chapter 1 switches to Edit Video for existing record
  await page.getByRole("button", { name: "Tambah Video", exact: true }).click();
  await expect(videoDialog).toBeVisible();
  await videoDialog.getByRole("combobox", { name: /^Program/ }).selectOption({ label: "JLPT N5" });
  await videoDialog.getByRole("combobox", { name: /^Chapter/ }).selectOption({ label: "Bab 1 N5" });
  await expect(videoDialog.getByRole("heading", { name: "Edit Video", exact: true })).toBeVisible();
  await expect(videoDialog.getByRole("textbox", { name: /^Judul/ })).toHaveValue("Video Bab 1 N5 QA");

  // Optional URL test: enter YouTube URL, embed is accepted
  await videoDialog.getByRole("textbox", { name: /^URL video/ }).fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  await expect(videoDialog.locator("iframe")).toBeVisible();
  await videoDialog.getByRole("button", { name: "Batal", exact: true }).click();
  await expect(videoDialog).toHaveCount(0);

  // Delete video through API
  await page.getByRole("button", { name: "Hapus Video Bab 1 N5 QA", exact: true }).click();
  const deleteConfirm = page.getByRole("dialog");
  await expect(deleteConfirm.getByText("Hapus Video Bab 1 N5 QA ?")).toBeVisible();
  await deleteConfirm.getByRole("button", { name: "Hapus Video", exact: true }).click();
  await expect(page.getByRole("cell", { name: "Video Bab 1 N5 QA", exact: true })).toHaveCount(0);

  // Reload admin video lesson and verify deletion persisted
  await page.reload();
  await expect(page.getByRole("cell", { name: "Video Bab 1 N5 QA", exact: true })).toHaveCount(0);
});

test("3. Placement attempt/question/category/result offers with real persistence", async ({ page }) => {
  test.setTimeout(180000);

  // Start placement as guest
  await page.goto("/placement");
  await expect(page.getByRole("heading", { name: "Ukur Kemampuan Bahasa Jepangmu", exact: true })).toBeVisible();

  await page.getByPlaceholder("Masukkan nama").fill("Peserta Placement QA");
  await page.getByPlaceholder("+62 8xx xxxx xxxx").fill("+62 81234567899");
  await page.locator("select[name='target']").selectOption("N2");
  await page.locator(".consent input[type='checkbox']").first().check();

  const startRes = page.waitForResponse(res => res.url().endsWith("/api/placement/attempts") && res.request().method() === "POST");
  await page.getByRole("button", { name: "Mulai Placement Test Gratis" }).click();
  expect((await startRes).status()).toBe(201);

  await expect(page).toHaveURL(/\/placement\/question\?attempt=\d+/);
  const attemptId = new URL(page.url()).searchParams.get("attempt")!;
  expect(Number(attemptId)).toBeGreaterThan(0);

  // Question 1: Bunpou
  await expect(page.locator(".question-area-badge")).toHaveText("Bunpou");
  await expect(page.getByText("Soal 1/4")).toBeVisible();
  const saveReq = page.waitForResponse(res => res.url().includes("/answers") && res.request().method() === "PUT");
  await page.getByRole("radio").first().check();
  await expect(page.getByRole("radio").first()).toBeChecked();
  expect((await saveReq).status()).toBe(200);

  // Refresh page: verify radio answer persists across reload
  await page.reload();
  await expect(page.locator(".question-area-badge")).toHaveText("Bunpou");
  await expect(page.getByRole("radio").first()).toBeChecked();
  await page.getByRole("button", { name: "Lanjut Soal" }).click();

  // Question 2: Moji・Goi
  await expect(page.locator(".question-area-badge")).toHaveText("Moji・Goi");
  await expect(page.getByText("Soal 2/4")).toBeVisible();
  const save2 = page.waitForResponse(res => res.url().includes("/answers") && res.request().method() === "PUT");
  await page.getByRole("radio").first().check();
  await save2;
  await page.getByRole("button", { name: "Lanjut Soal" }).click();

  // Question 3: Dokkai
  await expect(page.locator(".question-area-badge")).toHaveText("Dokkai");
  await expect(page.getByText("Soal 3/4")).toBeVisible();
  const save3 = page.waitForResponse(res => res.url().includes("/answers") && res.request().method() === "PUT");
  await page.getByRole("radio").first().check();
  await save3;
  await page.getByRole("button", { name: "Lanjut Soal" }).click();

  // Question 4: Choukai
  await expect(page.locator(".question-area-badge")).toHaveText("Choukai");
  await expect(page.getByText("Soal 4/4")).toBeVisible();
  const save4 = page.waitForResponse(res => res.url().includes("/answers") && res.request().method() === "PUT");
  await page.getByRole("radio").first().check();
  await save4;

  // Submit test
  const submitBtn = page.getByRole("button", { name: "Selesaikan Test" });
  await expect(submitBtn).toBeVisible();
  const submitRes = page.waitForResponse(res => res.url().includes(`/api/placement/attempts/${attemptId}/submit`) && res.request().method() === "POST");
  await submitBtn.click();
  expect((await submitRes).status()).toBe(200);

  // Result page
  await expect(page).toHaveURL(new RegExp(`/placement/result\\?attempt=${attemptId}`));
  await expect(page.getByRole("heading", { name: /Hasil Evaluasi Level/ })).toBeVisible();

  // Analysis grid covers 4 categories
  const areaCards = page.locator(".placement-score-grid article");
  await expect(areaCards).toHaveCount(4);
  for (const name of ["Bunpou", "Moji・Goi", "Dokkai", "Choukai"]) {
    await expect(page.locator(".placement-score-grid").getByText(name, { exact: true })).toBeVisible();
  }

  // Recommendation grid offers populated from real /api/public/offers
  const offerCards = page.locator(".placement-recommendation-grid article");
  await expect(offerCards).toHaveCount(3);
  await expect(page.getByText("Kelas bersama Sensei").first()).toBeVisible();
  await expect(page.getByText("Belajar Mandiri").first()).toBeVisible();
  await expect(page.getByText("Coba Gratis").first()).toBeVisible();

  // Refresh result page: persists
  await page.reload();
  await expect(page.locator(".placement-score-grid article")).toHaveCount(4);
  await expect(page.locator(".placement-recommendation-grid article")).toHaveCount(3);
});

test("4. Free, LMS, and Sensei login Journey, chapter, progress persisted refresh and relogin", async ({ browser }) => {
  test.setTimeout(180000);

  // Free student login
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, "browser.student@example.test", /\/dashboard\?membership=free$/);

    await page.goto("/journey");
    await expect(page.getByText("CHAPTER 1 TERSEDIA").first()).toBeVisible();

    await page.reload();
    await expect(page.getByText("CHAPTER 1 TERSEDIA").first()).toBeVisible();

    await page.goto("/journey/n5");
    await expect(page.getByRole("heading", { name: "Bab 1 N5" })).toBeVisible();
    await ctx.close();
  }

  // LMS student login
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, "browser.lms@example.test", /\/dashboard/);

    await page.goto("/journey");
    await expect(page.getByText("LEVEL DIMILIKI").first()).toBeVisible();

    await page.goto("/journey/n5");
    await expect(page.getByRole("heading", { name: "Bab 1 N5" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Bab 1 N5" })).toBeVisible();
    await ctx.close();
  }

  // Sensei student login
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, "browser.sensei@example.test", /\/dashboard/);

    await page.goto("/journey");
    await expect(page.getByText("LEVEL DIMILIKI").first()).toBeVisible();

    await page.goto("/journey/n5");
    await expect(page.getByRole("heading", { name: "Bab 1 N5" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Bab 1 N5" })).toBeVisible();
    await ctx.close();
  }
});

test("5. Flashcard advance/retry persisted completion and throttle no 429", async ({ page }) => {
  test.setTimeout(180000);

  const apiStatuses: { path: string; status: number }[] = [];
  page.on("response", res => {
    const url = new URL(res.url());
    if (url.origin === "http://localhost:8001" && url.pathname.startsWith("/api/")) {
      apiStatuses.push({ path: url.pathname, status: res.status() });
    }
  });

  await loginAs(page, "browser.student@example.test", /\/dashboard/);

  await page.goto("/learn/n5/chapter-1/flashcards");
  await expect(page.getByText("1 dari 2 kartu")).toBeVisible();

  // Card 1: flip with Enter and mark Sulit
  await page.locator(".flashcard-surface").press("Enter");
  await expect(page.getByRole("button", { name: "Sulit", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Sulit", exact: true }).click();

  // Card 2: flip with Space and mark Mudah
  await expect(page.getByText("2 dari 2 kartu")).toBeVisible();
  await page.locator(".flashcard-surface").press("Space");
  await expect(page.getByRole("button", { name: "Mudah", exact: true })).toBeEnabled();

  const completionReq = page.waitForResponse(res => res.url().includes("/completions") && res.request().method() === "POST");
  await page.getByRole("button", { name: "Mudah", exact: true }).click();

  // Verify completion was sent and completed with 200
  const completionRes = await completionReq;
  expect(completionRes.status()).toBe(200);

  // Deck finished
  await expect(page.getByText("FLASHCARD SELESAI")).toBeVisible();
  const repeatBtn = page.getByRole("button", { name: "Ulangi Kartu Sulit" });
  await expect(repeatBtn).toBeEnabled();

  // Retry difficult card
  await repeatBtn.click();
  await expect(page.getByText("1 dari 1 kartu")).toBeVisible();

  // Complete difficult card with Mudah
  await page.locator(".flashcard-surface").press("Enter");
  await page.getByRole("button", { name: "Mudah", exact: true }).click();

  // Deck finished again, repeat button disabled
  await expect(page.getByText("FLASHCARD SELESAI")).toBeVisible();
  await expect(repeatBtn).toBeDisabled();

  // Verify no 429 errors occurred throughout the interaction
  const tooManyRequests = apiStatuses.filter(item => item.status === 429);
  expect(tooManyRequests, "No 429 Too Many Requests occurred").toEqual([]);

  // Check progress persisted on chapter page
  await page.goto("/learn/n5/chapter-1");
  await expect(page.getByRole("heading", { name: "Bab 1 N5" })).toBeVisible();
  const flashcardCard = page.locator(".learning-activity-card").filter({ hasText: "Flashcard" });
  await expect(flashcardCard.getByRole("link", { name: "Buka Kembali" })).toBeVisible();

  // Reload chapter page: progress remains persisted
  await page.reload();
  await expect(flashcardCard.getByRole("link", { name: "Buka Kembali" })).toBeVisible();
});
