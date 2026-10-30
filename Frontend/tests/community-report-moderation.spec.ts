import { expect, test, type Page } from "@playwright/test";

const topic = { id: 1, slug: "kerja", title: "Kerja Jepang", description: "Ruang kerja", threads_count: 0 };
const message = { id: 7, room_id: 1, client_message_id: "00000000-0000-4000-8000-000000000007", content: "Pesan ditinjau", status: "published", author: { id: 10, name: "Teman", is_sensei: false }, created_at: "2026-10-28T01:30:00Z" };
async function setup(page: Page, role = "student") {
  const state = { status: "published", handled: false, failure: 0, network: false, listFailure: 0, reports: [] as unknown[], patches: [] as { path: string; status: string }[], queries: [] as URLSearchParams[], hold: false, release: undefined as (() => void) | undefined };
  await page.route(/\/(api\/|sanctum\/csrf-cookie)/, async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    const headers = { "access-control-allow-origin": route.request().headers().origin ?? "http://localhost:3039", "access-control-allow-credentials": "true", "access-control-allow-methods": "GET, POST, PATCH, OPTIONS", "access-control-allow-headers": "accept, content-type, x-xsrf-token" };
    const json = (body: unknown, status = 200) => route.fulfill({ headers, json: body, status });
    const data = (body: unknown, status = 200) => json({ data: body }, status);
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (path === "/sanctum/csrf-cookie") {
      await page.context().addCookies([{ name: "XSRF-TOKEN", value: "moderation-test", url: page.url() }]);
      return route.fulfill({ status: 204, headers });
    }
    if (path === "/api/me") return data({ id: 9, name: "Tester", email: "test@example.test", whatsapp: "628123456789", role, account_status: "active" });
    if (path === "/api/student/dashboard") return data({ programs: [], access: { learning: {}, replay_levels: [], source_grants: [] } });
    if (path === "/api/community/topics") return data([topic]);
    if (path === "/api/community/topics/1/room") return data({ id: 1, topic_id: 1, topic_slug: topic.slug });
    if (path === "/api/community/rooms/1/messages") return json({ data: state.status === "published" ? [message] : [], meta: { has_more: false, before: 7, after: 7, requires_history_refresh: true } });
    if (path === "/api/community/messages/7/reports") {
      state.reports.push(route.request().postDataJSON());
      if (state.hold) await new Promise<void>(resolve => { state.release = resolve; });
      if (state.network) return route.abort("failed");
      if (state.failure) return json({ message: "Ditolak", errors: { reason: ["Tidak valid"] } }, state.failure);
      return data({ id: 3, status: state.handled ? "handled" : "pending" }, state.reports.length === 1 ? 201 : 200);
    }
    if (path === "/api/admin/community/moderation") {
      state.queries.push(url.searchParams);
      if (state.listFailure) return json({ message: "Ditolak" }, state.listFailure);
      const pageNumber = Number(url.searchParams.get("page") ?? 1);
      const adminMessage = { ...message, status: state.status, user: { name: "Teman" }, room: { topic } };
      const report = { id: 3, reason: "Spam", status: state.handled ? "handled" : "pending", created_at: message.created_at, reporter: { name: "Pelapor" }, message: adminMessage };
      const rows = url.searchParams.get("view") === "reports" ? [report] : Array.from({ length: pageNumber === 1 ? 25 : 1 }, (_, index) => ({ ...adminMessage, id: pageNumber === 1 ? 7 + index : 32 }));
      return json({ data: rows, current_page: pageNumber, last_page: 2 });
    }
    if (method === "PATCH") {
      const body = route.request().postDataJSON();
      state.patches.push({ path, status: body.status });
      if (state.network) return route.abort("failed");
      if (state.failure) return json({ message: "Ditolak" }, state.failure);
      if (path === "/api/admin/community/reports/3") state.handled = true;
      else state.status = body.status;
      return data(path.includes("/reports/") ? { id: 3, status: "handled" } : { ...message, status: state.status });
    }
    return data([]);
  });
  return state;
}
async function openChat(page: Page) {
  await page.goto("/community");
  await page.getByRole("button", { name: /Kerja Jepang/ }).click();
  await expect(page.getByText(message.content, { exact: true })).toBeVisible();
}
async function report(page: Page) {
  await page.getByRole("button", { name: "Laporkan", exact: true }).click();
  await page.getByLabel("Alasan laporan").fill("");
  await expect(page.getByRole("button", { name: "Kirim laporan", exact: true })).toBeDisabled();
  await page.getByLabel("Alasan laporan").fill("Spam");
  await page.getByRole("button", { name: "Kirim laporan", exact: true }).click();
}

for (const width of [1440, 768, 390]) {
  test(`Free report confirmed duplicate and hidden reconciliation ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const state = await setup(page);
    await openChat(page);
    await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toHaveCount(0);
    state.hold = true;
    await report(page);
    await expect.poll(() => state.reports.length).toBe(1);
    await expect(page.getByText("Laporan tersimpan.")).toHaveCount(0);
    state.hold = false; state.release!();
    await expect(page.getByText("Laporan tersimpan.")).toBeVisible();
    expect(state.reports[0]).toEqual({ reason: "Spam" });
    expect(state.status).toBe("published");
    await report(page);
    await expect.poll(() => state.reports.length).toBe(2);
    await expect(page.getByText("Laporan tersimpan.")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    state.status = "hidden";
    await expect(page.getByText(message.content, { exact: true })).toHaveCount(0, { timeout: 12000 });
    await expect(page.getByRole("button", { name: "Laporkan", exact: true })).toHaveCount(0);
  });


}
for (const failure of [401, 403, 404, 422, 0]) {
  test(`report error ${failure || "network"} never claims success`, async ({ page }) => {
    const state = await setup(page); state.failure = failure; state.network = !failure;
    await openChat(page);
    await report(page);
    if (failure === 401) await expect(page).toHaveURL(/\/login/);
    else await expect(page.getByText("Laporan gagal disimpan. Coba lagi.", { exact: true })).toBeVisible();
    await expect(page.getByText("Laporan tersimpan.")).toHaveCount(0);
  });

}
test("student cannot open moderation", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/admin/komunitas");
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Moderasi Komunitas", exact: true })).toHaveCount(0);
  expect(state.queries).toHaveLength(0);
});
