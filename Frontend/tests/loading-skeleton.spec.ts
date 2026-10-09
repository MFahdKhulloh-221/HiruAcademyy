import { expect, test, type Page } from "@playwright/test";
import { gamificationFixture, leaderboardFixture } from "./canonical-fixture";

const article = { id: 91, slug: "skeleton-fixture", title: "Skeleton regression article", category: "JLPT", author: "Fixture Author", excerpt: "Local mocked content", thumbnail: null, featured: false, published_at: "2026-10-08T00:00:00Z" };

async function localOnly(page: Page) {
  const unexpected: string[] = [];
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) return route.fulfill({ body: "", contentType: url.hostname === "fonts.googleapis.com" ? "text/css" : "text/plain" });
    if (url.pathname === "/api/me") return route.fulfill({ status: 401, json: {} });
    if (url.pathname.startsWith("/api/")) {
      unexpected.push(url.pathname);
      return route.fulfill({ status: 501, json: {} });
    }
    return route.continue();
  });
  return unexpected;
}

function gate() {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  return { pending, release };
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 360, height: 800 }]) {
  test(`delayed API reveals cards skeleton then content without overflow ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const unexpected = await localOnly(page);
    const response = gate();
    await page.route("**/api/blog", async route => {
      await response.pending;
      await route.fulfill({ json: { data: [article] } });
    });
    try {
      await page.goto("/blog");
      const status = page.getByRole("status").filter({ hasText: "Memuat artikel…" });
      await expect(status).toHaveAttribute("aria-busy", "true");
      const shapes = status.locator('[aria-hidden="true"]');
      await expect(shapes).toHaveCSS("animation-delay", "0.18s");
      await expect(shapes).toHaveCSS("opacity", "1");
      await expect(shapes.locator(':scope > div:last-child > div')).toHaveCount(3);
      await expect(page.getByRole("heading", { name: article.title })).toHaveCount(0);
      await noOverflow(page);
      await page.screenshot({ path: test.info().outputPath(`skeleton-${viewport.width}.png`), fullPage: true });
      response.release();
      await expect(page.getByRole("heading", { name: article.title, exact: true })).toBeVisible();
      await expect(status).toHaveCount(0);
      await noOverflow(page);
      expect(unexpected).toEqual([]);
    } finally {
      response.release();
    }
  });
}

test("fast mocked API never paints visible skeleton shapes", async ({ page }) => {
  const unexpected = await localOnly(page);
  await page.addInitScript(() => {
    const evidence = { samples: 0, visible: false };
    Object.assign(window, { skeletonEvidence: evidence });
    const sample = () => {
      document.querySelectorAll('[role="status"][aria-busy="true"] > [aria-hidden="true"]').forEach(node => {
        evidence.samples += 1;
        if (Number(getComputedStyle(node).opacity) > 0) evidence.visible = true;
      });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.route("**/api/blog", route => route.fulfill({ json: { data: [article] } }));
  await page.goto("/blog");
  await expect(page.getByRole("heading", { name: article.title, exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Memuat artikel…" })).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { skeletonEvidence?: { visible: boolean } }).skeletonEvidence?.visible)).toBe(false);
  expect(unexpected).toEqual([]);
});

test("API error removes skeleton and Retry restores delayed loading then content", async ({ page }) => {
  const unexpected = await localOnly(page);
  const response = gate();
  let calls = 0;
  await page.route("**/api/blog", async route => {
    calls += 1;
    if (calls === 1) return route.fulfill({ status: 503, json: { message: "Fixture unavailable" } });
    await response.pending;
    await route.fulfill({ json: { data: [article] } });
  });
  try {
    await page.goto("/blog");
    await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Memuat artikel…" })).toHaveCount(0);
    await page.getByRole("button", { name: "Coba lagi", exact: true }).click();
    const status = page.getByRole("status").filter({ hasText: "Memuat artikel…" });
    await expect(status.locator('[aria-hidden="true"]')).toHaveCSS("opacity", "1");
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    response.release();
    await expect(page.getByRole("heading", { name: article.title, exact: true })).toBeVisible();
    await expect(status).toHaveCount(0);
    expect(calls).toBe(2);
    expect(unexpected).toEqual([]);
  } finally {
    response.release();
  }
});

test("article path changes clear previous content and errors while delayed requests load", async ({ page }) => {
  const unexpected = await localOnly(page);
  const second = gate();
  const third = gate();
  const nextArticle = { ...article, id: 92, slug: "next-fixture", title: "Next regression article", body: "Next content" };
  await page.route("**/api/blog/skeleton-fixture", route => route.fulfill({ json: { data: { ...article, body: "Initial content" } } }));
  await page.route("**/api/blog/unavailable-fixture", async route => {
    await second.pending;
    await route.fulfill({ status: 503, json: { message: "Previous resource unavailable" } });
  });
  await page.route("**/api/blog/next-fixture", async route => {
    await third.pending;
    await route.fulfill({ json: { data: nextArticle } });
  });
  try {
    await page.goto("/blog/article?slug=skeleton-fixture");
    await expect(page.getByRole("heading", { name: article.title, exact: true })).toBeVisible();
    await page.evaluate(() => window.history.pushState(null, "", "/blog/article?slug=unavailable-fixture"));
    const status = page.getByRole("status").filter({ hasText: "Memuat artikel…" });
    await expect(status).toHaveAttribute("aria-busy", "true");
    await expect(page.getByRole("heading", { name: article.title, exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Artikel Tidak Ditemukan", exact: true })).toHaveCount(0);
    second.release();
    await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
    await page.evaluate(() => window.history.pushState(null, "", "/blog/article?slug=next-fixture"));
    await expect(status).toHaveAttribute("aria-busy", "true");
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    third.release();
    await expect(page.getByRole("heading", { name: nextArticle.title, exact: true })).toBeVisible();
    await expect(status).toHaveCount(0);
    expect(unexpected).toEqual([]);
  } finally {
    second.release();
    third.release();
  }
});

const privateUser = { id: 901, name: "Skeleton Private User", email: "skeleton-private@example.test", whatsapp: "081234567890", role: "student", account_status: "active" };

async function studentFixtures(page: Page) {
  const access = { learning: { n5: "full" }, replay_levels: [], source_grants: [{ plan_code: "lms", program_code: "n5" }] };
  await page.route("**/api/public/programs", route => route.fulfill({ json: { data: [] } }));
  await page.route("**/api/student/access", route => route.fulfill({ json: { data: access } }));
  await page.route("**/api/student/dashboard", route => route.fulfill({ json: { data: { programs: [], access, chapters: [] } } }));
  await page.route("**/api/student/gamification", route => route.fulfill({ json: { data: gamificationFixture } }));
  await page.route("**/api/student/leaderboard?scope=all", route => route.fulfill({ json: { data: leaderboardFixture() } }));
}

for (const width of [1440, 360]) {
  for (const path of ["/dashboard", "/profile"]) {
    test(`student auth skeleton preserves ${path} geometry and hides identity ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 360 ? 800 : 1000 });
      const unexpected = await localOnly(page);
      await studentFixtures(page);
      const auth = gate();
      await page.route("**/api/me", async route => {
        await auth.pending;
        await route.fulfill({ json: { data: privateUser } });
      });
      try {
        await page.goto(path);
        const status = page.getByRole("status").filter({ hasText: "Memuat..." });
        await expect(status).toHaveAttribute("aria-busy", "true");
        await expect(status.locator('[aria-hidden="true"]')).toHaveCSS("opacity", "1");
        await expect(page.getByText(privateUser.name, { exact: true })).toHaveCount(0);
        await expect(page.getByText(privateUser.email, { exact: true })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Keluar", exact: true })).toHaveCount(0);
        const loading = await page.getByRole("main").boundingBox();
        expect(loading).not.toBeNull();
        expect(loading!.x).toBeGreaterThanOrEqual(0);
        expect(loading!.x + loading!.width).toBeLessThanOrEqual(width + 1);
        await noOverflow(page);
        await page.screenshot({ path: test.info().outputPath(`student-${path.slice(1)}-${width}.png`), fullPage: true });
        auth.release();
        await expect(page.getByRole("heading", { name: path === "/profile" ? privateUser.name : new RegExp(`Halo, ${privateUser.name}`), exact: path === "/profile" })).toBeVisible();
        await expect(status).toHaveCount(0);
        const loaded = await page.getByRole("main").boundingBox();
        expect(loaded).not.toBeNull();
        expect(Math.abs(loaded!.x - loading!.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(loaded!.width - loading!.width)).toBeLessThanOrEqual(1);
        await noOverflow(page);
        expect(unexpected).toEqual([]);
      } finally {
        auth.release();
      }
    });
  }
}

test("admin auth delay hides private dashboard data then table skeleton replaces rows", async ({ page }) => {
  const unexpected = await localOnly(page);
  const auth = gate();
  const rows = gate();
  let calls = 0;
  await page.route("**/api/me", async route => {
    await auth.pending;
    await route.fulfill({ json: { data: { ...privateUser, role: "admin" } } });
  });
  await page.route("**/api/admin/users?include=effective_access", async route => {
    calls += 1;
    await rows.pending;
    await route.fulfill({ json: { data: [{ ...privateUser, effective_access: { source_grants: [] } }] } });
  });
  try {
    await page.goto("/admin");
    const status = page.getByRole("status").filter({ hasText: "Memuat..." });
    await expect(status.locator('[aria-hidden="true"]')).toHaveCSS("opacity", "1");
    await expect(page.getByRole("heading", { name: "Dashboard Admin", exact: true })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Navigasi admin" })).toHaveCount(0);
    await expect(page.getByText(privateUser.email, { exact: true })).toHaveCount(0);
    expect(calls).toBe(0);
    await noOverflow(page);
    await page.screenshot({ path: test.info().outputPath("admin-auth.png"), fullPage: true });
    auth.release();
    await expect(page.getByRole("heading", { name: "Dashboard Admin", exact: true })).toBeVisible();
    await expect.poll(() => calls).toBe(1);
    await expect(status.locator('[aria-hidden="true"]')).toHaveCSS("opacity", "1");
    await expect(status.locator('[aria-hidden="true"] > div:last-child > div')).toHaveCount(5);
    await expect(page.getByRole("cell", { name: privateUser.email, exact: true })).toHaveCount(0);
    await noOverflow(page);
    await page.screenshot({ path: test.info().outputPath("admin-table.png"), fullPage: true });
    rows.release();
    await expect(page.getByRole("cell", { name: privateUser.email, exact: true })).toBeVisible();
    await expect(status).toHaveCount(0);
    await noOverflow(page);
    expect(unexpected).toEqual([]);
  } finally {
    auth.release();
    rows.release();
  }
});

test("student auth error Retry hides private profile until delayed verification succeeds", async ({ page }) => {
  const unexpected = await localOnly(page);
  await studentFixtures(page);
  const auth = gate();
  let calls = 0;
  await page.route("**/api/me", async route => {
    calls += 1;
    if (calls === 1) return route.fulfill({ status: 503, json: {} });
    await auth.pending;
    await route.fulfill({ json: { data: privateUser } });
  });
  try {
    await page.goto("/profile");
    await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
    await expect(page.getByText(privateUser.email, { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Coba Lagi", exact: true }).click();
    const status = page.getByRole("status").filter({ hasText: "Memuat..." });
    await expect(status.locator('[aria-hidden="true"]')).toHaveCSS("opacity", "1");
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    await expect(page.getByText(privateUser.email, { exact: true })).toHaveCount(0);
    auth.release();
    await expect(page.getByRole("heading", { name: privateUser.name, exact: true })).toBeVisible();
    await expect(status).toHaveCount(0);
    expect(calls).toBe(2);
    expect(unexpected).toEqual([]);
  } finally {
    auth.release();
  }
});

test("reduced motion keeps delayed reveal but disables skeleton pulse", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await localOnly(page);
  const response = gate();
  await page.route("**/api/blog", async route => {
    await response.pending;
    await route.fulfill({ json: { data: [article] } });
  });
  try {
    await page.goto("/blog");
    const shapes = page.getByRole("status").filter({ hasText: "Memuat artikel…" }).locator('[aria-hidden="true"]');
    await expect(shapes).toHaveCSS("animation-delay", "0.18s");
    await expect(shapes).toHaveCSS("opacity", "1");
    await expect(shapes.locator("span").first()).toHaveCSS("animation-name", "none");
    response.release();
    await expect(page.getByRole("heading", { name: article.title, exact: true })).toBeVisible();
  } finally {
    response.release();
  }
});
