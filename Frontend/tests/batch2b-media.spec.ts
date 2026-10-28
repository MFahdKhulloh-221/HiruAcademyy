import { expect, test } from "@playwright/test";

for (const width of [1440, 768, 390]) {
  test(`empty modules and replay playlist ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    let empty = false;
    let denied = false;
    let mediaStatus = 200;
    let playlistStatus = 200;
    let missingVideo = false;
    let mediaRequests = 0;
    const videos = [1, 2].map(id => ({ id, title: `Rekaman ${id}`, video_url: `https://media.example.test/video${id}.mp4`, sort_order: id, chapter: "1", session: String(id) }));
    await page.route("https://media.example.test/**", route => {
      mediaRequests++;
      return mediaStatus === 200
        ? route.fulfill({ contentType: "video/mp4", path: "tests/fixtures/playable.mp4" })
        : route.fulfill({ status: mediaStatus, body: "" });
    });
    await page.route(/\/api\//, async route => {
      const path = new URL(route.request().url()).pathname;
      expect(route.request().method()).toBe("GET");
      const reply = (data: unknown) => route.fulfill({ json: { data } });
      if (path === "/api/me") return reply({ id: 72, name: "Student", email: "student@example.test", whatsapp: "081234567890", role: "student", account_status: "active" });
      if (path === "/api/student/access") return reply({ learning: { n5: "full" }, replay_levels: ["n5"], source_grants: [{ plan_code: "sensei", program_code: "n5" }] });
      if (path === "/api/student/dashboard") return reply({ programs: [{ id: 1, code: "n5", name: "JLPT N5", family: "jlpt" }], access: { learning: { n5: "full" }, replay_levels: ["n5"], source_grants: [{ plan_code: "sensei", program_code: "n5" }] }, chapters: [] });
      const chapter = { id: 11, chapter_number: 1, title: "Chapter Satu", access: "full", modules: [] };
      if (path.endsWith("/chapters")) return reply([chapter]);
      if (path.endsWith("/chapters/11")) return reply(chapter);
      if (path.endsWith("/progress")) return reply({ chapter_id: 11, activities: {}, mini_unlocked: false });
      if (path.includes("replay-playlists")) {
        if (denied || playlistStatus !== 200) return route.fulfill({ status: denied ? 403 : playlistStatus, json: {} });
        return reply({ id: 5, title: "Playlist Kelas N5", program: { code: "n5", name: "JLPT N5" }, videos: empty ? [] : missingVideo ? [{ ...videos[0], video_url: null }] : videos });
      }
      return reply([]);
    });
    for (const kind of ["kanji", "grammar"]) {
      await page.goto(`/learn/n5/chapter-1/${kind}`);
      await expect(page.getByRole("heading", { name: "Belum ada materi", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "Kembali ke Aktivitas Chapter", exact: true })).toHaveAttribute("href", "/learn/n5/chapter-1");
    }
    await page.goto("/replay/chapter-4?id=5");
    await expect(page.getByRole("heading", { name: "Playlist Kelas N5", exact: true })).toBeVisible();
    const markers = page.locator(".replay-markers");
    await expect(markers.getByRole("button")).toHaveCount(2);
    await expect(markers.getByRole("button").first()).toContainText("Rekaman 1");
    await markers.getByRole("button", { name: /Rekaman 2/ }).click();
    await expect(markers.getByRole("button", { name: /Rekaman 2/ })).toHaveAttribute("aria-pressed", "true");
    const video = page.locator("video");
    await expect(video).toHaveAttribute("src", videos[1].video_url);
    await expect(page.getByRole("heading", { name: "Rekaman 2", exact: true })).toBeVisible();
    await expect(page.locator(".batch3-metadata")).toContainText("Sesi 2");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect.poll(() => video.evaluate(el => (el as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(2);
    await video.evaluate(el => (el as HTMLVideoElement).play());
    await expect.poll(() => video.evaluate(el => (el as HTMLVideoElement).paused)).toBe(false);
    await video.evaluate(el => (el as HTMLVideoElement).pause());
    await video.dispatchEvent("error");
    const failed = page.getByRole("heading", { name: "Video gagal dimuat", exact: true });
    const retry = page.getByRole("button", { name: "Coba Lagi Video", exact: true });
    await expect(failed).toBeVisible();
    mediaStatus = 403;
    const beforeRetry = mediaRequests;
    await retry.click();
    await expect.poll(() => mediaRequests).toBeGreaterThan(beforeRetry);
    await expect(failed).toBeVisible();
    mediaStatus = 200;
    await retry.click();
    await expect.poll(() => video.evaluate(el => (el as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(2);
    await video.evaluate(el => (el as HTMLVideoElement).play());
    await expect.poll(() => video.evaluate(el => (el as HTMLVideoElement).paused)).toBe(false);
    await video.evaluate(el => (el as HTMLVideoElement).pause());
    await expect(failed).toHaveCount(0);
    await expect(markers.getByRole("button", { name: /Rekaman 2/ })).toHaveAttribute("aria-pressed", "true");
    mediaStatus = 404;
    await markers.getByRole("button", { name: /Rekaman 1/ }).click();
    await expect(failed).toBeVisible();
    missingVideo = true;
    await page.reload();
    await expect(page.getByRole("heading", { name: "Replay sedang diproses", exact: true })).toBeVisible();
    await expect(video).toHaveCount(0);
    playlistStatus = 503;
    await page.reload();
    await expect(page.getByRole("button", { name: "Coba Lagi", exact: true })).toBeVisible();
    playlistStatus = 200;
    missingVideo = false;
    expect(new URL(page.url()).searchParams.get("id")).toBe("5");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    empty = true;
    await page.reload();
    await expect(page.getByRole("heading", { name: "Replay sedang diproses", exact: true })).toBeVisible();
    denied = true;
    await page.reload();
    await expect(page.getByRole("button", { name: "Coba Lagi", exact: true })).toBeVisible();
    await expect(page.locator("video, iframe")).toHaveCount(0);
  });
}
