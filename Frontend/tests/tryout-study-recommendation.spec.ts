import { test, expect } from "@playwright/test";
import { tryoutStudyRecommendations } from "../src/lib/tryout-study-recommendation";

const score = (code: string, correct: number, total = 10) => ({ code, label: code, correct, wrong: total - correct, unanswered: 0, earned: correct, max: total, passing_score_basis: "correct" });
test("study recommendations choose lowest percentage and every tied session", () => {
  expect(tryoutStudyRecommendations([score("reading", 2), score("audio", 6), score("grammar", 8), score("vocabulary", 7)]).map(item => item.code)).toEqual(["reading"]);
  expect(tryoutStudyRecommendations([score("reading", 2), score("audio", 2), score("grammar", 2), score("vocabulary", 2)])).toHaveLength(4);
  expect(tryoutStudyRecommendations([score("reading", 2, 4), score("audio", 3, 10)]).map(item => item.code)).toEqual(["audio"]);
  expect(tryoutStudyRecommendations([{ ...score("reading", 9), passing_score_basis: "points", earned: 1, max: 10 }, score("audio", 3)]).map(item => item.code)).toEqual(["reading"]);
  expect(tryoutStudyRecommendations([])).toEqual([]);
  expect(tryoutStudyRecommendations([score("reading", 0, 0)])).toEqual([]);
});
