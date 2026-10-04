import { expect, test } from "@playwright/test";

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
        await expect.poll(async () => {
          const status = await page.evaluate(async path => (await fetch(`http://localhost:8001${path}`, { credentials: "include", headers: { Accept: "application/json" } })).status, path);
          expect([200, 429], path).toContain(status);
          return status;
        }, { timeout: 90000, intervals: [5000] }).toBe(200);
      }
      await page.goto("/journey");
      await expect.poll(async () => {
        if (await page.getByRole("button", { name: "Coba Lagi", exact: true }).isVisible()) await page.getByRole("button", { name: "Coba Lagi", exact: true }).click();
        return page.getByRole("region", { name: "Pilihan level" }).getByText("JLPT N5", { exact: true }).isVisible();
      }, { timeout: 90000, intervals: [5000] }).toBe(true);
      await page.goto("/library");
      await expect(page.getByRole("heading").first()).toBeVisible();
      await page.goto("/admin/invoice");
      await expect(page).toHaveURL(/\/dashboard/);
      await page.goto("/profile");
      await expect.poll(async () => {
        if (await page.getByRole("button", { name: "Coba Lagi", exact: true }).isVisible()) await page.getByRole("button", { name: "Coba Lagi", exact: true }).click();
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
        if (await page.getByRole("button", { name: "Coba Lagi", exact: true }).isVisible()) await page.getByRole("button", { name: "Coba Lagi", exact: true }).click();
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
        if (await page.getByRole("button", { name: "Coba Lagi", exact: true }).isVisible()) await page.getByRole("button", { name: "Coba Lagi", exact: true }).click();
        return (await page.getByRole("table").textContent({ timeout: 1000 }).catch(() => ""))?.includes("Sudah Dicairkan") ?? false;
      }, { timeout: 90000, intervals: [5000] }).toBe(true);
      await page.reload();
      await expect.poll(async () => {
        if (await page.getByRole("button", { name: "Coba Lagi", exact: true }).isVisible()) await page.getByRole("button", { name: "Coba Lagi", exact: true }).click();
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
