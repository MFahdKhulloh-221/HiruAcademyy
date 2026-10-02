import type { AssessmentQuestion } from "@/lib/assessment-mock";

export const tryoutLevels = ["N5", "N4", "N3", "N2", "N1", "SSW"] as const;
export const jlptTryoutSessions = ["Kosakata & Kanji", "Tata Bahasa", "Reading / Dokkai", "Audio / Choukai"] as const;

export type TryoutLevel = (typeof tryoutLevels)[number];
export type TryoutSession = (typeof jlptTryoutSessions)[number];

export const tryoutConfig: Record<TryoutLevel, { sectionPassingScore: number; totalPassingScore: number }> = {
  N5: { sectionPassingScore: 19, totalPassingScore: 76 },
  N4: { sectionPassingScore: 19, totalPassingScore: 76 },
  N3: { sectionPassingScore: 19, totalPassingScore: 76 },
  N2: { sectionPassingScore: 19, totalPassingScore: 76 },
  N1: { sectionPassingScore: 19, totalPassingScore: 76 },
  SSW: { sectionPassingScore: 19, totalPassingScore: 76 },
};

export const tryoutQuestions: Record<TryoutSession, AssessmentQuestion[]> = Object.fromEntries(
  jlptTryoutSessions.map((session, sessionIndex) => [
    session,
    Array.from({ length: 25 }, (_, index) => {
      const qNum = sessionIndex * 25 + index + 1;
      return {
        id: `${sessionIndex + 1}-${index + 1}`,
        section: session,
        prompt: "Pilih jawaban yang paling tepat.",
        japanese: {
          text:
            index === 0
              ? sessionIndex === 0
                ? "日本へ行く前に、パスポートを＿＿＿＿。"
                : sessionIndex === 1
                  ? "薬を＿＿＿＿から、出かけます。"
                  : sessionIndex === 2
                    ? "次の文章を読んで、後の問いに対する答えとして最もよいものを一つ選びなさい。"
                    : "音声を聞いて、質問に対する正しい答えを一つ選びなさい。"
              : `練習問題 ${qNum}（${session}）`,
        },
        options: [
          { id: "a", label: "確認しておきます" },
          { id: "b", label: "確認しています" },
          { id: "c", label: "確認したことがあります" },
          { id: "d", label: "確認するでしょう" },
        ],
        correctOptionId: "a",
        explanation: `Jawaban nomor ${qNum} mengikuti konteks kalimat dan materi sesi ${session}.`,
      };
    }),
  ])
) as unknown as Record<TryoutSession, AssessmentQuestion[]>;
