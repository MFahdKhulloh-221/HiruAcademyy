import { expect, test } from "./canonical-fixture";

test.describe("Placement regression tests", () => {
  test("First question has NO Sebelumnya button and next button stays aligned to the right", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.context().addCookies([{ name: "XSRF-TOKEN", value: "fixture", url: baseURL! }]);

    const attempt = {
      id: 99,
      status: "in_progress",
      questions: [
        {
          id: 1,
          category: "Bunpou",
          prompt: "Soal pertama tes placement?",
          options: { A: "Opsi 1", B: "Opsi 2", C: "Opsi 3", D: "Opsi 4" },
        },
        {
          id: 2,
          category: "Bunpou",
          prompt: "Soal kedua tes placement?",
          options: { A: "Opsi 1", B: "Opsi 2", C: "Opsi 3", D: "Opsi 4" },
        },
      ],
      answers: {} as Record<string, string>,
      result: null,
      expires_at: new Date(Date.now() + 600000).toISOString(),
    };

    await page.route("**/api/placement/attempts/99**", async (route) => {
      const request = route.request();
      if (request.method() === "PUT") {
        attempt.answers = request.postDataJSON().answers;
      }
      await route.fulfill({ json: { data: attempt } });
    });

    await page.goto("/placement/question?attempt=99");

    // First question verification: NO 'Sebelumnya' button in DOM
    await expect(page.getByRole("heading", { name: "Soal pertama tes placement?" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Sebelumnya/ })).toHaveCount(0);

    const nextBtn = page.getByRole("button", { name: /Lanjut Soal|Selesaikan Test/ });
    await expect(nextBtn).toBeVisible();

    const box = await nextBtn.boundingBox();
    const container = await page.locator(".placement-actions-custom").boundingBox();
    expect(box).not.toBeNull();
    expect(container).not.toBeNull();
    // Next button must be flush against right side (margin-left: auto)
    expect(container!.x + container!.width - (box!.x + box!.width)).toBeLessThan(10);

    // Select answer and advance to question 2
    await page.getByRole("radio").first().check();
    await expect(nextBtn).toBeEnabled();
    await nextBtn.click();

    // Second question verification: 'Sebelumnya' button is present
    await expect(page.getByRole("heading", { name: "Soal kedua tes placement?" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Sebelumnya/ })).toBeVisible();
  });

  test("Admin placement rules update by identity without duplicating", async ({ page }) => {
    let mockRules = [
      {
        id: "rule-1",
        minScore: 0,
        maxScore: 50,
        recommendedProgramCode: "N5",
        resultTitle: "N5 Dasar",
        resultDescription: "Belajar N5",
      },
    ];

    await page.route("**/api/admin/placement-configs**", async (route) => {
      const method = route.request().method();
      if (method === "GET") {
        await route.fulfill({
          json: {
            data: [
              {
                id: 1,
                title: "Placement Config",
                intro_heading: "Intro",
                duration_minutes: 10,
                description: "Desc",
                status: "draft",
                recommendation_rules: mockRules,
              },
            ],
          },
        });
      } else if (method === "PATCH" || method === "POST") {
        const body = route.request().postDataJSON();
        if (body.recommendation_rules) {
          mockRules = body.recommendation_rules;
        }
        await route.fulfill({
          json: {
            data: {
              id: 1,
              title: "Placement Config",
              intro_heading: "Intro",
              duration_minutes: 10,
              description: "Desc",
              status: "draft",
              recommendation_rules: mockRules,
            },
          },
        });
      } else {
        await route.fallback();
      }
    });

    await page.route("**/api/admin/placement-questions**", async (route) => {
      await route.fulfill({ json: { data: [] } });
    });

    await page.goto("/admin/placement-hasil");
    await page.getByRole("tab", { name: "Aturan Hasil" }).click();

    await expect(page.getByText("N5 Dasar")).toBeVisible();
    expect(mockRules.length).toBe(1);

    // Edit rule-1
    await page.getByRole("button", { name: "Edit" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Judul Rekomendasi").fill("N5 Dasar Diperbarui");
    await dialog.getByLabel("Skor Maksimal (%)").fill("55");
    await dialog.getByRole("button", { name: "Simpan Aturan" }).click();
    await expect(dialog).toHaveCount(0);

    // Save rules to API
    await page.getByRole("button", { name: "Simpan Aturan" }).click();
    await expect(page.locator(".placement-notice")).toContainText("Aturan rekomendasi disimpan.");

    // Rule must be modified in-place and NOT duplicated
    expect(mockRules.length).toBe(1);
    expect(mockRules[0].id).toBe("rule-1");
    expect(mockRules[0].resultTitle).toBe("N5 Dasar Diperbarui");
    expect(mockRules[0].maxScore).toBe(55);
  });
});
