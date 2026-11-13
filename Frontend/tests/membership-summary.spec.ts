import { expect, test } from "./canonical-fixture";

for (const width of [1440, 768, 390]) test(`membership summary stays unified at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  const programs = [
    { id: 1, code: "n1", slug: "n1", name: "JLPT N1", family: "jlpt" },
    { id: 2, code: "ssw-food", slug: "ssw-food", name: "SSW Pengolahan Makanan", family: "ssw" },
    { id: 3, code: "interview", slug: "interview", name: "Interview", family: "interview" },
  ];
  await page.route("**/api/student/dashboard", route => route.fulfill({ json: { data: {
    programs, chapters: [], access: {
      learning: Object.fromEntries(programs.map(program => [program.code, "full"])),
      replay_levels: ["n1"],
      source_grants: programs.map(program => ({ program_code: program.code, plan_code: program.code === "n1" ? "sensei" : "lms", starts_at: "2026-10-05T00:00:00+07:00", ends_at: "2027-10-05T00:00:00+07:00" })),
    },
  } } }));
  await page.goto("/renewal?membership=sensei");
  const summary = page.getByRole("region", { name: "Membership & Akses Belajar", exact: true });
  await expect(summary).toHaveCount(1);
  await expect(summary.getByRole("heading", { name: "Kelas bersama Sensei" })).toBeVisible();
  await expect(summary.getByText("Aktif", { exact: true })).toBeVisible();
  await expect(summary.getByText("3 program dimiliki")).toBeVisible();
  await expect(summary.getByText("3 program", { exact: true })).toBeVisible();
  await expect(summary.getByText("1 level", { exact: true })).toBeVisible();
  await expect(summary.locator(".renewal-membership-rows > li")).toHaveCount(3);
  await expect(summary.locator(".renewal-membership-rows")).toContainText("5 Okt 2026");
  await expect(summary.locator(".renewal-membership-rows")).toContainText("5 Okt 2027");
  await expect(summary.locator(".renewal-membership-rows")).toContainText("365 hari");
  const chips = summary.locator(".renewal-access-chips");
  await expect(chips.first()).toBeHidden();
  await summary.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(chips.first().getByText("SSW Pengolahan Makanan", { exact: true })).toBeVisible();
  await expect(chips.last().getByText("JLPT N1", { exact: true })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(chips.first()).toBeHidden();
  await expect(page.getByRole("complementary", { name: "Ketentuan perpanjangan membership" })).toContainText("Membership aktif diperpanjang dari tanggal berakhir");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("free membership uses API preview access without active badge", async ({ page }) => {
  await page.route("**/api/student/dashboard", route => route.fulfill({ json: { data: {
    programs: [], chapters: [], access: { learning: { n5: "preview", n4: "none" }, replay_levels: [], source_grants: [] },
  } } }));
  await page.goto("/renewal?membership=sensei");
  const summary = page.getByRole("region", { name: "Membership & Akses Belajar", exact: true });
  await expect(summary.getByText("Aktif", { exact: true })).toHaveCount(0);
  await expect(summary.getByText("1 program preview", { exact: true })).toBeVisible();
  await expect(summary.getByRole("status")).toContainText("Belum ada membership aktif");
});
