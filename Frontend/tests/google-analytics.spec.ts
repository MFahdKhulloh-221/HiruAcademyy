import { expect, test } from "@playwright/test";

const id = "G-93DCMCP6N9";

test("GA4 requires consent, strips URL data, tracks navigation once, excludes private pages and revokes", async ({ page }) => {
  let scriptRequests = 0;
  await page.route("**/api/me", route => route.fulfill({ status: 401, json: { message: "Unauthenticated." } }));
  await page.route("**/api/public/analytics-config", route => route.fulfill({ json: { data: { measurementId: id } } }));
  await page.route("https://www.googletagmanager.com/**", route => {
    scriptRequests++;
    return route.fulfill({ contentType: "application/javascript", body: "/* mocked: no data sent to Google */" });
  });
  await page.goto("/kebijakan-privasi?utm_source=newsletter&utm_medium=email&utm_campaign=launch_2026&gclid=SafeClickToken&email=private%40example.com&utm_term=private%40example.com&utm_content=081234567890#secret", { referer: "https://referrer.example/path?email=private%40example.com" });
  await expect(page.getByRole("region", { name: "Persetujuan analitik" })).toBeVisible();
  expect(scriptRequests).toBe(0);
  expect(await page.locator("#hiru-google-analytics").count()).toBe(0);
  await page.getByRole("button", { name: "Tolak analitik" }).click();
  await expect(page.getByRole("button", { name: "Preferensi analitik" })).toBeVisible();
  expect(scriptRequests).toBe(0);
  await page.getByRole("button", { name: "Preferensi analitik" }).click();
  await page.getByRole("button", { name: "Izinkan analitik" }).click();
  await expect(page.locator("#hiru-google-analytics")).toHaveAttribute("src", `https://www.googletagmanager.com/gtag/js?id=${id}`);
  const events = () => page.evaluate(() => ((window as Window & { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? []).map(item => Array.from(item)));
  await expect.poll(async () => (await events()).filter(item => item[0] === "event" && item[1] === "page_view").length).toBe(1);
  expect(JSON.stringify(await events())).not.toMatch(/private|081234567890|secret|referrer.example\/path/);
  const pageView = (await events()).find(item => item[0] === "event" && item[1] === "page_view");
  expect(pageView?.[2]).toMatchObject({ page_location: "http://localhost:3000/kebijakan-privasi?utm_source=newsletter&utm_medium=email&utm_campaign=launch_2026&gclid=SafeClickToken", page_referrer: "https://referrer.example" });
  await page.evaluate(() => {
    const link = document.createElement("a");
    link.href = "https://wa.me/6281234567890?text=private";
    link.addEventListener("click", event => event.preventDefault());
    document.body.append(link);
    link.click(); link.remove();
    const file = document.createElement("a");
    file.href = "/private-name.pdf?signature=secret";
    file.addEventListener("click", event => event.preventDefault());
    document.body.append(file);
    file.click(); file.remove();
    const video = document.createElement("video");
    document.body.append(video);
    video.dispatchEvent(new Event("playing"));
    video.dispatchEvent(new Event("playing"));
    video.dispatchEvent(new Event("ended"));
    video.remove();
    const button = document.createElement("button");
    button.dataset.analyticsVideoProvider = "youtube";
    document.body.append(button); button.click(); button.remove();
  });
  await page.evaluate(() => { document.body.style.minHeight = "10000px"; window.scrollTo(0, document.documentElement.scrollHeight); });
  await expect.poll(async () => (await events()).filter(item => item[0] === "event" && item[1] === "scroll").length).toBe(1);
  await page.evaluate(() => { window.dispatchEvent(new Event("scroll")); document.body.style.minHeight = ""; window.scrollTo(0, 0); });
  const interactions = (await events()).filter(item => item[0] === "event");
  expect(interactions.filter(item => item[1] === "scroll")).toHaveLength(1);
  for (const name of ["click", "file_download", "video_start", "video_complete", "video_open"]) expect(interactions.filter(item => item[1] === name)).toHaveLength(1);
  expect(JSON.stringify(interactions)).not.toMatch(/private|6281234567890|signature|secret/);
  await page.getByRole("link", { name: "Hiru Academy", exact: true }).first().click();
  await expect(page).toHaveURL("http://localhost:3000/");
  await expect.poll(async () => (await events()).filter(item => item[0] === "event" && item[1] === "page_view").length).toBe(2);
  expect(scriptRequests).toBe(1);
  // Client navigation keeps loaded JS alive; excluded routes must disable it and remove listeners.
  // Use existing Next Link for actual SPA transition, not a full document reload.
  const login = page.locator('a[href="/login"]').first();
  await login.click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator("#hiru-google-analytics")).toHaveCount(1);
  await expect.poll(() => page.evaluate(id => (window as unknown as Record<string, unknown>)[`ga-disable-${id}`], id)).toBe(true);
  const before = (await events()).filter(item => item[0] === "event").length;
  await page.evaluate(() => window.dispatchEvent(new Event("scroll")));
  expect((await events()).filter(item => item[0] === "event")).toHaveLength(before);
  await page.goBack();
  await expect(page.getByRole("button", { name: "Preferensi analitik" })).toBeVisible();
  await page.getByRole("button", { name: "Preferensi analitik" }).click();
  await page.getByRole("button", { name: "Tolak analitik" }).click();
  await expect(page.getByRole("button", { name: "Preferensi analitik" })).toBeVisible();
  await expect(page.locator("#hiru-google-analytics")).toHaveCount(0);
  expect(scriptRequests).toBe(1);
  await page.evaluate(() => localStorage.setItem("hiru.analytics-consent.v1", "granted"));
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Preferensi analitik" })).toHaveCount(0);
  await expect(page.locator("#hiru-google-analytics")).toHaveCount(0);
});

test("disabled config and admin identity never load GA4", async ({ page }) => {
  let idEnabled = false;
  await page.route("**/api/public/analytics-config", route => route.fulfill({ json: { data: { measurementId: idEnabled ? id : null } } }));
  await page.route("**/api/me", route => idEnabled
    ? route.fulfill({ json: { data: { id: 1, role: "admin", name: "Admin", email: "admin@example.test", whatsapp: "081234567890", account_status: "active" } } })
    : route.fulfill({ status: 401, json: { message: "Unauthenticated." } }));
  await page.addInitScript(() => localStorage.setItem("hiru.analytics-consent.v1", "granted"));
  await page.goto("/kebijakan-privasi");
  await expect(page.getByRole("heading", { name: "Kebijakan Privasi Hiru Academy", exact: true })).toBeVisible();
  await expect(page.locator("#hiru-google-analytics")).toHaveCount(0);
  idEnabled = true;
  await page.reload();
  await expect(page.getByRole("heading", { name: "Kebijakan Privasi Hiru Academy", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preferensi analitik" })).toHaveCount(0);
  await expect(page.locator("#hiru-google-analytics")).toHaveCount(0);
});
