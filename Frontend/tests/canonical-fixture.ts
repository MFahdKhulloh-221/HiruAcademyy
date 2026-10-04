import { test as base, expect, type Page } from "@playwright/test";

export const test = base.extend<{ canonicalApi: void }>({
  canonicalApi: [async ({ page }, use) => {
    const collections = new Map<string, Record<string, unknown>[]>();
    let sequence = 1;
    const settings: Record<string, unknown> = {};
    const programs = ["n5", "n4", "n3"].map((code, index) => ({ id: index + 1, code, slug: code, name: `JLPT ${code.toUpperCase()}`, family: "jlpt" }));
    const offers = programs.flatMap(program => ["lms", "sensei"].map((plan, index) => ({ id: program.id * 10 + index, program_id: program.id, program, plan_code: plan, currency: "IDR", base_price: 99000, effective_price: 99000, discount_amount: 0, discount_percent: 0, duration_months: plan === "lms" ? 6 : 1, status: "active" })));
    collections.set("/api/admin/users", [{ id: 901, name: "Browser Student", email: "browser.student@example.test", whatsapp: "6281999000012", account_status: "active" }]);
    collections.set("/api/admin/placement-leads", [
      { id: 1, date: "2026-10-01T08:00:00Z", name: "Budi Santoso", whatsapp: "6281234567890", target: "N5", score: 75, recommended_level: "N5", status: "new" },
      { id: 2, date: "2026-10-02T10:30:00Z", name: "Siti Rahma", whatsapp: "6289876543210", target: "N4", score: 90, recommended_level: "N4", status: "contacted" },
    ]);
    await page.route(/\/(api\/|sanctum\/csrf-cookie)/, async route => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();
      if (path === "/sanctum/csrf-cookie") { await route.fulfill({ status: 204, headers: { "set-cookie": "XSRF-TOKEN=testing; Path=/; SameSite=Lax" } }); return; }
      if (path === "/api/me") { await route.fulfill({ json: { data: { id: 901, name: "Browser Admin", email: "browser.admin@example.test", whatsapp: "6281999000011", role: new URL(page.url()).pathname.startsWith("/admin") ? "admin" : "student", account_status: "active" } } }); return; }
      if (/^\/api\/admin\/users\/\d+\/effective-access$/.test(path)) { await route.fulfill({ json: { data: { learning: {}, replay_levels: [], source_grants: [] } } }); return; }
      if (path === "/api/student/access") { await route.fulfill({ json: { data: { learning: { n5: "full", n4: "full" }, replay_levels: ["n5", "n4"], source_grants: [{ plan_code: "sensei", program_code: "n4" }] } } }); return; }
      const offerMatch = path.match(/^\/api\/admin\/offers\/(\d+)$/);
      if (offerMatch && method === "PATCH") {
        const offer = offers.find(item => item.id === Number(offerMatch[1]));
        if (!offer) { await route.fulfill({ status: 404, json: {} }); return; }
        const body = route.request().postDataJSON(); expect(Object.keys(body)).toEqual(["base_price"]);
        if (!Number.isSafeInteger(body.base_price) || body.base_price < 0) { await route.fulfill({ status: 422, json: {} }); return; }
        offer.base_price = body.base_price; offer.effective_price = body.base_price;
        await route.fulfill({ json: { data: offer } }); return;
      }
      if (["/api/public/programs", "/api/admin/programs", "/api/public/offers", "/api/admin/offers"].includes(path)) {
        await route.fulfill({ json: { data: path.endsWith("offers") ? offers : programs } }); return;
      }
      if (path === "/api/student/invoices" && method === "POST") {
        const body = route.request().postDataJSON();
        const offer = offers.find(item => item.id === body.program_offer_id)!;
        const row = { id: sequence++, user_id: 901, program_id: offer.program_id, program_code: offer.program.code, plan_code: offer.plan_code, base_price: offer.base_price, total_price: offer.effective_price, discount_amount: 0, status: "draft", created_at: "2026-10-01T00:00:00Z" };
        const rows = collections.get("/api/admin/invoices") ?? []; rows.push(row); collections.set("/api/admin/invoices", rows); collections.set("/api/student/invoices", rows);
        await route.fulfill({ status: 201, json: { data: row } }); return;
      }
      if (path === "/api/sensei-profiles") {
        await route.fulfill({ json: { data: (collections.get("/api/admin/sensei-profiles") ?? []).filter(row => row.active === true) } }); return;
      }
      if (path === "/api/testimonials") {
        await route.fulfill({ json: { data: (collections.get("/api/admin/testimonials") ?? []).filter(row => row.published === true) } }); return;
      }
      if (path === "/api/blog" || path.startsWith("/api/blog/")) {
        const published = (collections.get("/api/admin/blog-articles") ?? []).filter(row => row.published === true);
        await route.fulfill({ json: { data: path === "/api/blog" ? published : published.find(row => row.slug === path.split("/").at(-1)) ?? null } }); return;
      }
      const invoiceAction = path.match(/^\/api\/(?:student|admin)\/invoices\/(\d+)\/(submit|mark-paid|transition)$/);
      if (invoiceAction) {
        const row = collections.get("/api/admin/invoices")?.find(item => item.id === Number(invoiceAction[1]));
        if (!row) { await route.fulfill({ status: 404, json: {} }); return; }
        row.status = invoiceAction[2] === "submit" ? "awaiting_payment" : invoiceAction[2] === "mark-paid" ? "paid" : route.request().postDataJSON().status;
        await route.fulfill({ json: { data: row } }); return;
      }
      if (path === "/api/admin/settings") {
        if (method === "PATCH") { const body = route.request().postDataJSON(); settings[body.section] = body.value; }
        await route.fulfill({ json: { data: settings } }); return;
      }
      const tryoutDetail = path.match(/^\/api\/admin\/try-outs\/(\d+)$/);
      if (tryoutDetail && method === "GET") {
        const row = collections.get("/api/admin/try-outs")?.find(item => item.id === Number(tryoutDetail[1]));
        await route.fulfill({ json: { data: row ? { ...row, questions: collections.get(`${path}/questions`) ?? [] } : null } }); return;
      }
      const match = path.match(/^(.*)\/(\d+)$/);
      const collection = match?.[1] ?? path;
      const rows = collections.get(collection) ?? [];
      let data: unknown = match ? rows.find(row => row.id === Number(match[2])) : rows;
      if (method === "POST") {
        const row = { ...route.request().postDataJSON(), id: sequence++ };
        rows.push(row); collections.set(collection, rows); data = row;
      } else if (method === "PATCH" || method === "PUT") {
        const row = rows.find(row => row.id === Number(match?.[2]));
        if (!row) { await route.fulfill({ status: 404, json: {} }); return; }
        Object.assign(row, route.request().postDataJSON()); data = row;
      } else if (method === "DELETE") {
        collections.set(collection, rows.filter(row => row.id !== Number(match?.[2])));
        await route.fulfill({ status: 204 }); return;
      }
      await route.fulfill({ status: method === "POST" ? 201 : 200, json: { data: data ?? null } });
    });
    await use();
  }, { auto: true }],
});
export { expect };
export type { Page };
