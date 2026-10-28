import { test, expect } from "./canonical-fixture";

test("Program header simplified; Chapter keeps old link and defaults to Dasar", async ({ page }) => {
  await page.route("**/api/admin/programs", route => route.fulfill({ json: { data: [
    { id: 1, name: "Dasar", code: "dasar", family: "foundation", sort_order: 0, status: "active" },
    { id: 2, name: "JLPT N5", code: "n5", family: "jlpt", sort_order: 1, status: "active" },
  ] } }));
  await page.route("**/api/admin/chapters", route => route.fulfill({ json: { data: [
    { id: 11, program_id: 1, title: "Chapter Dasar", sort_order: 0, status: "draft" },
    { id: 21, program_id: 2, title: "Chapter N5", sort_order: 0, status: "draft" },
  ] } }));
  await page.goto("/admin/kurikulum-materi?tab=Program");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveCount(0);
  await expect(page.getByText("ADMIN • CONTENT STUDIO", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Program", exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "Journey / Kurikulum & Materi" }).getByRole("link", { name: "Chapter", exact: true }).click();
  await expect(page).toHaveURL(/tab=Kurikulum$/);
  await expect(page.getByRole("heading", { name: "Chapter", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Journey / Kurikulum & Materi" }).getByRole("link", { name: "Mini Checkpoint", exact: true })).toHaveAttribute("href", "/admin/kurikulum-materi?tab=Mini%20Checkpoint");
  const toolbar = page.locator(".admin-journey-toolbar");
  await expect(toolbar.getByLabel("Program", { exact: true })).toHaveValue("1");
  await expect(toolbar.getByRole("option", { name: "Pilih Program", exact: true })).toHaveCount(0);
  await expect(page.getByRole("table")).toContainText("Chapter Dasar");
  await expect(page.getByRole("table")).not.toContainText("Chapter N5");
  await toolbar.getByRole("button", { name: "+ Tambah Chapter", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("combobox").first()).toHaveValue("1");
  await page.getByRole("dialog").getByRole("button", { name: "Batal", exact: true }).click();
  await toolbar.getByLabel("Program", { exact: true }).selectOption("2");
  await expect(page.getByRole("table")).toContainText("Chapter N5");
  await expect(page.getByRole("table")).not.toContainText("Chapter Dasar");
});
