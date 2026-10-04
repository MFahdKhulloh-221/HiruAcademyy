import { replays, scheduleSessions } from "@/lib/sensei-mock";

export const liveReplayLevels = ["N5", "N4", "N3", "N2", "N1"];
export const liveStatuses = ["Terjadwal", "Selesai", "Dibatalkan"];
export const replayStatuses = ["Draft", "Published"];
export const liveReplaySensei = ["Sensei Hilmy", "Sensei Putri", "Sensei Akira", "Sensei Hana", "Sensei Ren"];
export type LiveReplayRecord = {
  id: string; kind: "live" | "replay"; title: string; program: string; chapter: string;
  date: string; start: string; end: string; sensei: string; url: string; status: string;
  description: string; order: string; video: File | null; thumbnail: File | null; playlistId?: string;
};
export const emptyLiveReplay = (kind: LiveReplayRecord["kind"]): LiveReplayRecord => ({
  id: "", kind, title: "", program: "", chapter: "", date: "", start: "", end: "", sensei: "", url: "",
  status: kind === "live" ? "Terjadwal" : "Draft", description: "", order: "1", video: null, thumbnail: null,
});
export const liveReplayFixtures: LiveReplayRecord[] = [
  ...scheduleSessions.map((session) => ({ ...emptyLiveReplay("live"), id: session.id, title: session.title, status: session.status, chapter: session.id === "chapter-4" ? "Chapter 4" : "" })),
  { ...emptyLiveReplay("live"), id: "session-n4-01", title: "Sesi 1: Percakapan sehari-hari", program: "N4", chapter: "chapter-n4-1", sensei: "Sensei Hana", date: "2026-09-20", start: "19:00", end: "20:30", url: "https://meet.google.com/hiru-n4-01", description: "Siapkan latihan perkenalan." },
  ...replays.map((replay, index) => ({ ...emptyLiveReplay("replay"), id: replay.id, program: replay.level, title: replay.title, description: replay.description, order: String(index + 1) })),
];
export const liveReplayFixtureReferences = [
  "src/lib/sensei-mock.ts:4–19",
  "src/lib/admin-class-operations-store.ts:16–21 (read-only representative values; WIB)",
  "src/components/sensei-screens.tsx:29–105,120–245 (student preview family)",
];
