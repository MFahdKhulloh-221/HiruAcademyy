import { expect, test, type Page } from "./canonical-fixture";

type Hero = {
  eyebrow: string;
  heading: string;
  support: string;
  primaryCtaLabel: string;
  primaryCtaPath: string;
  secondaryCtaLabel: string;
  secondaryCtaPath: string;
};

const approvedHero: Hero = {
  eyebrow: "BELAJAR JEPANG TERARAH",
  heading: "Belajar Jepang bersama Hiru",
  support: "Materi terstruktur untuk perjalanan belajar bahasa Jepang.",
  primaryCtaLabel: "Lihat program belajar",
  primaryCtaPath: "/program",
  secondaryCtaLabel: "Kenali Hiru",
  secondaryCtaPath: "/tentang",
};
const replacementHero: Hero = {
  eyebrow: "LANGKAH BARU BERSAMA HIRU",
  heading: "Mulai perjalanan Jepang pilihanmu",
  support: "Belajar rutin dengan materi dan latihan yang terarah.",
  primaryCtaLabel: "Jelajahi program Hiru",
  primaryCtaPath: "/program",
  secondaryCtaLabel: "Baca cerita Hiru",
  secondaryCtaPath: "/blog",
};

async function mockHeroApi(page: Page, published: Hero | null = approvedHero) {
  const state = {
    draft: null as Hero | null,
    published: published ? { ...published } : null,
    revision: 1,
    readStatus: 200,
    publicStatus: 200,
    saveStatus: 200,
    publishStatus: 200,
    saves: 0,
    publishes: 0,
    publicReads: 0,
  };
  await page.route("**/api/public/landing/hero", async route => {
    expect(route.request().method()).toBe("GET");
    state.publicReads++;
    await route.fulfill({ status: state.publicStatus, json: state.publicStatus === 200 ? { data: state.published } : { message: "Hero publik tidak tersedia." } });
  });
  await page.route("**/api/admin/landing/hero{,/**}", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET") {
      expect(path).toBe("/api/admin/landing/hero");
      await route.fulfill({ status: state.readStatus, json: state.readStatus === 200 ? { data: { draft: state.draft, published: state.published, revision: state.revision } } : { message: "Hero tidak tersedia." } });
      return;
    }
    const saving = path.endsWith("/draft");
    expect(path).toBe(`/api/admin/landing/hero/${saving ? "draft" : "publish"}`);
    expect(request.method()).toBe(saving ? "PATCH" : "POST");
    const body = request.postDataJSON();
    expect(Object.keys(body).sort()).toEqual(saving ? ["hero", "revision"] : ["revision"]);
    expect(body.revision).toBe(state.revision);
    if (saving) state.saves++;
    else state.publishes++;
    const status = saving ? state.saveStatus : state.publishStatus;
    if (status !== 200) {
      await route.fulfill({ status, json: { message: status === 409 ? "Hero telah diubah admin lain. Muat ulang halaman." : "Layanan Hero tidak tersedia." } });
      return;
    }
    if (saving) state.draft = { ...body.hero };
    else state.published = state.draft ? { ...state.draft } : state.published;
    state.revision++;
    await route.fulfill({ json: { data: { draft: state.draft, published: state.published, revision: state.revision } } });
  });
  return state;
}

const fieldLabels: Record<keyof Hero, string> = {
  eyebrow: "Eyebrow Hero",
  heading: "Judul Hero",
  support: "Deskripsi Hero",
  primaryCtaLabel: "Label CTA utama",
  primaryCtaPath: "Path CTA utama",
  secondaryCtaLabel: "Label CTA sekunder",
  secondaryCtaPath: "Path CTA sekunder",
};

async function fillHero(page: Page, hero: Hero) {
  for (const field of Object.keys(fieldLabels) as (keyof Hero)[]) {
    await page.getByRole("textbox", { name: fieldLabels[field], exact: true }).fill(hero[field]);
  }
}

async function expectPublicHero(page: Page, hero: Hero) {
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(hero.heading);
  const section = page.locator(".hero");
  await expect(section.getByText(hero.eyebrow, { exact: true })).toBeVisible();
  await expect(section.getByText(hero.support, { exact: true })).toBeVisible();
  await expect(section.getByRole("link", { name: hero.primaryCtaLabel, exact: true })).toHaveAttribute("href", hero.primaryCtaPath);
  await expect(section.getByRole("link", { name: hero.secondaryCtaLabel, exact: true })).toHaveAttribute("href", hero.secondaryCtaPath);
}

const saveButton = (page: Page) => page.getByRole("button", { name: "Simpan Draft Hero", exact: true });
const publishButton = (page: Page) => page.getByRole("button", { name: "Publikasikan Hero", exact: true });

test("#24: preview and saved draft persist across reload without publication; publish updates public Hero", async ({ page }) => {
  const state = await mockHeroApi(page);
  await page.goto("/");
  await expectPublicHero(page, approvedHero);
  await page.goto("/admin/landing-page");
  await expect(page.getByLabel(fieldLabels.heading)).toHaveValue(approvedHero.heading);
  await fillHero(page, replacementHero);
  const preview = page.getByRole("region", { name: "Pratinjau Hero", exact: true });
  await expect(preview).toBeVisible();
  await expect(preview.getByRole("heading", { name: replacementHero.heading, exact: true })).toBeVisible();
  await expect(preview.getByText(replacementHero.support, { exact: true })).toBeVisible();
  expect(state.saves).toBe(0);
  expect(state.publishes).toBe(0);
  await saveButton(page).click();
  await expect(page.getByRole("status").filter({ hasText: /berhasil disimpan/i })).toBeVisible();
  expect(state.draft).toEqual(replacementHero);
  expect(state.published).toEqual(approvedHero);
  expect(state.saves).toBe(1);
  await page.reload();
  for (const field of Object.keys(fieldLabels) as (keyof Hero)[]) {
    await expect(page.getByRole("textbox", { name: fieldLabels[field], exact: true })).toHaveValue(replacementHero[field]);
  }
  await page.goto("/");
  await expectPublicHero(page, approvedHero);
  await page.reload();
  await expectPublicHero(page, approvedHero);
  await page.goto("/admin/landing-page");
  await expect(page.getByLabel(fieldLabels.heading)).toHaveValue(replacementHero.heading);
  await publishButton(page).click();
  await expect(page.getByRole("status").filter({ hasText: /berhasil dipublikasikan/i })).toBeVisible();
  expect(state.publishes).toBe(1);
  expect(state.published).toEqual(replacementHero);
  await page.goto("/");
  await expectPublicHero(page, replacementHero);
  await page.reload();
  await expectPublicHero(page, replacementHero);
});

for (const operation of ["save", "publish"] as const) {
  for (const status of [503, 409]) {
    test(`#24: ${operation} HTTP ${status} shows error without success or public mutation`, async ({ page }) => {
      const state = await mockHeroApi(page);
      state.draft = { ...replacementHero };
      if (operation === "save") state.saveStatus = status;
      else state.publishStatus = status;
      await page.goto("/admin/landing-page");
      await expect(page.getByLabel(fieldLabels.heading)).toHaveValue(replacementHero.heading);
      if (operation === "save") await page.getByLabel(fieldLabels.heading).fill("Perubahan belum tersimpan");
      await (operation === "save" ? saveButton(page) : publishButton(page)).click();
      await expect(page.getByRole("region", { name: "Editor Hero", exact: true }).getByRole("alert")).toContainText(status === 409 ? /admin lain|muat ulang|konflik/i : "Permintaan belum berhasil. Silakan coba lagi.");
      await expect(page.getByRole("status").filter({ hasText: /berhasil disimpan|berhasil dipublikasikan/i })).toHaveCount(0);
      expect(operation === "save" ? state.saves : state.publishes).toBe(1);
      expect(state.published).toEqual(approvedHero);
      expect(state.draft).toEqual(replacementHero);
      await page.reload();
      await expect(page.getByLabel(fieldLabels.heading)).toHaveValue(replacementHero.heading);
      await page.goto("/");
      await expectPublicHero(page, approvedHero);
    });
  }
}

for (const status of [200, 503]) {
  test(`#24: public ${status === 200 ? "null" : "HTTP 503"} keeps approved fallback and usable CTA`, async ({ page }) => {
    const state = await mockHeroApi(page, null);
    state.publicStatus = status;
    await page.goto("/");
    await expect.poll(() => state.publicReads).toBeGreaterThan(0);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Belajar Bahasa Jepang Terarah dari Dasar sampai Siap JLPT");
    const hero = page.locator(".hero");
    await expect(hero.getByRole("link", { name: "Coba Gratis", exact: true })).toHaveAttribute("href", "/register");
    await expect(hero.getByRole("link", { name: "Lihat Program", exact: true })).toHaveAttribute("href", "/program");
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Belajar Bahasa Jepang Terarah dari Dasar sampai Siap JLPT");
  });
}

test("#24: public Hero retries HTTP 503 and replaces fallback with server content", async ({ page }) => {
  const state = await mockHeroApi(page, replacementHero);
  state.publicStatus = 503;
  await page.goto("/");
  await expect(page.getByRole("alert").filter({ hasText: "Hero gagal dimuat." })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Belajar Bahasa Jepang Terarah dari Dasar sampai Siap JLPT");
  const reads = state.publicReads;
  state.publicStatus = 200;
  await page.getByRole("button", { name: "Coba lagi Hero", exact: true }).click();
  await expectPublicHero(page, replacementHero);
  expect(state.publicReads).toBeGreaterThan(reads);
  await expect(page.getByRole("alert").filter({ hasText: "Hero gagal dimuat." })).toHaveCount(0);
});

test("#24: HTML payload in published Hero stays literal text, never executable markup", async ({ page }) => {
  const payload = '<img src=x onerror="window.__heroXss=true">';
  const unsafeHero = { ...approvedHero, eyebrow: payload, heading: payload, support: payload };
  await mockHeroApi(page, unsafeHero);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(payload);
  await expect(page.locator(".hero img")).toHaveCount(0);
  await expect(page.locator(".hero script")).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, "__heroXss"))).toBeUndefined();
});

test("#24: admin read HTTP 503 shows error and cannot save or publish fabricated state", async ({ page }) => {
  const state = await mockHeroApi(page);
  state.readStatus = 503;
  await page.goto("/admin/landing-page");
  await expect(page.getByRole("region", { name: "Editor Hero", exact: true }).getByRole("alert")).toContainText("Permintaan belum berhasil. Silakan coba lagi.");
  await expect(saveButton(page)).toHaveCount(0);
  await expect(publishButton(page)).toHaveCount(0);
  expect(state.saves).toBe(0);
  expect(state.publishes).toBe(0);
});

for (const path of ["javascript:alert(1)", "//evil.example", "/%2f/evil.example"]) {
  test(`#24: unsafe CTA path ${path} cannot be saved`, async ({ page }) => {
    const state = await mockHeroApi(page);
    await page.goto("/admin/landing-page");
    await expect(page.getByLabel(fieldLabels.heading)).toHaveValue(approvedHero.heading);
    await page.getByLabel(fieldLabels.primaryCtaPath, { exact: true }).fill(path);
    await expect(saveButton(page)).toBeDisabled();
    expect(state.saves).toBe(0);
    expect(state.published).toEqual(approvedHero);
  });
}

for (const width of [1440, 768, 390]) {
  test(`#24: Hero editor and public content fit ${width}px`, async ({ page }) => {
    await mockHeroApi(page, replacementHero);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin/landing-page");
    await expect(page.getByLabel(fieldLabels.heading)).toHaveValue(replacementHero.heading);
    await expect(saveButton(page)).toBeVisible();
    await expect(publishButton(page)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.goto("/");
    await expectPublicHero(page, replacementHero);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}
