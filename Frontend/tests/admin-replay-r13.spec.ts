import { expect, test } from "./canonical-fixture";

for (const width of [390, 1440]) test(`R13 live and replay API operations ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.addInitScript(() => localStorage.setItem("r13-old-replay", "keep local data"));
  let playlists: Record<string, unknown>[] = [];
  let videos: Record<string, unknown>[] = [];
  const calls: { path: string; method: string; body?: Record<string, unknown> }[] = [];
  let failLoad = false;
  let failDelete = false;
  let release!: () => void;
  let pending: Promise<void> | undefined = new Promise(resolve => { release = resolve; });
  await page.route("**/api/admin/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (!/replay-playlists|replay-videos|class-schedules/.test(path)) return route.fallback();
    const body = ["POST", "PATCH"].includes(method) ? route.request().postDataJSON() : undefined;
    calls.push({ path, method, body });
    if (path.includes("class-schedules")) return route.fulfill({ json: { data: [] } });
    if (method === "GET") {
      await pending;
      if (failLoad) return route.fulfill({ status: 503, json: {} });
      return route.fulfill({ json: { data: path.includes("playlists") ? playlists : videos } });
    }
    if (method === "DELETE" && failDelete) return route.fulfill({ status: 503, json: {} });
    const rows = path.includes("playlists") ? playlists : videos;
    const id = Number(path.split("/").at(-1));
    if (method === "POST") rows.push({ id: path.includes("playlists") ? 7 : 9, ...body });
    if (method === "PATCH") Object.assign(rows.find(row => row.id === id)!, body);
    if (method === "DELETE") {
      if (path.includes("playlists")) playlists = rows.filter(row => row.id !== id);
      else videos = rows.filter(row => row.id !== id);
    }
    return route.fulfill({ json: { data: rows.at(-1) || {} } });
  });
  await page.goto("/admin/kelas-jadwal");
  await expect(page.getByRole("heading", { name: "Jadwal Live", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Replay", exact: true })).toHaveCount(0);
  expect(calls.some(call => call.path.includes("replay-"))).toBe(false);
  await page.getByRole("button", { name: "Tambah Jadwal Live", exact: true }).click();
  await expect(page.getByRole("dialog").getByLabel("URL Zoom", { exact: true })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Batal", exact: true }).click();
  if (width < 1024) await page.getByRole("button", { name: "Buka navigasi admin", exact: true }).click();
  const nav = page.getByRole("navigation", { name: "Navigasi admin" });
  await expect(nav.getByRole("link", { name: "Jadwal Live", exact: true })).toHaveAttribute("href", "/admin/kelas-jadwal");
  await nav.getByRole("link", { name: "Replay Rekaman", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Replay Rekaman", exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Memuat" }).first()).toBeVisible();
  release(); pending = undefined;
  await expect(page.getByRole("heading", { name: "Playlist", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Belum ada data", exact: true }).first()).toBeVisible();
  const storage = await page.evaluate(() => JSON.stringify(localStorage));
  await page.getByRole("button", { name: "Tambah Playlist", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Judul", { exact: true }).fill("Playlist API");
  await dialog.getByRole("combobox", { name: /^Program/ }).selectOption("1");
  await dialog.getByLabel("Urutan", { exact: true }).fill("2");
  await dialog.getByRole("combobox", { name: /^Status/ }).selectOption("published");
  await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
  const playlistRow = page.getByRole("row").filter({ hasText: "Playlist API" });
  await expect(playlistRow).toBeVisible();
  await playlistRow.getByRole("button", { name: "Edit", exact: true }).click();
  await dialog.getByLabel("Urutan", { exact: true }).fill("3");
  await dialog.getByRole("combobox", { name: /^Status/ }).selectOption("draft");
  await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Tambah Replay", exact: true }).click();
  await dialog.getByLabel("Judul", { exact: true }).fill("Video API");
  await dialog.getByRole("combobox", { name: /^Program/ }).selectOption("N5");
  await dialog.getByLabel("Chapter / Sesi", { exact: true }).fill("Chapter 2");
  await dialog.getByLabel("Tanggal", { exact: true }).fill("2026-11-03");
  await dialog.getByLabel("Sensei", { exact: true }).fill("Sensei Uji");
  await dialog.getByRole("combobox", { name: /^Playlist/ }).selectOption("7");
  await dialog.getByLabel("URL video (HTTP/HTTPS)", { exact: true }).fill("https://example.test/video.mp4");
  await dialog.getByLabel("Urutan", { exact: true }).fill("4");
  await dialog.getByRole("combobox", { name: /^Status/ }).selectOption("Published");
  await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit Video API", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit Video API", exact: true }).click();
  await dialog.getByLabel("Urutan", { exact: true }).fill("5");
  await dialog.getByRole("combobox", { name: /^Status/ }).selectOption("Draft");
  await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Lihat Video API", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Video API", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  failDelete = true;
  await page.getByRole("button", { name: "Hapus Video API", exact: true }).click();
  await dialog.getByRole("button", { name: "Hapus", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Permintaan belum berhasil" })).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Video API", exact: true })).toHaveCount(1);
  failDelete = false;
  await dialog.getByRole("button", { name: "Hapus", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit Video API", exact: true })).toHaveCount(0);
  await playlistRow.getByRole("button", { name: "Hapus", exact: true }).click();
  await dialog.getByRole("button", { name: "Hapus", exact: true }).click();
  await expect(playlistRow).toHaveCount(0);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(storage);
  expect(calls).toEqual(expect.arrayContaining([
    expect.objectContaining({ path: "/api/admin/replay-playlists", method: "POST" }),
    expect.objectContaining({ path: "/api/admin/replay-playlists/7", method: "PATCH", body: expect.objectContaining({ sort_order: 3, status: "draft" }) }),
    expect.objectContaining({ path: "/api/admin/replay-videos", method: "POST", body: expect.objectContaining({ replay_playlist_id: 7, status: "published" }) }),
    expect.objectContaining({ path: "/api/admin/replay-videos/9", method: "PATCH", body: expect.objectContaining({ sort_order: 5, status: "draft" }) }),
    expect.objectContaining({ path: "/api/admin/replay-videos/9", method: "DELETE" }),
    expect.objectContaining({ path: "/api/admin/replay-playlists/7", method: "DELETE" }),
  ]));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  failLoad = true;
  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: "Permintaan belum berhasil" })).toBeVisible();
  failLoad = false;
  await page.getByRole("button", { name: "Coba Lagi", exact: true }).click();
  await expect(page.getByRole("button", { name: "Tambah Playlist", exact: true })).toBeEnabled();
});
