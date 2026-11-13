import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const adminPath = "/api/admin/program-achievements";
const studentPath = "/api/student/program-achievements";
const name = "Sakura Tanaka " + "NamaSiswaSangatPanjang".repeat(5);
const template = () => ({ program: { id: 1, code: "n5", name: "JLPT N5" }, settings: { automatic_enabled: true, title: "Template awal", description: "Deskripsi awal", background_image: null, presentation_version: 1 }, is_default: true });
const achievement = () => ({ id: 71, program_id: 1, student_name_snapshot: name, program_name_snapshot: "JLPT N5", program_code_snapshot: "n5", learning_type_snapshot: "lms", presentation_snapshot: { title: "Sertifikat snapshot", description: "Deskripsi saat penerbitan", background_image: null, presentation_version: 1, issuer: "HIRU Academy" }, issued_at: "2026-10-20T12:00:00.000Z" });
const paged = (data: unknown[]) => ({ data, meta: { current_page: 1, last_page: 1, total: data.length, per_page: 20 } });

// Mock API only: unknown API calls fail closed; no Laravel or DB is used.
async function mockApi(page: Page, admin = false) {
  const state = {
    row: template(), snapshots: [achievement()], emptyAdmin: false,
    issuer: { signature_data_url: null, signature_position: "bottom-right" },
    listError: false, previewError: false, saveError: false, issuerValidationError: false,
    hold: null as Promise<void> | null,
    writes: [] as { method: string; path: string; body: unknown }[],
    unexpected: [] as string[], pdf: [] as string[], downloads: [] as string[],
  };
  page.on("download", download => state.downloads.push(download.suggestedFilename()));
  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (/\.pdf(?:$|[/?])|\/pdf(?:$|\/)|\/download(?:$|\/)/i.test(path)) {
      state.pdf.push(path);
      return route.abort();
    }
    if (!/^\/(api(?:\/|$)|sanctum(?:\/|$))/.test(path)) {
      if (url.origin === "http://localhost:3027") return route.continue();
      if (url.hostname === "fonts.googleapis.com") return route.fulfill({ contentType: "text/css", body: "" });
      return route.abort();
    }
    const method = request.method();
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "http://localhost:3027", "access-control-allow-credentials": "true", "access-control-allow-methods": "GET, POST, PATCH, OPTIONS", "access-control-allow-headers": "content-type, x-xsrf-token, x-requested-with, accept" } });
    if (method !== "GET") state.writes.push({ method, path, body: request.postData() ? request.headers()["content-type"]?.includes("application/json") ? request.postDataJSON() : request.postData() : null });
    if (path === "/api/admin/certificate-issuer" && method === "GET") return route.fulfill({ json: { data: state.issuer } });
    if (path === "/api/admin/certificate-issuer" && method === "POST") {
      if (state.issuerValidationError) return route.fulfill({ status: 422, json: { message: "The given data was invalid.", errors: { signature: ["Tanda tangan harus memiliki latar transparan."] } } });
      const position = request.postData()?.match(/name="signature_position"\r\n\r\n(bottom-left|bottom-right)/)?.[1];
      if (position) state.issuer.signature_position = position;
      return route.fulfill({ json: { data: state.issuer } });
    }
    if (path === "/sanctum/csrf-cookie" && method === "GET") return route.fulfill({ status: 204, headers: { "set-cookie": "XSRF-TOKEN=mock; Path=/; SameSite=Lax" } });
    if (path === "/api/me" && method === "GET") return route.fulfill({ json: { data: { id: 91, name: "Mock User", email: "mock@example.test", whatsapp: "081234567890", role: admin ? "admin" : "student", account_status: "active" } } });
    if (path === "/api/student/notifications" && method === "GET") return route.fulfill({ json: { data: [] } });
    if (path === "/api/student/dashboard" && method === "GET") return route.fulfill({ json: { data: { programs: [{ id: 1, code: "n5", name: "JLPT N5" }], access: { learning: { n5: "full" }, replay_levels: [], source_grants: [{ plan_code: "lms", program_code: "n5" }] }, chapters: [] } } });
    if (path === adminPath && method === "GET" || path === studentPath && method === "GET") {
      if (state.hold) await state.hold;
      return route.fulfill(state.listError ? { status: 500, json: {} } : { json: paged(path === adminPath ? state.emptyAdmin ? [] : [state.row] : state.snapshots) });
    }
    if (path === `${adminPath}/1` && method === "PATCH") {
      if (state.saveError) return route.fulfill({ status: 500, json: {} });
      state.row.settings = { ...state.row.settings, ...request.postDataJSON() };
      state.row.is_default = false;
      return route.fulfill({ json: { data: state.row } });
    }
    if (path === `${adminPath}/1/preview` && method === "GET") return route.fulfill(state.previewError ? { status: 500, json: {} } : { json: { data: state.row } });
    if (path === `${studentPath}/71` && method === "GET") return route.fulfill({ json: { data: state.snapshots[0] } });
    if (path === `${studentPath}/programs/1/reconcile` && method === "POST") return route.fulfill({ json: { data: null, reason: "disabled" } });
    state.unexpected.push(`${method} ${path}`);
    return route.fulfill({ status: 501, json: { message: "Unmocked API request" } });
  });
  return state;
}

type MockState = Awaited<ReturnType<typeof mockApi>>;
async function clean(page: Page, state: MockState) {
  expect(state.unexpected).toEqual([]);
  expect(state.pdf).toEqual([]);
  expect(state.downloads).toEqual([]);
  await expect(page.getByRole("button", { name: /PDF|unduh|download/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /PDF|unduh|download/i })).toHaveCount(0);
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function cardFits(page: Page) {
  expect(await page.getByRole("article", { name: "Achievement digital" }).evaluate(element => {
    const box = element.getBoundingClientRect();
    return box.left >= 0 && box.right <= innerWidth && element.scrollHeight <= element.clientHeight && element.scrollWidth <= element.clientWidth;
  })).toBe(true);
}

for (const width of [1440, 768, 390]) {
  test(`mock API: student snapshot detail wraps at ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const state = await mockApi(page);
    await page.goto("/certificate");
    if (width === 1440) {
      const signature = await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 600; canvas.height = 200;
        const context = canvas.getContext("2d")!;
        context.strokeStyle = "#132E4A";
        context.lineWidth = 5;
        context.beginPath(); context.moveTo(80, 140); context.bezierCurveTo(180, 10, 260, 190, 500, 60); context.stroke();
        return canvas.toDataURL("image/png");
      });
      Object.assign(state.snapshots[0].presentation_snapshot, { signature_data_url: signature, signature_position: "bottom-right" });
    }
    await expect(page.getByRole("article", { name: "Achievement digital" })).toBeVisible();
    await noOverflow(page);
    await cardFits(page);
    await clean(page, state);
    await page.getByRole("link", { name: /lihat.*sertifikat|detail/i }).click();
    await expect(page).toHaveURL(/\/certificate\/71$/);
    const certificate = page.getByRole("img", { name: `Sertifikat penyelesaian JLPT N5 — ${name}`, exact: true });
    await expect(certificate).toBeVisible();
    await expect(certificate.locator('image[href="/brand/hiru-bawah.png"]')).toBeVisible();
    await expect(certificate.locator('image[href^="data:image/png;base64,"]')).toHaveCount(width === 1440 ? 1 : 0);
    if (width === 1440) await expect(certificate.locator('image[href^="data:image/png;base64,"]')).toHaveAttribute("href", /^data:image\/png;base64,/);
    await expect(certificate.getByText(name, { exact: true })).toBeVisible();
    await expect(certificate.getByText("Sertifikat snapshot", { exact: true })).toBeVisible();
    await expect(certificate.getByText("20 Oktober 2026", { exact: true })).toBeVisible();
    await expect(page.getByText(/nomor sertifikat|certificate (number|no\.)/i)).toHaveCount(0);
    await expect(page.getByText("Mandiri", { exact: true })).toBeVisible();
    await noOverflow(page);
    await cardFits(page);
    state.row.settings.title = "Template berubah setelah terbit";
    state.row.settings.description = "Deskripsi berubah";
    await page.reload();
    await expect(certificate.getByText("Sertifikat snapshot", { exact: true })).toBeVisible();
    await expect(certificate.getByText("Deskripsi saat penerbitan", { exact: true })).toBeVisible();
    await expect(page.getByText("Template berubah setelah terbit")).toHaveCount(0);
    if (width === 1440) await page.screenshot({ path: testInfo.outputPath("certificate-detail-desktop.png"), fullPage: true });
    await page.evaluate(() => {
      const createObjectURL = URL.createObjectURL.bind(URL);
      const pdfTypes: string[] = [];
      Object.assign(window, { certificatePdfTypes: pdfTypes });
      URL.createObjectURL = blob => {
        if (blob instanceof Blob && blob.type === "application/pdf") pdfTypes.push(blob.type);
        return createObjectURL(blob);
      };
    });
    const pendingDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Unduh PDF", exact: true }).click();
    const download = await pendingDownload;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const bytes = await readFile(downloadPath!);
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
    const mediaBox = bytes.toString("latin1").match(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/);
    expect(mediaBox).not.toBeNull();
    expect(Number(mediaBox![1])).toBeCloseTo(841.89, 1);
    expect(Number(mediaBox![2])).toBeCloseTo(595.28, 1);
    expect(await page.evaluate(() => Reflect.get(window, "certificatePdfTypes"))).toEqual(["application/pdf"]);
    expect(state.writes).toEqual([]);
    expect(state.unexpected).toEqual([]);
    expect(state.pdf).toEqual([]);
    expect(state.downloads).toEqual([download.suggestedFilename()]);
  });
}

test("mock API: student loading, error retry, empty, explicit refresh reason", async ({ page }) => {
  const state = await mockApi(page);
  state.snapshots = [];
  state.listError = true;
  let release!: () => void;
  state.hold = new Promise<void>(resolve => { release = resolve; });
  await page.goto("/certificate");
  await expect(page.getByRole("status").filter({ hasText: /Memuat/i }).first()).toBeVisible();
  release();
  await expect(page.getByRole("alert").filter({ hasText: /\S/ }).first()).toBeVisible();
  state.hold = null;
  state.listError = false;
  await page.getByRole("button", { name: "Coba Lagi Sertifikat", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Belum ada sertifikat/i })).toBeVisible();
  expect(state.writes).toEqual([]);
  await page.getByRole("combobox").selectOption("1");
  await page.getByRole("button", { name: /periksa|perbarui|refresh/i }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0]).toMatchObject({ method: "POST", path: `${studentPath}/programs/1/reconcile` });
  expect([null, "{}"]).toContain(state.writes[0].body === null ? null : JSON.stringify(state.writes[0].body));
  await expect(page.getByRole("status").filter({ hasText: /otomatis.*(nonaktif|aktif)|belum.*diaktifkan/i }).first()).toBeVisible();
  await clean(page, state);
});

for (const width of [1440, 768, 390]) {
  test(`mock API: admin list toggle edit preview save at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const state = await mockApi(page, true);
    await page.goto("/admin/sertifikat");
    await expect(page.getByRole("cell").getByText("JLPT N5", { exact: true })).toBeVisible();
    await noOverflow(page);
    await expect(page.getByRole("cell", { name: "Default", exact: true })).toBeVisible();
    await expect(page.getByRole("switch")).toBeChecked();
    await page.getByRole("switch", { name: "Penerbitan otomatis JLPT N5", exact: true }).click();
    await expect.poll(() => state.row.settings.automatic_enabled).toBe(false);
    await expect(page.getByRole("cell", { name: "Custom", exact: true })).toBeVisible();
    expect(state.writes[0]).toMatchObject({ method: "PATCH", path: `${adminPath}/1`, body: { automatic_enabled: false } });
    await page.getByRole("button", { name: /edit/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Judul", { exact: true }).fill("Judul baru");
    await dialog.getByRole("textbox", { name: "Deskripsi", exact: true }).fill("Deskripsi baru");
    await noOverflow(page);
    await dialog.getByRole("button", { name: /simpan/i }).click();
    await expect(dialog).toHaveCount(0);
    expect(state.row.settings).toMatchObject({ automatic_enabled: false, title: "Judul baru", description: "Deskripsi baru" });
    expect(state.writes.at(-1)).toMatchObject({ method: "PATCH", path: `${adminPath}/1`, body: { title: "Judul baru", description: "Deskripsi baru" } });
    await page.getByRole("button", { name: /pratinjau|lihat/i }).click();
    await expect(page.getByRole("dialog").getByText("Judul baru", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /pratinjau|lihat/i })).toBeFocused();
    await clean(page, state);
  });
}

test("mock API: admin rejects invalid signature and previews global position before multipart save", async ({ page }) => {
  const state = await mockApi(page, true);
  await page.goto("/admin/sertifikat");
  const upload = page.getByLabel("Unggah tanda tangan", { exact: true });
  await expect(upload).toBeEnabled();
  await upload.setInputFiles({ name: "signature.jpg", mimeType: "image/jpeg", buffer: Buffer.from("not a PNG") });
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText("Tanda tangan harus PNG maksimal 2 MB.");
  await upload.setInputFiles({ name: "signature.png", mimeType: "image/png", buffer: Buffer.from("not a PNG") });
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText("Berkas harus berupa PNG yang valid.");
  expect(state.writes).toEqual([]);
  const preview = page.getByRole("img", { name: "Sertifikat penyelesaian JLPT N5 — Hilmi Pebriana", exact: true });
  await expect(page.getByRole("combobox", { name: /Program pratinjau/ })).toHaveValue("1");
  const issuerName = preview.getByText("HiruAcademy", { exact: true }).last();
  await expect(issuerName).toHaveAttribute("x", "918");
  await page.getByRole("combobox", { name: /Posisi tanda tangan/ }).selectOption("bottom-left");
  await expect(issuerName).toHaveAttribute("x", "205");
  await expect(page.getByRole("status").filter({ hasText: "Perubahan tanda tangan belum disimpan." })).toBeVisible();
  expect(state.writes).toEqual([]);
  await page.getByRole("button", { name: "Simpan Tanda Tangan Global", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Tanda tangan global disimpan." })).toBeVisible();
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0]).toMatchObject({ method: "POST", path: "/api/admin/certificate-issuer" });
  expect(state.writes[0].body).toContain('name="signature_position"\r\n\r\nbottom-left');
  expect(state.issuer.signature_position).toBe("bottom-left");
  state.issuerValidationError = true;
  await page.getByRole("combobox", { name: /Posisi tanda tangan/ }).selectOption("bottom-right");
  await page.getByRole("button", { name: "Simpan Tanda Tangan Global", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Tanda tangan harus memiliki latar transparan." })).toBeVisible();
  expect(state.issuer.signature_position).toBe("bottom-left");
  await expect(issuerName).toHaveAttribute("x", "918");
  await clean(page, state);
});

test("mock API: admin preview and save failures retain settings", async ({ page }) => {
  const state = await mockApi(page, true);
  state.previewError = true;
  await page.goto("/admin/sertifikat");
  await page.getByRole("button", { name: /pratinjau|lihat/i }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /edit/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Judul", { exact: true }).fill("Belum tersimpan");
  state.saveError = true;
  await dialog.getByRole("button", { name: /simpan/i }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(dialog.getByLabel("Judul", { exact: true })).toHaveValue("Belum tersimpan");
  expect(state.row.settings.title).toBe("Template awal");
  await clean(page, state);
});

test("mock API: admin loading error retry empty", async ({ page }) => {
  const state = await mockApi(page, true);
  state.emptyAdmin = true;
  state.listError = true;
  let release!: () => void;
  state.hold = new Promise<void>(resolve => { release = resolve; });
  await page.goto("/admin/sertifikat");
  await expect(page.getByRole("status").filter({ hasText: /Memuat/i }).first()).toBeVisible();
  release();
  await expect(page.getByRole("alert").filter({ hasText: /\S/ }).first()).toBeVisible();
  state.hold = null;
  state.listError = false;
  await page.getByRole("button", { name: "Coba Lagi", exact: true }).click();
  await expect(page.getByText(/Belum ada (data|program)/i).first()).toBeVisible();
  expect(state.writes).toEqual([]);
  await clean(page, state);
});
