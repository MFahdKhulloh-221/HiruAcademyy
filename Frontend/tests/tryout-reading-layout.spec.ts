import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

for (const width of [1440, 768, 390]) test(`Dokkai flows above answers without internal scrollbar ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.setContent(`<section class="tryout-runner-polished tryout-placement-style tryout-readable-content"><div class="learning-question-layout tryout-shared-reading"><main><section class="exam-reading-passage"><h2>Teks Bacaan</h2><div class="exam-reading-scroll">${"田中さんへ\n明日の来社時間が11時に変更となりました。\n".repeat(40)}</div></section><section class="learning-question-card exam-reading-questions"><h2>このメモを書いた人が最も伝えたいことは何ですか。（____）</h2><fieldset><legend>Pilihan jawaban</legend>${["A", "B", "C", "D"].map(letter => `<label>${letter}. ${"会議室の予約時間を変更してほしいこと。".repeat(20)}</label>`).join("")}</fieldset></section></main></div></section>`);
  await page.addStyleTag({ content: readFileSync("src/components/assessment-layout.css", "utf8") });
  await page.addStyleTag({ content: readFileSync("src/components/tryout-timing.css", "utf8") });
  const passage = page.locator(".exam-reading-passage");
  const answers = page.locator(".exam-reading-questions");
  const passageBox = (await passage.boundingBox())!;
  const answersBox = (await answers.boundingBox())!;
  expect(answersBox.y).toBeGreaterThanOrEqual(passageBox.y + passageBox.height);
  expect(await page.locator(".exam-reading-scroll").evaluate(element => ({ overflow: getComputedStyle(element).overflowY, scrollable: element.scrollHeight > element.clientHeight, maxHeight: getComputedStyle(element).maxHeight }))).toEqual({ overflow: "visible", scrollable: false, maxHeight: "none" });
  expect(await answers.locator("h2").evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeLessThanOrEqual(20);
  expect(await answers.evaluate(element => ({ overflow: getComputedStyle(element).overflowY, fits: element.scrollHeight <= element.clientHeight + 1 }))).toEqual({ overflow: "visible", fits: true });
});
