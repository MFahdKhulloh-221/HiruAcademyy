import { expect, test } from "@playwright/test";
import type { Route } from "@playwright/test";

const topics = ["Kategori API A", "Kategori API B", "Kategori API C", "Kategori API D"].map((title, index) => ({ id: index + 1, slug: `api-${index}`, title, description: `Deskripsi ${title}`, threads_count: 1 }));
const threads = topics.map(topic => ({ id: topic.id, topic_id: topic.id, topic_slug: topic.slug, topic_title: topic.title, title: `Diskusi ${topic.title}`, content: "Percakapan belajar", status: "published", is_ask_sensei: false, replies_count: 0, author: { id: 9, name: "Siswa", is_sensei: false }, created_at: "2026-10-21T00:00:00Z", replies: [] }));

for (const [width, plan] of [[1440, "free"], [768, "lms"], [390, "sensei"]] as const) {
  test(`community categories ${width} ${plan}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    let topicFailure = true;
    let threadFailure = false;
    let delayed: Route | undefined;
    let hold = false;
    const queries: URLSearchParams[] = [];
    await page.route(/\/(api\/|sanctum\/csrf-cookie)/, async route => {
      const url = new URL(route.request().url());
      const headers = { "access-control-allow-origin": route.request().headers().origin ?? "http://localhost:3000", "access-control-allow-credentials": "true", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "accept, content-type, x-xsrf-token" };
      const reply = (data: unknown) => route.fulfill({ headers, json: { data } });
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      expect(route.request().method()).toBe("GET");
      if (url.pathname === "/api/me") return reply({ id: 9, name: "Siswa", email: "student@example.test", whatsapp: "628123456789", role: "student", account_status: "active" });
      if (url.pathname === "/api/student/dashboard") return reply({ programs: [], access: { learning: {}, replay_levels: [], source_grants: plan === "free" ? [] : [{ plan_code: plan, program_code: "n5" }] } });
      if (url.pathname === "/api/public/programs") return reply([]);
      if (url.pathname === "/api/student/access") return reply({ learning: {}, replay_levels: [], source_grants: plan === "free" ? [] : [{ plan_code: plan, program_code: "n5" }] });
      if (url.pathname === "/api/community/topics") {
        if (topicFailure) return route.fulfill({ status: 503, headers, json: { message: "Kategori gagal" } });
        return reply(topics);
      }
      if (url.pathname === "/api/community/threads") {
        queries.push(url.searchParams);
        if (threadFailure) return route.fulfill({ status: 503, headers, json: { message: "Diskusi gagal" } });
        if (hold && url.searchParams.get("topic_slug") === "api-0") { delayed = route; return; }
        return reply(threads.filter(thread => (!url.searchParams.has("topic_slug") || thread.topic_slug === url.searchParams.get("topic_slug")) && (!url.searchParams.has("search") || thread.title.includes(url.searchParams.get("search")!))));
      }
      if (url.pathname === "/api/community/threads/1") return reply(threads[0]);
      return reply([]);
    });
    await page.goto("/community");
    await page.getByRole("button", { name: "Arsip Diskusi Lama", exact: true }).click();
    await expect(page.getByRole("button", { name: "Coba Lagi Kategori" })).toBeVisible();
    topicFailure = false;
    await page.getByRole("button", { name: "Coba Lagi Kategori" }).click();
    const menu = page.getByRole("region", { name: "Kategori diskusi" });
    await expect(menu.getByRole("button")).toHaveCount(5);
    for (const topic of topics) await expect(menu.getByRole("button", { name: new RegExp(topic.title) })).toBeVisible();
    const a = menu.getByRole("button", { name: /Kategori API A/ });
    const b = menu.getByRole("button", { name: /Kategori API B/ });
    const all = menu.getByRole("button", { name: /Semua Diskusi/ });
    const list = page.locator(".community-list");
    await a.click();
    await expect(a).toHaveAttribute("aria-pressed", "true");
    await expect(list.getByRole("heading")).toHaveText([threads[0].title]);
    await page.keyboard.press("Tab");
    await expect(b).toBeFocused();
    await b.press("Enter");
    await expect(b).toHaveAttribute("aria-pressed", "true");
    await expect(a).toHaveAttribute("aria-pressed", "false");
    await expect(list.getByRole("heading")).toHaveText([threads[1].title]);
    await b.press("Space");
    await expect(b).toHaveAttribute("aria-pressed", "true");
    const search = page.getByRole("textbox", { name: "Cari diskusi", exact: true });
    await search.fill("Kategori API B");
    await expect(list.getByRole("heading")).toHaveText([threads[1].title]);
    expect(queries.at(-1)?.get("search")).toBe("Kategori API B");
    expect(queries.at(-1)?.get("topic_slug")).toBe("api-1");
    await a.click();
    await expect(page.getByRole("heading", { name: "Belum ada diskusi" })).toBeVisible();
    await expect(search).toHaveValue("Kategori API B");
    await all.click();
    await expect(list.getByRole("heading")).toHaveText([threads[1].title]);
    expect(queries.at(-1)?.has("topic_slug")).toBe(false);
    await search.fill("");
    await expect(list.getByRole("heading")).toHaveCount(4);
    threadFailure = true;
    await b.click();
    await expect(page.getByRole("alert").filter({ has: page.getByRole("button", { name: "Coba Lagi", exact: true }) })).toBeVisible();
    threadFailure = false;
    await page.getByRole("button", { name: "Coba Lagi", exact: true }).click();
    await expect(list.getByRole("heading")).toHaveText([threads[1].title]);
    hold = true;
    await a.click();
    await expect.poll(() => Boolean(delayed)).toBe(true);
    await expect(page.getByText("Memuat diskusi…", { exact: true })).toBeVisible();
    await b.click();
    await expect(list.getByRole("heading")).toHaveText([threads[1].title]);
    await delayed!.fulfill({ json: { data: [threads[0]] } }).catch(() => {});
    await expect(b).toHaveAttribute("aria-pressed", "true");
    await expect(list.getByRole("heading")).toHaveText([threads[1].title]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await a.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await page.keyboard.press("Shift+Tab");
    await expect(a).toBeFocused();
    await expect(a).toBeInViewport();
    const focus = await a.evaluate(el => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return { visible: el.matches(":focus-visible"), outline: style.outlineStyle, width: parseFloat(style.outlineWidth), unobscured: el.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)) };
    });
    expect(focus.visible).toBe(true);
    expect(focus.outline).not.toBe("none");
    expect(focus.width).toBeGreaterThanOrEqual(3);
    expect(focus.unobscured).toBe(true);
    await expect(page.getByRole("button", { name: "Buat Postingan", exact: true })).toHaveCount(plan === "free" ? 0 : 1);
    hold = false;
    await a.click();
    await expect(list.getByRole("heading")).toHaveText([threads[0].title]);
    await list.getByRole("button", { name: "Buka", exact: true }).click();
    await expect(page.getByRole("heading", { name: threads[0].title })).toBeVisible();
    await expect(page.getByRole("button", { name: "Kirim Tanggapan", exact: true })).toHaveCount(plan === "free" ? 0 : 1);
    if (plan === "free") await expect(page.getByText(/Free Member dapat membaca diskusi/)).toBeVisible();
  });
}
