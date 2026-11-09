import { expect, test } from "./canonical-fixture";

for (const width of [390, 768, 1440]) test(`R12 replay keeps Journey navigation ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const program = { id: 17, code: "n5", name: "JLPT N5", family: "jlpt" };
  const playlist = { id: 27, program_id: 17, program, title: "Playlist Uji", description: "Rekaman kelas", status: "published", sort_order: 0, videos: [1, 2].map(id => ({ id, replay_playlist_id: 27, title: `Video ${id}`, video_url: `https://media.example.test/${id}.mp4`, status: "published", sort_order: id })) };
  await page.route("https://media.example.test/**", route => route.fulfill({ contentType: "video/mp4", body: "" }));
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/student/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const reply = (data: unknown) => route.fulfill({ json: { data } });
    if (path.endsWith("/dashboard")) return reply({ programs: [program], access: { learning: { n5: "full" }, replay_levels: ["n5"], source_grants: [{ plan_code: "sensei", program_code: "n5" }] }, chapters: [] });
    if (path.endsWith("/replays")) return reply([playlist]);
    if (path.endsWith("/replay-playlists/27")) { await pending; return reply(playlist); }
    return route.fallback();
  });
  await page.goto("/journey");
  const header = page.locator(".journey-topbar");
  await expect(header.getByRole("button", { name: "Profil akun", exact: true })).toBeVisible();
  const metrics = () => header.evaluate(element => {
    const style = getComputedStyle(element);
    return { height: element.getBoundingClientRect().height, padding: style.padding, background: style.backgroundColor, border: style.borderBottomColor };
  });
  const journey = await metrics();
  const sidebar = page.locator(width < 1024 ? "#student-mobile-panel" : ".student-nav-desktop");
  if (width < 1024) await page.getByRole("button", { name: "Buka navigasi", exact: true }).click();
  await expect(sidebar.getByRole("button", { name: "Kelas Saya", exact: true })).toHaveAttribute("aria-expanded", "true");
  await sidebar.getByRole("link", { name: "Replay", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Rekaman Sesi Kelas Bersama Sensei", exact: true })).toBeVisible();
  expect(await metrics()).toEqual(journey);
  if (width < 1024) {
    const trigger = page.getByRole("button", { name: "Buka navigasi", exact: true });
    const triggerBox = await trigger.boundingBox();
    const backBox = await header.getByRole("link", { name: "← Dashboard", exact: true }).boundingBox();
    expect(triggerBox!.x + triggerBox!.width).toBeLessThanOrEqual(backBox!.x);
    await trigger.click();
  }
  await expect(sidebar.getByRole("link", { name: "Replay", exact: true })).toHaveAttribute("aria-current", "page");
  if (width < 1024) await page.keyboard.press("Escape");
  await header.evaluate(element => element.setAttribute("data-r12-persistent", "true"));
  await page.getByRole("link", { name: "Tonton Replay : Playlist Uji", exact: true }).first().click();
  await expect(page).toHaveURL(/\/replay\/chapter-4\?id=27/);
  await expect(page.locator('[data-r12-persistent="true"]')).toBeVisible();
  expect(await metrics()).toEqual(journey);
  release();
  await expect(page.getByRole("heading", { name: "Video 1", exact: true })).toBeVisible();
  await expect(page.locator('[data-r12-persistent="true"]')).toBeVisible();
  await page.getByRole("button", { name: /^Video 2/ }).click();
  await expect(page.getByRole("heading", { name: "Video 2", exact: true })).toBeVisible();
  await expect(page.locator('[data-r12-persistent="true"]')).toBeVisible();
  await expect(page.locator(".sensei-topbar")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (width < 1024) await page.getByRole("button", { name: "Buka navigasi", exact: true }).click();
  await expect(sidebar.getByRole("link", { name: "Replay", exact: true })).toHaveAttribute("aria-current", "page");
  if (width < 1024) await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Kembali ke Replay", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Rekaman Sesi Kelas Bersama Sensei", exact: true })).toBeVisible();
  await expect(page.locator('[data-r12-persistent="true"]')).toBeVisible();
  expect(await metrics()).toEqual(journey);
});
