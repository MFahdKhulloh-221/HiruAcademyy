import type { AssessmentConfig } from "@/lib/assessment-mock";
import type { Membership } from "@/lib/dashboard-mock";

export const scheduleSessions = [
  { id: "chapter-4", title: "Chapter 4 • Sesi Live", meta: "Hari/Tanggal • Jam WIB • Sensei dari admin", status: "Terjadwal" },
  { id: "consultation", title: "Konsultasi Cohort", meta: "Jadwal dan topik mengikuti cohort aktif", status: "Terjadwal" },
  { id: "previous", title: "Sesi sebelumnya", meta: "Replay tersedia setelah dipublikasikan", status: "Selesai" },
];

export const replayLevels = ["N5", "N4", "N3", "N2", "N1"] as const;
export type ReplayLevel = (typeof replayLevels)[number];

export const replays = [
  { id: "n5-dasar", level: "N5", title: "N5 — Dasar Bahasa Jepang", description: "Replay materi dasar dan latihan kelas.", category: "N5", featured: true },
  { id: "n4-grammar", level: "N4", title: "N4 — Review Tata Bahasa", description: "Pembahasan pola kalimat dan latihan.", category: "N4" },
  { id: "n3-reading", level: "N3", title: "N3 — Strategi Dokkai", description: "Review bacaan dan strategi menjawab.", category: "N3" },
  { id: "n2-choukai", level: "N2", title: "N2 — Latihan Choukai", description: "Pembahasan audio dan pemahaman konteks.", category: "N2" },
  { id: "n1-review", level: "N1", title: "N1 — Review Lanjutan", description: "Review materi lanjutan bersama Sensei.", category: "N1" },
] satisfies Array<{ id: string; level: ReplayLevel; title: string; description: string; category: string; featured?: boolean }>;

export function getReplayAccessLevels(membership: Membership, purchasedLevel?: string): ReplayLevel[] {
  if (membership !== "sensei") return [];
  const index = replayLevels.indexOf(purchasedLevel?.toUpperCase() as ReplayLevel);
  return index < 0 ? [] : replayLevels.slice(0, index + 1);
}

export const replayMarkers = [["00:00", "Pembukaan"], ["08:20", "Review materi"], ["24:15", "Latihan bersama"], ["46:40", "Tanya jawab"], ["58:10", "Arahan berikutnya"]];

export const miniCheckpoints = [
  { level: "N5", status: "AKTIF SESUAI AKSES", sessions: 3 },
  { level: "N4", status: "TERSEDIA", sessions: 3 },
  { level: "N3", status: "AKTIF SESUAI AKSES", sessions: 4 },
  { level: "N2", status: "AKTIF SESUAI AKSES", sessions: 4 },
].map((group) => ({ ...group, items: Array.from({ length: group.sessions }, (_, session) => [1, 2].map((part) => ({ id: `${group.level.toLowerCase()}-s${session + 1}-p${part}`, level: group.level, session: `sesi ${session + 1}`, part: `part ${part}` }))).flat() }));

export const miniCheckpointConfig: AssessmentConfig = {
  type: "mini-checkpoint",
  title: "Mini Checkpoint N4 • Sesi 2 • Part 1",
  context: "Assessment kelas dengan data contoh",
  timerEnabled: true,
  timerLabel: "Timer mock • konfigurasi admin",
  reviewEnabled: true,
  sampleLabel: "Mini Checkpoint demo",
  completionLabel: "Mini Checkpoint selesai",
  submitLabel: "Selesaikan Mini Checkpoint",
  returnHref: "/mini-checkpoint?membership=sensei",
  passingScore: 75,
  questions: [
    { id: "m1", section: "N4 • Sesi 2 • Part 1", prompt: "Pilih makna yang sesuai.", japanese: { text: "経験", reading: "けいけん" }, options: [{ id: "a", label: "pengalaman" }, { id: "b", label: "perjalanan" }, { id: "c", label: "pelajaran" }, { id: "d", label: "pertemuan" }], correctOptionId: "a", explanation: "経験 berarti pengalaman." },
    { id: "m2", section: "N4 • Sesi 2 • Part 1", prompt: "Pilih bentuk kalimat yang tepat.", japanese: { text: "日本へ行ったことがあります。", reading: "にほんへ いったことが あります" }, options: [{ id: "a", label: "Belum pernah ke Jepang" }, { id: "b", label: "Pernah pergi ke Jepang" }, { id: "c", label: "Akan pergi ke Jepang" }, { id: "d", label: "Sedang pergi ke Jepang" }], correctOptionId: "b", explanation: "〜たことがあります menyatakan pengalaman yang pernah dilakukan." },
  ],
};

export function hasSenseiAccess(membership: Membership) {
  return membership === "sensei";
}
