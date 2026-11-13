import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const root = process.env.HIRU_ACHIEVEMENT_BROWSER_DIR!;
const fixture = JSON.parse(readFileSync(`${root}/manifest.json`, "utf8"));
const api = "http://localhost:8027";

async function login(page: Page, role: "admin" | "student" | "other") {
  await page.goto("/login");
  await page.getByLabel("Email / WhatsApp").fill(fixture.users[role].email);
  await page.getByLabel("Kata Sandi", { exact: true }).fill(fixture.password);
  const response = page.waitForResponse(r => r.url().endsWith("/api/auth/login") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page).not.toHaveURL(/\/login/);
}

async function request(page: Page, path: string, method = "GET") {
  return page.evaluate(async ({ api, path, method }) => {
    const token = document.cookie.split("; ").find(c => c.startsWith("XSRF-TOKEN="))?.slice(11);
    const response = await fetch(api + path, { method, credentials: "include", headers: { Accept: "application/json", ...(token ? { "X-XSRF-TOKEN": decodeURIComponent(token) } : {}) } });
    return { status: response.status, body: await response.json() };
  }, { api, path, method });
}

test("real login, admin settings, completion, immutable award, IDOR and transport retry", async ({ browser }) => {
  const options = { baseURL: "http://localhost:3028", locale: "id-ID", timezoneId: "Asia/Jakarta", viewport: { width: 1440, height: 900 } };
  const adminContext = await browser.newContext(options);
  const studentContext = await browser.newContext(options);
  const otherContext = await browser.newContext(options);
  const admin = await adminContext.newPage();
  let originalIssuer: { signature_data_url: string | null; signature_position: "bottom-left" | "bottom-right" } | undefined;
  try {
    // Reject non-disposable DB targets before any global setting mutation.
    execFileSync("php", [resolve("../Backend/tests/support/program-achievement-browser-fixture.php"), "guard"], { env: process.env, stdio: "inherit" });
    const student = await studentContext.newPage();
    const other = await otherContext.newPage();
    await login(admin, "admin");
    await admin.goto("/admin/sertifikat");
    const issuerPath = "/api/admin/certificate-issuer";
    const original = await request(admin, issuerPath);
    expect(original.status).toBe(200);
    originalIssuer = original.body.data;
    const uploadedSignature = await admin.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 600;
      canvas.height = 200;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas unavailable");
      context.strokeStyle = "#132e4a";
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(40, 150);
      context.bezierCurveTo(150, 20, 280, 180, 550, 60);
      context.stroke();
      return canvas.toDataURL("image/png");
    });
    await admin.getByLabel(/Unggah tanda tangan|Ganti tanda tangan/).setInputFiles({ name: "signature.png", mimeType: "image/png", buffer: Buffer.from(uploadedSignature.split(",")[1], "base64") });
    await admin.getByRole("combobox", { name: "Posisi tanda tangan", exact: true }).selectOption("bottom-left");
    async function saveSignature() {
      const response = admin.waitForResponse(r => r.url() === api + issuerPath && r.request().method() === "POST");
      await admin.getByRole("button", { name: "Simpan Tanda Tangan Global", exact: true }).click();
      expect((await response).status()).toBe(200);
      await expect(admin.getByText("Tanda tangan global disimpan. Sertifikat yang sudah terbit tidak berubah.", { exact: true })).toBeVisible();
    }
    await saveSignature();
    const issuer = await request(admin, issuerPath);
    expect(issuer.status).toBe(200);
    expect(issuer.body.data.signature_position).toBe("bottom-left");
    const signature: string = issuer.body.data.signature_data_url;
    expect(signature).toMatch(/^data:image\/png;base64,/);
    expect(await admin.evaluate(async (saved) => {
      const image = await createImageBitmap(await (await fetch(saved)).blob());
      try { return [image.width, image.height]; }
      finally { image.close(); }
    }, signature)).toEqual([600, 200]);
    await admin.reload();
    await expect(admin.getByRole("combobox", { name: "Posisi tanda tangan", exact: true })).toHaveValue("bottom-left");
    const persistedPreview = admin.getByRole("region", { name: "Pratinjau konfigurasi tersimpan", exact: true });
    await expect(persistedPreview.locator('svg image[href^="data:image/png;base64,"]')).toHaveAttribute("href", signature);
    await expect(persistedPreview.locator('svg image[href^="data:image/png;base64,"]')).toHaveAttribute("x", "85");
    expect((await request(admin, issuerPath)).body.data).toEqual(issuer.body.data);
    const name = `C6 Browser ${fixture.token}`;
    const row = admin.getByRole("row").filter({ hasText: name });
    async function findRow() {
      await expect(admin.getByText("Memuat program…", { exact: true })).toHaveCount(0);
      const summary = await admin.getByRole("navigation", { name: "Halaman program" }).innerText();
      const lastPage = Number(summary.match(/dari (\d+)/)?.[1]);
      expect(lastPage).toBeGreaterThan(0);
      for (let page = 1; page <= lastPage; page++) {
        if (await row.count()) return;
        await admin.getByRole("button", { name: "Berikutnya", exact: true }).click();
        await expect(admin.getByText("Memuat program…", { exact: true })).toHaveCount(0);
      }
      throw new Error("Owned program missing from bounded admin pagination.");
    }
    await findRow();
    await expect(row.getByText("Default", { exact: true })).toBeVisible();
    await row.getByRole("button", { name: `Pratinjau tersimpan ${name}` }).click();
    await expect(admin.getByRole("dialog", { name: "Pratinjau Konfigurasi Tersimpan", exact: true }).getByRole("img")).toHaveAccessibleName(`Sertifikat penyelesaian ${name} — Hilmi Pebriana`);
    await admin.keyboard.press("Escape");
    const toggle = row.getByRole("switch");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    const title = "C6 Real completion title";
    const description = "C6 Real completion description";
    async function edit(newTitle: string, newDescription: string) {
      await row.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
      const editor = admin.getByRole("dialog", { name: "Edit Sertifikat", exact: true });
      await editor.getByRole("textbox", { name: "Judul", exact: true }).fill(newTitle);
      await editor.getByRole("textbox", { name: "Deskripsi", exact: true }).fill(newDescription);
      const draftPreview = admin.getByRole("dialog", { name: "Edit Sertifikat", exact: true }).getByRole("region", { name: "Pratinjau draf konfigurasi", exact: true });
      await expect(draftPreview.getByRole("img")).toHaveAccessibleName(`Sertifikat penyelesaian ${name} — Hilmi Pebriana`);
      await expect(draftPreview.locator("svg text").filter({ hasText: newTitle })).toHaveText(newTitle);
      await expect(draftPreview.locator("svg text").filter({ hasText: newDescription })).toHaveText(newDescription);
      await admin.getByRole("button", { name: "Simpan Pengaturan", exact: true }).click();
      await expect(row).toContainText(newTitle);
    }
    await edit(title, description);
    await admin.reload();
    await findRow();
    await expect(row).toContainText(title);
    await expect(row.getByText("Custom", { exact: true })).toBeVisible();
    await expect(row.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    const preview = await request(admin, `/api/admin/program-achievements/${fixture.program}/preview`);
    expect(preview.status).toBe(200);
    expect(preview.body.data.settings).toMatchObject({ title, description, automatic_enabled: true });
    expect(preview.body.data.is_default).toBe(false);
    await row.getByRole("button", { name: `Pratinjau tersimpan ${name}` }).click();
    await expect(admin.getByRole("dialog", { name: "Pratinjau Konfigurasi Tersimpan", exact: true }).getByRole("img")).toHaveAccessibleDescription(new RegExp(description));
    await admin.keyboard.press("Escape");

    await login(student, "student");
    await student.goto("/certificate");
    await expect(student.getByRole("heading", { name: /Belum ada sertifikat yang diterbitkan/ })).toBeVisible();
    expect((await request(student, "/api/student/program-achievements")).body.meta.total).toBe(0);
    execFileSync("php", [resolve("../Backend/tests/support/program-achievement-browser-fixture.php"), "complete"], { env: process.env, stdio: "inherit" });
    const reconcilePath = `/api/student/program-achievements/programs/${fixture.program}/reconcile`;
    const reconciled = await request(student, reconcilePath, "POST");
    expect(reconciled.status).toBe(200);
    expect(["issued", "existing"]).toContain(reconciled.body.reason);
    const collection = await request(student, "/api/student/program-achievements");
    expect(collection.status).toBe(200);
    expect(collection.body.meta.total).toBe(1);
    const award = collection.body.data[0];
    expect(award).toMatchObject({ program_id: fixture.program, student_name_snapshot: fixture.users.student.name, program_name_snapshot: name, program_code_snapshot: `c6-${fixture.token}`, learning_type_snapshot: "lms", presentation_snapshot: { title, description, signature_data_url: signature, signature_position: "bottom-left" } });
    expect(Number.isFinite(Date.parse(award.issued_at))).toBe(true);
    await student.reload();
    await expect(student.getByRole("link", { name: "Lihat Detail Sertifikat" })).toBeVisible();
    await student.getByRole("link", { name: "Lihat Detail Sertifikat" }).click();
    await expect(student).toHaveURL(`/certificate/${award.id}`);
    const certificate = student.getByRole("img", { name: `Sertifikat penyelesaian ${name} — ${fixture.users.student.name}`, exact: true });
    await expect(certificate).toBeVisible();
    await expect(certificate).toHaveAttribute("viewBox", "0 0 1123 794");
    for (const value of [fixture.users.student.name, name, title, description]) await expect(certificate.locator("text").filter({ hasText: value })).toHaveText(value);
    await expect(certificate).not.toContainText("Hilmi Pebriana");
    await expect(certificate.locator('image[href^="data:image/png;base64,"]')).toHaveAttribute("href", signature);
    await expect(certificate.locator('image[href^="data:image/png;base64,"]')).toHaveAttribute("x", "85");
    const signatureMarkup = await certificate.locator('image[href^="data:image/png;base64,"]').evaluate(element => element.outerHTML);
    const card = student.getByRole("article", { name: "Achievement digital", exact: true });
    for (const value of [fixture.users.student.name, name, `c6-${fixture.token}`, "Mandiri"]) await expect(card.getByText(value, { exact: true })).toBeVisible();
    await expect(card.locator("time")).toHaveAttribute("datetime", award.issued_at);
    await expect(card.locator("time")).toHaveText(new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" }).format(new Date(award.issued_at)));
    const downloadEvent = student.waitForEvent("download");
    await student.getByRole("button", { name: "Unduh PDF", exact: true }).click();
    const download = await downloadEvent;
    expect(await download.failure()).toBeNull();
    expect(download.suggestedFilename()).toBe(`HiruAcademy-c6-${fixture.token}.pdf`);
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const pdf = readFileSync(downloadPath!);
    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    const mediaBox = pdf.toString("latin1").match(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/);
    expect(mediaBox).not.toBeNull();
    expect(Number(mediaBox![1])).toBeCloseTo(297 / 25.4 * 72, 2);
    expect(Number(mediaBox![2])).toBeCloseTo(210 / 25.4 * 72, 2);
    await student.setViewportSize({ width: 390, height: 844 });
    await expect(certificate).toBeVisible();
    expect(await student.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await edit("Changed after issuance", "Changed description after issuance");
    await admin.getByRole("button", { name: "Hapus tanda tangan", exact: true }).click();
    await admin.getByRole("combobox", { name: "Posisi tanda tangan", exact: true }).selectOption("bottom-right");
    await saveSignature();
    await admin.reload();
    await expect(admin.getByRole("combobox", { name: "Posisi tanda tangan", exact: true })).toHaveValue("bottom-right");
    await expect(admin.getByRole("region", { name: "Pratinjau konfigurasi tersimpan", exact: true }).locator('svg image[href^="data:image/png;base64,"]')).toHaveCount(0);
    expect((await request(admin, issuerPath)).body.data).toEqual({ signature_data_url: null, signature_position: "bottom-right" });
    await student.reload();
    await expect(certificate).toBeVisible();
    await expect(certificate.locator("text").filter({ hasText: title })).toHaveText(title);
    await expect(certificate.locator("text").filter({ hasText: description })).toHaveText(description);
    expect(await certificate.locator('image[href^="data:image/png;base64,"]').evaluate(element => element.outerHTML)).toBe(signatureMarkup);
    await expect(card.getByText(name, { exact: true })).toBeVisible();
    expect((await request(student, `/api/student/program-achievements/${award.id}`)).body.data).toEqual(award);
    const repeated = await request(student, reconcilePath, "POST");
    expect(repeated.body.reason).toBe("existing");
    expect(repeated.body.data).toEqual(award);
    expect((await request(student, "/api/student/program-achievements")).body.meta.total).toBe(1);
    expect((await request(student, "/api/admin/program-achievements")).status).toBe(403);
    await login(other, "other");
    expect((await request(other, `/api/student/program-achievements/${award.id}`)).status).toBe(404);
    expect((await request(other, "/api/student/program-achievements")).body.meta.total).toBe(0);

    // Warm Next's SPA route cache before creating a real transport failure.
    await student.getByRole("link", { name: "Kembali ke Sertifikat" }).click();
    await expect(student.getByRole("link", { name: "Lihat Detail Sertifikat" })).toBeVisible();
    await expect(student.getByRole("link", { name: /PDF|Unduh|Download/i })).toHaveCount(0);
    await expect(student.getByRole("button", { name: /PDF|Unduh|Download/i })).toHaveCount(0);
    await student.getByRole("link", { name: "Lihat Detail Sertifikat" }).click();
    await expect(certificate).toBeVisible();
    // Keep Next's document online; fail a real in-page request without mocking API responses.
    await student.getByRole("link", { name: "Kembali ke Sertifikat" }).click();
    await expect(student.getByRole("link", { name: "Lihat Detail Sertifikat" })).toBeVisible();
    await student.getByRole("combobox").selectOption(String(fixture.program));
    await studentContext.setOffline(true);
    await student.getByRole("button", { name: "Periksa Penyelesaian", exact: true }).click();
    await expect(student.getByRole("status").filter({ hasText: "Pemeriksaan penyelesaian belum berhasil. Silakan coba lagi." })).toBeVisible();
    await studentContext.setOffline(false);
    await student.getByRole("button", { name: "Periksa Penyelesaian", exact: true }).click();
    await expect(student.getByRole("status").filter({ hasText: "Sertifikat program ini sudah diterbitkan." })).toBeVisible();
    await expect(student.getByRole("link", { name: "Lihat Detail Sertifikat" })).toBeVisible();
    console.log("REAL_ACHIEVEMENT_EVIDENCE", JSON.stringify({ awardId: award.id, collectionTotal: 1, learningType: award.learning_type_snapshot, issuedAt: award.issued_at, snapshotStable: true, signatureStableAfterGlobalRemoval: true, pdfHeader: "%PDF-", pdfPage: "A4 landscape", otherStudentStatus: 404, viewports: [1440, 390], realOfflineRetry: true }));
  } finally {
    try {
      if (originalIssuer) {
        const restored = await admin.evaluate(async ({ api, issuer }) => {
          const body = new FormData();
          body.set("signature_position", issuer.signature_position);
          if (issuer.signature_data_url) {
            const image = await fetch(issuer.signature_data_url);
            body.set("signature", await image.blob(), "original-signature.png");
          } else body.set("remove_signature", "1");
          const token = document.cookie.split("; ").find(c => c.startsWith("XSRF-TOKEN="))?.slice(11);
          const response = await fetch(`${api}/api/admin/certificate-issuer`, { method: "POST", credentials: "include", headers: { Accept: "application/json", ...(token ? { "X-XSRF-TOKEN": decodeURIComponent(token) } : {}) }, body });
          return { status: response.status, body: await response.json() };
        }, { api, issuer: originalIssuer });
        expect(restored.status).toBe(200);
        expect(restored.body.data).toEqual(originalIssuer);
      }
    } finally {
      await Promise.all([adminContext.close(), studentContext.close(), otherContext.close()]);
    }
  }
});
