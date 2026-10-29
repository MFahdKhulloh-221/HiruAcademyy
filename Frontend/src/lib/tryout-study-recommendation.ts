type SessionScore = { code: string; label: string; earned: number; max: number; correct: number; wrong: number; unanswered: number; passing_score_basis?: string };

const advice: Record<string, string> = {
  vocabulary: "Ulangi kosakata dan kanji dengan flashcard, lalu latihan mengenali makna kata dalam kalimat.",
  grammar: "Pelajari kembali pola tata bahasa dan latihan memilih bentuk kalimat yang tepat.",
  reading: "Latih membaca teks pendek, mencari ide utama, dan menemukan informasi penting sebelum menjawab.",
  audio: "Latih listening dengan audio pendek, ulangi bagian yang sulit, lalu periksa pemahaman percakapannya.",
};

export function tryoutStudyRecommendations(sessions: SessionScore[] = []) {
  const scored = sessions.flatMap(section => {
    const total = section.passing_score_basis === "points" ? section.max : section.correct + section.wrong + section.unanswered;
    const earned = section.passing_score_basis === "points" ? section.earned : section.correct;
    return Number.isFinite(total) && total > 0 && Number.isFinite(earned) && earned >= 0 && earned <= total ? [{ section, earned, total }] : [];
  });
  if (!scored.length) return [];
  const lowest = scored.reduce((a, b) => b.earned * a.total < a.earned * b.total ? b : a);
  return scored.filter(item => item.earned * lowest.total === lowest.earned * item.total).map(({ section, earned, total }) => ({
    code: section.code, label: section.label, percentage: Math.round(earned / total * 100),
    description: earned === total ? "Pertahankan pemahamanmu dengan mengulang materi dan latihan secara berkala." : advice[section.code] ?? `Pelajari kembali materi ${section.label} dan review jawaban yang belum tepat.`,
  }));
}
