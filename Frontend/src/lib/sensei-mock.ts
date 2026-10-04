import type { AssessmentConfig } from "@/lib/assessment-mock";
import type { Membership } from "@/lib/dashboard-mock";

export const scheduleSessions: Array<{ id: string; title: string; meta: string; status: string }> = [];

export const replayLevels = ["N5", "N4", "N3", "N2", "N1"] as const;
export type ReplayLevel = (typeof replayLevels)[number];

export const replays: Array<{ id: string; level: ReplayLevel; title: string; description: string; category: string; featured?: boolean }> = [];

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
