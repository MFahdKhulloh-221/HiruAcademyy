import { expect, test, type Page } from "@playwright/test";

function navigationTraffic(page: Page) {
  const requests: string[] = [];
  const pending = new Set<object>();
  page.on("requestfinished", request => pending.delete(request));
  page.on("requestfailed", request => pending.delete(request));
  const responses: { path: string; status: number }[] = [];
  const summaries: Promise<{ path: string; status: number; rows: number | null }>[] = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.origin === "http://localhost:8001" && url.pathname.startsWith("/api/")) {
      requests.push(url.pathname);
      pending.add(request);
    }
  });
  page.on("response", response => {
    const url = new URL(response.url());
    if (url.origin !== "http://localhost:8001" || !url.pathname.startsWith("/api/")) return;
    responses.push({ path: url.pathname, status: response.status() });
    if (/\/(showcase|showcase-items|sensei-profiles|testimonials)$/.test(url.pathname)) summaries.push(response.json().then(body => ({ path: url.pathname, status: response.status(), rows: Array.isArray(body.data) ? body.data.length : null })));
  });
  let responseStart = 0;
  let summaryStart = 0;
  return {
    requests,
    async settled(path: string, start: number) {
      const started = Date.now();
      if (new URL(page.url()).pathname !== "/journey") await expect(page.locator("main").getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15000 });
      await expect(page.getByText(/^Memuat/)).toHaveCount(0, { timeout: 15000 });
      await expect.poll(() => pending.size, { timeout: 15000 }).toBe(0);
      await page.waitForLoadState("networkidle", { timeout: 15000 });
      const counts: Record<string, number> = {};
      for (const endpoint of requests.slice(start)) counts[endpoint] = (counts[endpoint] ?? 0) + 1;
      const pageResponses = responses.slice(responseStart);
      console.log("NAVIGATION_COUNTS", JSON.stringify({ path, settledMs: Date.now() - started, total: requests.length - start, responses: pageResponses.length, counts, statuses: [...new Set(pageResponses.map(response => response.status))] }));
      const content = await Promise.all(summaries.slice(summaryStart));
      if (content.length) console.log("CONTENT_STATUS", JSON.stringify(content));
      responseStart = responses.length;
      summaryStart = summaries.length;
      expect(pageResponses.length, `${path}: response bound`).toBeLessThanOrEqual(requests.length - start);
      await expect(page.getByRole("button", { name: /^Coba lagi$/i })).toHaveCount(0);
      await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
      await expect(page.getByText(/^Memuat/)).toHaveCount(0);
      expect(requests.length - start, `${path}: total request bound`).toBeLessThanOrEqual(16);
      for (const [endpoint, count] of Object.entries(counts)) expect(count, `${path}: ${endpoint} request bound`).toBeLessThanOrEqual(3);
      expect(responses.filter(response => response.status >= 400 && !(response.path === "/api/me" && response.status === 401)), "No API errors, including 429; anonymous session probe may return 401").toEqual([]);
    },
    async report() {
      console.log("CONTENT_STATUS", JSON.stringify(await Promise.all(summaries)));
      const statuses: Record<number, number> = {};
      for (const response of responses) statuses[response.status] = (statuses[response.status] ?? 0) + 1;
      console.log("API_STATUS_TOTALS", JSON.stringify(statuses));
    },
  };
}

async function navigationLogin(page: Page, role: "admin" | "student") {
  await page.goto("/login");
  await page.getByLabel("Email / WhatsApp").fill(`browser.${role}@example.test`);
  await page.getByLabel("Kata Sandi", { exact: true }).fill("BrowserTesting123!");
  const login = page.waitForResponse(response => response.url().endsWith("/api/auth/login") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  expect((await login).status()).toBe(200);
  await expect(page).toHaveURL(role === "admin" ? /\/admin$/ : /\/dashboard\?membership=free$/);
}

test("real Laravel navigation regression: repeated admin navigation without 429", async ({ page }) => {
  test.setTimeout(240000);
  const traffic = navigationTraffic(page);
  await navigationLogin(page, "admin");
  await traffic.settled("admin login Dashboard", 0);
  const paths = ["/admin/program-harga", "/admin/showcase", "/admin/sensei", "/admin/testimoni", "/admin/pengguna-akses", "/admin/invoice", "/admin/video-lesson", "/admin/modul", "/admin/flashcard", "/admin/audio-question", "/admin/reading-question", "/admin/mini-checkpoint", "/admin/try-out", "/admin"];
  for (let round = 0; round < 3; round++) {
    for (const path of paths) {
      const start = traffic.requests.length;
      await page.getByRole("navigation", { name: "Navigasi admin" }).locator(`a[href="${path}"]`).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.locator("main").getByRole("heading", { level: 1 })).toBeVisible();
      await traffic.settled(`${round + 1}:${path}`, start);
    }
  }
  await traffic.report();
});

test("real Laravel navigation regression: repeated Free Dashboard Journey Library without 429", async ({ page }) => {
  test.setTimeout(180000);
  const traffic = navigationTraffic(page);
  await navigationLogin(page, "student");
  await traffic.settled("Free login Dashboard", 0);
  for (let round = 0; round < 5; round++) {
    for (const [path, label] of [["/journey", "Perjalanan Level"], ["/library", "Perpustakaan"], ["/dashboard", "Dashboard"]]) {
      const start = traffic.requests.length;
      const link = page.getByRole("link", { name: label, exact: true });
      if (!await link.isVisible()) await page.getByRole("button", { name: "Kelas Saya", exact: true }).click();
      await link.click();
      await expect(page).toHaveURL(new RegExp(`${path}(\\?|$)`));
      if (path === "/journey") await expect(page.getByRole("region", { name: "Pilihan level" }).getByText("JLPT N5", { exact: true })).toBeVisible();
      if (path === "/library") await expect(page.getByRole("heading", { name: "Perpustakaan Materi", exact: true })).toBeVisible();
      await traffic.settled(`${round + 1}:${path}`, start);
      if (path === "/dashboard") expect(traffic.requests.slice(start).some(endpoint => endpoint.endsWith("/progress")), "Dashboard finishes chapter/progress chain").toBe(true);
    }
  }
  await traffic.report();
});

test("real Laravel navigation regression: public landing dynamic APIs without 429", async ({ page }) => {
  const traffic = navigationTraffic(page);
  for (const endpoint of ["showcase", "sensei-profiles", "testimonials"]) {
    const response = await page.request.get(`http://localhost:8001/api/${endpoint}`);
    const body = await response.json();
    console.log("PUBLIC_API_STATUS", JSON.stringify({ endpoint, status: response.status(), rows: Array.isArray(body.data) ? body.data.length : null }));
    expect(response.status()).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  }
  for (let round = 0; round < 3; round++) {
    const start = traffic.requests.length;
    await page.goto("/");
    await traffic.settled(`${round + 1}:public landing`, start);
    for (const endpoint of ["showcase", "sensei-profiles", "testimonials"]) expect(traffic.requests.slice(start)).toContain(`/api/${endpoint}`);
  }
  await traffic.report();
});

for (const role of ["student", "admin"] as const) {
  test(`real Laravel ${role} cookie session survives refresh and enforces role`, async ({ page }) => {
    test.setTimeout(360000);
    await page.goto("/login");
    await page.getByLabel("Email / WhatsApp").fill(`browser.${role}@example.test`);
    await page.getByLabel("Kata Sandi", { exact: true }).fill("BrowserTesting123!");
    const login = page.waitForResponse(response => response.url().endsWith("/api/auth/login") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Masuk", exact: true }).click();
    expect((await login).status()).toBe(200);
    await expect(page).toHaveURL(role === "admin" ? /\/admin$/ : /\/dashboard\?membership=free$/);
    if (role === "student") {
      await page.goto("/profile");
      await expect(page.getByRole("heading", { name: "Browser student", exact: true })).toBeVisible();
    }
    await page.reload();
    await expect.poll(async () => page.evaluate(async () => {
      const response = await fetch("http://localhost:8001/api/me", { credentials: "include", headers: { Accept: "application/json" } });
      const body = await response.json();
      return { status: response.status, role: body.data?.role };
    }), { timeout: 90000, intervals: [5000] }).toEqual({ status: 200, role });
    expect(await page.evaluate(() => Object.keys(localStorage).filter(key => /token/i.test(key)))).toEqual([]);
    if (role === "student") {
      for (const path of ["/api/public/programs", "/api/student/access", "/api/student/library", "/api/student/class-schedules"]) {
        const status = await page.evaluate(async path => (await fetch(`http://localhost:8001${path}`, { credentials: "include", headers: { Accept: "application/json" } })).status, path);
        expect(status, path).toBe(200);
      }
      await page.goto("/journey");
      await expect(page.getByRole("region", { name: "Pilihan level" }).getByText("JLPT N5", { exact: true })).toBeVisible();
      await page.goto("/library");
      await expect(page.getByRole("heading").first()).toBeVisible();
      await page.goto("/admin/invoice");
      await expect(page).toHaveURL(/\/dashboard/);
      await page.goto("/profile");
      await expect.poll(async () => {
        return page.getByRole("button", { name: "Keluar", exact: true }).isVisible();
      }, { timeout: 90000, intervals: [5000] }).toBe(true);
      await page.getByRole("button", { name: "Keluar", exact: true }).click();
      await expect(page).toHaveURL(/\/login$/);
    } else {
      await page.goto("/admin/pengguna-akses");
      await expect(page.getByRole("cell", { name: "Browser student", exact: true })).toBeVisible();
      await page.goto("/admin/pengaturan-integrasi");
      await page.getByLabel("Nama situs", { exact: true }).fill("Hiru Academy Browser Test");
      await expect.poll(async () => {
        await page.getByRole("button", { name: "Simpan Umum", exact: true }).click();
        return page.getByRole("status").textContent();
      }, { timeout: 90000, intervals: [5000] }).toBe("Pengaturan Umum berhasil disimpan.");
      await page.reload();
      await expect(page.getByLabel("Nama situs", { exact: true })).toHaveValue("Hiru Academy Browser Test");
      await page.goto("/admin/invoice");
      await expect.poll(async () => {
        return page.getByRole("heading", { name: "Invoice", exact: true }).isVisible();
      }, { timeout: 90000, intervals: [5000] }).toBe(true);
      await page.goto("/admin/pencairan-komisi");
      await page.getByRole("button", { name: "Tambah Pencairan" }).click();
      const dialog = page.getByRole("dialog");
      const select = dialog.getByRole("combobox", { name: "Affiliate", exact: true });
      await expect(select.locator("option")).not.toHaveCount(1);
      const affiliate = await select.locator("option").nth(1).getAttribute("value");
      await select.selectOption(affiliate!);
      await dialog.getByRole("checkbox").first().check();
      await dialog.getByLabel("Tanggal", { exact: true }).fill("2026-10-01");
      await expect.poll(async () => {
        if (await dialog.isVisible()) await dialog.getByRole("button", { name: "Tandai Sudah Dicairkan" }).click();
        return dialog.isVisible();
      }, { timeout: 90000, intervals: [5000] }).toBe(false);
      await expect.poll(async () => {
        return (await page.getByRole("table").textContent({ timeout: 1000 }).catch(() => ""))?.includes("Sudah Dicairkan") ?? false;
      }, { timeout: 90000, intervals: [5000] }).toBe(true);
      await page.reload();
      await expect.poll(async () => {
        return (await page.getByRole("table").textContent({ timeout: 1000 }).catch(() => ""))?.includes("Sudah Dicairkan") ?? false;
      }, { timeout: 90000, intervals: [5000] }).toBe(true);
    }
  });
}

test("real Laravel live write journey: invoice create -> admin verify -> access activation -> assessment submission and review", async ({ browser }) => {
  test.setTimeout(360000);
  const studentContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();

  await studentPage.goto("/login");
  await studentPage.getByLabel("Email / WhatsApp").fill("browser.student@example.test");
  await studentPage.getByLabel("Kata Sandi", { exact: true }).fill("BrowserTesting123!");
  await studentPage.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(studentPage).toHaveURL(/\/dashboard/);

  const catalogRes = await studentPage.evaluate(async () => {
    const res = await fetch("http://localhost:8001/api/public/programs", { credentials: "include", headers: { Accept: "application/json" } });
    return res.json();
  });
  const n5 = catalogRes.data.find((p: { code: string }) => p.code === "n5");
  expect(n5).toBeTruthy();

  const offersRes = await studentPage.evaluate(async () => {
    const res = await fetch("http://localhost:8001/api/public/offers", { credentials: "include", headers: { Accept: "application/json" } });
    return res.json();
  });
  const n5Offer = offersRes.data.find((o: { program?: { code: string }; plan_code: string }) => o.program?.code === "n5" && o.plan_code === "lms");
  expect(n5Offer).toBeTruthy();

  const createInvoiceRes = await studentPage.evaluate(async (offerId) => {
    const xsrf = decodeURIComponent(document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] || "");
    const res = await fetch("http://localhost:8001/api/student/invoices", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-XSRF-TOKEN": xsrf },
      body: JSON.stringify({ program_offer_id: offerId })
    });
    return { status: res.status, data: (await res.json()).data };
  }, n5Offer.id);
  expect(createInvoiceRes.status).toBe(201);
  const invoiceId = createInvoiceRes.data.id;

  const submitInvoiceRes = await studentPage.evaluate(async (id) => {
    const xsrf = decodeURIComponent(document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] || "");
    const res = await fetch(`http://localhost:8001/api/student/invoices/${id}/submit`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json", "X-XSRF-TOKEN": xsrf }
    });
    return { status: res.status, data: (await res.json()).data };
  }, invoiceId);
  expect(submitInvoiceRes.status).toBe(200);
  expect(submitInvoiceRes.data.status).toBe("awaiting_payment");

  await adminPage.goto("/login");
  await adminPage.getByLabel("Email / WhatsApp").fill("browser.admin@example.test");
  await adminPage.getByLabel("Kata Sandi", { exact: true }).fill("BrowserTesting123!");
  await adminPage.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(adminPage).toHaveURL(/\/admin$/);

  const payInvoiceRes = await adminPage.evaluate(async (id) => {
    const xsrf = decodeURIComponent(document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] || "");
    const res = await fetch(`http://localhost:8001/api/admin/invoices/${id}/transition`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-XSRF-TOKEN": xsrf },
      body: JSON.stringify({ status: "paid" })
    });
    return { status: res.status, data: (await res.json()).data };
  }, invoiceId);
  expect(payInvoiceRes.status).toBe(200);
  expect(payInvoiceRes.data.status).toBe("paid");

  const verifyInvoiceRes = await adminPage.evaluate(async (id) => {
    const xsrf = decodeURIComponent(document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] || "");
    const res = await fetch(`http://localhost:8001/api/admin/invoices/${id}/transition`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-XSRF-TOKEN": xsrf },
      body: JSON.stringify({ status: "verified" })
    });
    return { status: res.status, data: (await res.json()).data };
  }, invoiceId);
  expect(verifyInvoiceRes.status).toBe(200);
  expect(verifyInvoiceRes.data.status).toBe("verified");

  const activateInvoiceRes = await adminPage.evaluate(async (id) => {
    const xsrf = decodeURIComponent(document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] || "");
    const res = await fetch(`http://localhost:8001/api/admin/invoices/${id}/transition`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-XSRF-TOKEN": xsrf },
      body: JSON.stringify({ status: "active" })
    });
    return { status: res.status, data: (await res.json()).data };
  }, invoiceId);
  expect(activateInvoiceRes.status).toBe(200);
  expect(activateInvoiceRes.data.status).toBe("active");

  const accessRes = await studentPage.evaluate(async () => {
    const res = await fetch("http://localhost:8001/api/student/access", { credentials: "include", headers: { Accept: "application/json" } });
    return res.json();
  });
  expect(accessRes.data.learning.n5).toBe("full");

  const chaptersRes = await studentPage.evaluate(async (programId) => {
    const res = await fetch(`http://localhost:8001/api/student/programs/${programId}/chapters`, { credentials: "include", headers: { Accept: "application/json" } });
    return res.json();
  }, n5.id);
  const chapter1 = chaptersRes.data.find((c: { chapter_number: number }) => c.chapter_number === 1);
  expect(chapter1).toBeTruthy();
  expect(chapter1.access).toBe("full");

  const startAssessmentRes = await studentPage.evaluate(async ({ programId, chapterId }) => {
    const xsrf = decodeURIComponent(document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] || "");
    const res = await fetch(`http://localhost:8001/api/student/programs/${programId}/chapters/${chapterId}/attempts`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-XSRF-TOKEN": xsrf },
      body: JSON.stringify({ kind: "audio" })
    });
    return { status: res.status, data: (await res.json()).data };
  }, { programId: n5.id, chapterId: chapter1.id });
  expect(startAssessmentRes.status).toBe(201);
  const attempt = startAssessmentRes.data;
  expect(attempt.status).toBe("in_progress");
  expect(attempt.questions.length).toBeGreaterThan(0);
  const questionId = attempt.questions[0].id;

  const submitAssessmentRes = await studentPage.evaluate(async ({ programId, chapterId, attemptId, qid }) => {
    const xsrf = decodeURIComponent(document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] || "");
    const res = await fetch(`http://localhost:8001/api/student/programs/${programId}/chapters/${chapterId}/attempts/${attemptId}/submit`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-XSRF-TOKEN": xsrf },
      body: JSON.stringify({ answers: { [qid]: "A" }, revision: 0 })
    });
    return { status: res.status, data: (await res.json()).data };
  }, { programId: n5.id, chapterId: chapter1.id, attemptId: attempt.id, qid: questionId });
  expect(submitAssessmentRes.status).toBe(200);
  expect(submitAssessmentRes.data.status).toBe("completed");
  expect(submitAssessmentRes.data.result.percentage).toBe(100);
  expect(submitAssessmentRes.data.result.correct).toBe(1);

  const reviewAssessmentRes = await studentPage.evaluate(async ({ programId, chapterId, attemptId }) => {
    const res = await fetch(`http://localhost:8001/api/student/programs/${programId}/chapters/${chapterId}/attempts/${attemptId}/review`, {
      credentials: "include",
      headers: { Accept: "application/json" }
    });
    return { status: res.status, data: (await res.json()).data };
  }, { programId: n5.id, chapterId: chapter1.id, attemptId: attempt.id });
  expect(reviewAssessmentRes.status).toBe(200);
  expect(reviewAssessmentRes.data.questions[0].status).toBe("correct");
  expect(reviewAssessmentRes.data.questions[0].correct_option).toBe("A");
  expect(reviewAssessmentRes.data.questions[0].explanation).toBe("Penjelasan benar A.");

  await studentContext.close();
  await adminContext.close();
});
