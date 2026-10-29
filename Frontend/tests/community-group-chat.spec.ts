import { expect, test, type Page, type Route } from "@playwright/test";

const topics = [{ id: 1, slug: "kerja", title: "Kerja Jepang", description: "Ruang kerja", threads_count: 0 }, { id: 2, slug: "belajar", title: "Belajar", description: "Ruang belajar", threads_count: 0 }, { id: 3, slug: "tanya-sensei", title: "Tanya Sensei", description: "Terpisah", threads_count: 0 }];
const message = (id: number, room = 1, own = false) => ({ id, room_id: room, client_message_id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`, content: `Pesan ${room}-${id}`, status: "published", author: { id: own ? 9 : 10, name: own ? "Siswa" : "Teman", is_sensei: false }, created_at: "2026-10-28T01:30:00Z" });

type State = { rows: ReturnType<typeof message>[]; posts: { client_message_id: string; content: string }[]; failure: number; loseResponse: boolean; hold?: Route; holdRoom: boolean; reads: number; userId: number; pageSize: number; holdHistory: boolean; heldHistory?: { route: Route; json: unknown; headers: Record<string, string> } };
async function setup(page: Page, plan = "lms") {
  const state: State = { rows: [message(1), message(2, 1, true), message(3, 2)], posts: [], failure: 0, loseResponse: false, holdRoom: false, reads: 0, userId: 9, pageSize: 2, holdHistory: false };
  await page.route(/\/(api\/|sanctum\/csrf-cookie)/, async route => {
    const url = new URL(route.request().url());
    const headers = { "access-control-allow-origin": route.request().headers().origin ?? "http://localhost:3000", "access-control-allow-credentials": "true", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "accept, content-type, x-xsrf-token" };
    const reply = (data: unknown) => route.fulfill({ headers, json: { data } });
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (url.pathname === "/sanctum/csrf-cookie") {
      await page.context().addCookies([{ name: "XSRF-TOKEN", value: "chat-test-csrf", url: page.url() }]);
      return route.fulfill({ status: 204, headers });
    }
    if (url.pathname === "/api/me") return reply({ id: state.userId, name: "Siswa", email: "student@example.test", whatsapp: "628123456789", role: "student", account_status: "active" });
    if (url.pathname === "/api/student/dashboard") return reply({ programs: [], access: { learning: {}, replay_levels: [], source_grants: plan === "free" ? [] : [{ plan_code: plan, program_code: "n5" }] } });
    if (url.pathname === "/api/community/topics") return reply(topics);
    const room = /topics\/(\d+)\/room$/.exec(url.pathname);
    if (room) {
      if (state.holdRoom && room[1] === "1") { state.hold = route; return; }
      return reply({ id: Number(room[1]), topic_id: Number(room[1]), topic_slug: topics[Number(room[1]) - 1].slug });
    }
    const history = /rooms\/(\d+)\/messages$/.exec(url.pathname);
    if (history) {
      const id = Number(history[1]);
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON(); state.posts.push(body);
        if (state.failure) return route.fulfill({ status: state.failure, headers, json: { message: "Ditolak" } });
        let saved = state.rows.find(row => row.room_id === id && row.client_message_id === body.client_message_id);
        if (!saved) { saved = { ...message(100 + state.posts.length, id, true), client_message_id: body.client_message_id, content: body.content }; state.rows.push(saved); }
        if (state.loseResponse) { state.loseResponse = false; return route.abort("failed"); }
        return reply(saved);
      }
      state.reads++;
      const before = Number(url.searchParams.get("before") ?? Infinity);
      const rows = state.rows.filter(row => row.room_id === id && row.status === "published" && row.id < before).sort((a, b) => a.id - b.id);
      const data = rows.slice(-state.pageSize);
      const json = { data, meta: { has_more: rows.length > state.pageSize, before: data[0]?.id ?? null, after: data.at(-1)?.id ?? 0, requires_history_refresh: true } };
      if (state.holdHistory) { state.holdHistory = false; state.heldHistory = { route, json: structuredClone(json), headers }; return; }
      return route.fulfill({ headers, json });
    }
    return reply([]);
  });
  await page.goto("/community");
  return state;
}

for (const width of [1440, 768, 390]) {
  test(`chat category identity and responsive ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await setup(page);
    const menu = page.getByRole("region", { name: "Kategori diskusi" });
    await menu.getByRole("button", { name: /Kerja Jepang/ }).click();
    await expect(page.getByRole("heading", { name: "Kerja Jepang", exact: true })).toBeVisible();
    const own = page.locator(".community-bubble-own");
    const other = page.locator(".community-bubble-other");
    await expect(own).toContainText("Siswa");
    await expect(other).toContainText("Teman");
    await expect(own.locator("time")).toHaveAttribute("datetime", "2026-10-28T01:30:00Z");
    await expect(own.locator("time")).toContainText("08.30");
    expect(await own.evaluate(el => el.getBoundingClientRect().right)).toBeGreaterThan(await other.evaluate(el => el.getBoundingClientRect().right));
    await menu.getByRole("button", { name: /Belajar/ }).click();
    await expect(page.getByText("Pesan 2-3", { exact: true })).toBeVisible();
    await expect(page.getByText("Pesan 1-1", { exact: true })).toHaveCount(0);
    await expect(menu.getByRole("link", { name: "Tanya Sensei" })).toHaveAttribute("href", "/ask-sensei");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("send lost response retry same UUID no duplicate and reload", async ({ page }) => {
  const state = await setup(page);
  await page.getByRole("button", { name: /Kerja Jepang/ }).click();
  const input = page.getByRole("textbox", { name: "Pesan", exact: true });
  await expect(page.getByRole("button", { name: "Kirim", exact: true })).toBeDisabled();
  await input.fill("   ");
  await expect(page.getByRole("button", { name: "Kirim", exact: true })).toBeDisabled();
  await input.fill("Baris satu"); await input.press("Shift+Enter"); await input.press("x");
  await expect(input).toHaveValue("Baris satu\nx");
  state.loseResponse = true;
  await input.press("Enter");
  await expect(page.getByRole("button", { name: "Coba Lagi Kirim" })).toBeVisible();
  await expect(page.locator(".community-pending")).toContainText("Belum terkonfirmasi");
  await page.getByRole("button", { name: "Coba Lagi Kirim" }).click();
  await expect(page.locator(".community-bubble").filter({ hasText: "Baris satu" })).toHaveCount(1);
  expect(state.posts).toHaveLength(2);
  expect(state.posts[0]).toEqual(state.posts[1]);
  expect(Object.keys(state.posts[0]).sort()).toEqual(["client_message_id", "content"]);
  await input.fill("Pesan berbeda"); await input.press("Enter");
  await expect(page.getByText("Pesan berbeda", { exact: true })).toBeVisible();
  expect(state.posts[2].client_message_id).not.toBe(state.posts[0].client_message_id);
  await page.reload();
  await page.getByRole("button", { name: /Kerja Jepang/ }).click();
  await expect(page.getByText("Pesan berbeda", { exact: true })).toBeVisible();
});

test("older pagination polling and moderation reconciliation", async ({ page }) => {
  const state = await setup(page);
  state.rows = Array.from({ length: 8 }, (_, index) => message(index + 1));
  await page.getByRole("button", { name: /Kerja Jepang/ }).click();
  await page.getByRole("button", { name: "Muat Pesan Lama", exact: true }).click();
  await expect(page.getByText("Pesan 1-5", { exact: true })).toBeVisible();
  state.rows.find(row => row.id === 5)!.status = "hidden";
  state.rows.push(message(9));
  await expect(page.getByText("Pesan 1-9", { exact: true })).toBeVisible({ timeout: 12000 });
  await expect(page.getByText("Pesan 1-5", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Pesan 1-6", { exact: true })).toBeVisible();
});

test("stale category request cannot overwrite active room", async ({ page }) => {
  const state = await setup(page); state.holdRoom = true;
  await page.getByRole("button", { name: /Kerja Jepang/ }).click();
  await expect.poll(() => !!state.hold).toBe(true);
  await page.getByRole("button", { name: /Belajar/ }).click();
  await expect(page.getByText("Pesan 2-3", { exact: true })).toBeVisible();
  await state.hold!.fulfill({ json: { data: { id: 1, topic_id: 1, topic_slug: "kerja" } } }).catch(() => {});
  await expect(page.getByText("Pesan 1-1", { exact: true })).toHaveCount(0);
});

test("free read only", async ({ page }) => {
  const state = await setup(page, "free");
  await page.getByRole("button", { name: /Kerja Jepang/ }).click();
  await expect(page.getByText("Pesan 1-1", { exact: true })).toBeVisible();
  await expect(page.getByText(/Free Member dapat membaca diskusi/)).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toHaveCount(0);
  expect(state.posts).toHaveLength(0);
});

for (const status of [403, 404, 409]) {
  test(`send HTTP ${status} keeps unconfirmed payload`, async ({ page }) => {
    const state = await setup(page); state.failure = status;
    await page.getByRole("button", { name: /Kerja Jepang/ }).click();
    await page.getByRole("textbox", { name: "Pesan", exact: true }).fill("Belum pasti");
    await page.getByRole("button", { name: "Kirim", exact: true }).click();
    await expect(page.getByRole("region", { name: /^Percakapan / }).getByRole("alert")).toContainText(status === 403 ? "Akses kirim ditolak" : status === 404 ? "tidak tersedia" : "409");
    await expect(page.locator(".community-bubble").filter({ hasText: "Belum pasti" })).toHaveCount(0);
    await page.getByRole("button", { name: "Coba Lagi Kirim" }).click();
    await expect.poll(() => state.posts.length).toBe(2);
    expect(state.posts[0]).toEqual(state.posts[1]);
  });
}

test("HTTP 401 expires session without false success", async ({ page }) => {
  const state = await setup(page); state.failure = 401;
  await page.getByRole("button", { name: /Kerja Jepang/ }).click();
  await page.getByRole("textbox", { name: "Pesan", exact: true }).fill("Sesi habis");
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  await expect(page).toHaveURL(/login/);
  expect(state.rows.some(row => row.content === "Sesi habis")).toBe(false);
});

test("poll snapshot before POST cannot erase confirmation and next poll removes hidden", async ({ page }) => {
  const state = await setup(page);
  await page.getByRole("button", { name: /Kerja Jepang/ }).click();
  await expect(page.getByText("Pesan 1-2", { exact: true })).toBeVisible();
  state.holdHistory = true;
  await expect.poll(() => !!state.heldHistory, { timeout: 12000 }).toBe(true);
  await page.getByRole("textbox", { name: "Pesan", exact: true }).fill("Konfirmasi race");
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  await expect(page.locator(".community-bubble").filter({ hasText: "Konfirmasi race" })).toHaveCount(1);
  const held = state.heldHistory!;
  await held.route.fulfill({ headers: held.headers, json: held.json });
  await expect(page.locator(".community-pending")).toHaveCount(0);
  await expect(page.locator(".community-bubble").filter({ hasText: "Konfirmasi race" })).toHaveCount(1);
  state.rows.find(row => row.content === "Konfirmasi race")!.status = "hidden";
  await expect(page.locator(".community-bubble").filter({ hasText: "Konfirmasi race" })).toHaveCount(0, { timeout: 12000 });
});

test("scroll anchor pagination reconciliation and category reset", async ({ page }) => {
  const state = await setup(page); state.pageSize = 15;
  state.rows = Array.from({ length: 45 }, (_, index) => message(index + 1));
  await page.getByRole("button", { name: /Kerja Jepang/ }).click();
  const history = page.getByRole("region", { name: "Riwayat pesan" });
  await expect(page.getByText("Pesan 1-45", { exact: true })).toBeVisible();
  await history.evaluate(el => { el.scrollTop = 0; el.dispatchEvent(new Event("scroll")); });
  const offset = () => page.locator('[data-message-id="31"]').evaluate(el => el.getBoundingClientRect().top - el.parentElement!.getBoundingClientRect().top);
  const before = await offset();
  await page.getByRole("button", { name: "Muat Pesan Lama", exact: true }).click();
  await expect(page.locator('[data-message-id="16"]')).toHaveCount(1);
  expect(Math.abs(await offset() - before)).toBeLessThan(3);
  state.rows.push(message(46));
  await expect(page.locator('[data-message-id="46"]')).toHaveCount(1, { timeout: 12000 });
  expect(Math.abs(await offset() - before)).toBeLessThan(3);
  await history.evaluate(el => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event("scroll")); });
  state.rows.push(message(47));
  await expect(page.locator('[data-message-id="47"]')).toHaveCount(1, { timeout: 12000 });
  await expect.poll(() => history.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(3);
  await page.getByRole("button", { name: /Belajar/ }).click();
  await expect(history).toContainText("Belum ada pesan");
  expect(await history.evaluate(el => el.scrollTop)).toBe(0);
});

test("pending remains scoped to category and cleared on logout login", async ({ page }) => {
  const state = await setup(page); state.failure = 403;
  await page.getByRole("button", { name: /Kerja Jepang/ }).click();
  await page.getByRole("textbox", { name: "Pesan", exact: true }).fill("Pending sesi lama");
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  await expect(page.locator(".community-pending")).toContainText("Pending sesi lama");
  await page.getByRole("button", { name: /Belajar/ }).click();
  await expect(page.locator(".community-pending")).toHaveCount(0);
  await page.getByRole("button", { name: /Kerja Jepang/ }).click();
  await expect(page.locator(".community-pending")).toContainText("Pending sesi lama");
  const key = state.posts[0].client_message_id;
  await page.getByRole("button", { name: "Coba Lagi Kirim" }).click();
  await expect.poll(() => state.posts.length).toBe(2);
  expect(state.posts[1].client_message_id).toBe(key);
  await page.getByRole("button", { name: "Keluar", exact: true }).click();
  await expect(page).toHaveURL(/login/);
  state.userId = 25; state.failure = 0;
  await page.goto("/community");
  await page.getByRole("button", { name: /Kerja Jepang/ }).click();
  await expect(page.locator(".community-pending")).toHaveCount(0);
  await expect(page.locator(".community-bubble-own")).toHaveCount(0);
});

test("conversation retry releases aborted send controls and preserves retry key", async ({ page }) => {
  const state = await setup(page);
  await page.getByRole("button", { name: /Kerja Jepang/ }).click();
  await expect(page.getByText("Pesan 1-2", { exact: true })).toBeVisible();
  await page.route("**/api/community/rooms/1/messages*", route => route.request().method() === "GET"
    ? route.fulfill({ status: 503, json: { message: "History unavailable" }, headers: { "access-control-allow-origin": "http://localhost:3039", "access-control-allow-credentials": "true" } })
    : route.fallback());
  await expect(page.getByRole("button", { name: "Coba Lagi Percakapan" })).toBeVisible({ timeout: 12000 });
  let held: Route | undefined;
  await page.route("**/api/community/rooms/1/messages", route => {
    if (route.request().method() === "POST") { held = route; return; }
    return route.fallback();
  });
  await page.getByRole("textbox", { name: "Pesan", exact: true }).fill("Retry after cancellation");
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  await expect.poll(() => !!held).toBe(true);
  const key = held!.request().postDataJSON().client_message_id;
  await page.getByRole("button", { name: "Coba Lagi Percakapan" }).click();
  await expect(page.getByRole("button", { name: "Coba Lagi Kirim", exact: true })).toBeEnabled();
  await held!.abort("failed");
  await page.unroute("**/api/community/rooms/1/messages");
  await page.unroute("**/api/community/rooms/1/messages*");
  await page.getByRole("button", { name: "Coba Lagi Kirim", exact: true }).click();
  await expect.poll(() => state.posts.length).toBe(1);
  expect(state.posts[0].client_message_id).toBe(key);
  await expect(page.getByText("Retry after cancellation", { exact: true })).toBeVisible();
});

test("free instructor form still obeys backend denial", async ({ page }) => {
  const state = await setup(page, "free"); state.failure = 403;
  await page.getByRole("button", { name: /Kerja Jepang/ }).click();
  await page.getByRole("button", { name: "Saya pengajar — gunakan otorisasi backend" }).click();
  await page.getByRole("textbox", { name: "Pesan", exact: true }).fill("Periksa akses");
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  await expect(page.getByRole("region", { name: /^Percakapan / }).getByRole("alert")).toContainText("Akses kirim ditolak");
  await expect(page.locator(".community-bubble").filter({ hasText: "Periksa akses" })).toHaveCount(0);
});
