"use client";

import { useSyncExternalStore } from "react";
import { readReplays } from "@/lib/admin-curriculum-store";

export const CLASS_OPERATIONS_STORAGE_KEY = "hiru-admin-class-operations:v1";
export const CLASS_OPERATIONS_CHANGE_EVENT = "hiru:class-operations-change";

export type Sensei = { id: string; name: string; title: string; photoUrl: string; shortBio: string; specialization: string[]; availabilityNote?: string; status: "Aktif" | "Nonaktif"; createdAt: string; updatedAt: string };
export type ClassRecord = { id: string; title: string; programCode: string; level: string; senseiId: string; membershipPlan: "sensei"; status: "Aktif" | "Selesai" | "Nonaktif"; description: string; createdAt: string; updatedAt: string };
export type Session = { id: string; classId: string; title: string; chapterId?: string; senseiId: string; startAt: string; endAt: string; meetingUrl: string; status: "Terjadwal" | "Berlangsung" | "Selesai" | "Dibatalkan"; replayId?: string; notes?: string };
export type ClassOperationsStore = { version: 1; sensei: Sensei[]; classes: ClassRecord[]; sessions: Session[] };

const now = "2026-09-17T09:00:00.000Z";
export const createInitialClassOperationsStore = (): ClassOperationsStore => ({ version: 1, sensei: [
  { id: "sensei-hilmy", name: "Sensei Hilmy", title: "Mentor N4", photoUrl: "/sensei/guru1.png", shortBio: "Mentor bahasa Jepang untuk pembelajaran N4, tata bahasa, dan percakapan.", specialization: ["N4", "Grammar", "Speaking"], status: "Aktif", createdAt: now, updatedAt: now },
  { id: "sensei-putri", name: "Sensei Putri", title: "Mentor N5", photoUrl: "/sensei/guru2.png", shortBio: "Mentor fondasi bahasa Jepang untuk pembelajar level N5.", specialization: ["N5", "Foundation", "Reading"], status: "Aktif", createdAt: now, updatedAt: now },
  { id: "sensei-akira", name: "Sensei Akira", title: "Mentor N3", photoUrl: "/sensei/guru3.png", shortBio: "Mentor persiapan JLPT N3 dengan strategi belajar terarah.", specialization: ["N3", "JLPT Strategy"], status: "Aktif", createdAt: now, updatedAt: now },
  { id: "sensei-hana", name: "Sensei Hana", title: "Mentor N4", photoUrl: "/sensei/guru1.png", shortBio: "Sensei berpengalaman untuk percakapan dan persiapan kerja di Jepang.", specialization: ["N4", "Speaking", "SSW"], availabilityNote: "Senin–Jumat, 19.00–21.00 WIB", status: "Aktif", createdAt: now, updatedAt: now },
  { id: "sensei-ren", name: "Sensei Ren", title: "Mentor N4", photoUrl: "/sensei/guru2.png", shortBio: "Mentor latihan menyimak dan komunikasi praktis level N4.", specialization: ["N4", "Listening"], status: "Aktif", createdAt: now, updatedAt: now },
], classes: [{ id: "class-n4-hana", title: "Bahasa Jepang N4 bersama Hana", programCode: "N4", level: "N4", senseiId: "sensei-hana", membershipPlan: "sensei", status: "Aktif", description: "Kelas intensif dengan latihan terarah dan pendampingan Sensei Hana.", createdAt: now, updatedAt: now }], sessions: [{ id: "session-n4-01", classId: "class-n4-hana", title: "Sesi 1: Percakapan sehari-hari", chapterId: "chapter-n4-1", senseiId: "sensei-hana", startAt: "2026-09-20T12:00:00.000Z", endAt: "2026-09-20T13:30:00.000Z", meetingUrl: "https://meet.google.com/hiru-n4-01", status: "Terjadwal", notes: "Siapkan latihan perkenalan." }] });

const text = (v: unknown) => typeof v === "string" ? v.trim() : "";
const unique = <T extends { id: string }>(items: T[]) => Array.from(new Map(items.filter((x) => x.id).map((x) => [x.id, x])).values());
const normalize = (raw: unknown): ClassOperationsStore => {
  const input = raw && typeof raw === "object" ? raw as Partial<ClassOperationsStore> : {};
  const seed = createInitialClassOperationsStore();
  const sensei = unique((Array.isArray(input.sensei) ? input.sensei : seed.sensei).map((x) => ({ ...x, id: text(x.id), name: text(x.name), title: text(x.title) || `Mentor ${uniqueStrings(Array.isArray(x.specialization) ? x.specialization : [])[0] || "Bahasa Jepang"}`, photoUrl: text(x.photoUrl), shortBio: text(x.shortBio), specialization: Array.isArray(x.specialization) ? uniqueStrings(x.specialization) : [], status: (x.status === "Nonaktif" ? "Nonaktif" : "Aktif") as Sensei["status"], createdAt: text(x.createdAt) || now, updatedAt: text(x.updatedAt) || now })));
  const classes = unique((Array.isArray(input.classes) ? input.classes : seed.classes).map((x) => ({ ...x, id: text(x.id), title: text(x.title), programCode: text(x.programCode), level: text(x.level), senseiId: text(x.senseiId), membershipPlan: "sensei" as const, status: (x.status === "Selesai" || x.status === "Nonaktif" ? x.status : "Aktif") as ClassRecord["status"], description: text(x.description), createdAt: text(x.createdAt) || now, updatedAt: text(x.updatedAt) || now })));
  const sessions = unique((Array.isArray(input.sessions) ? input.sessions : seed.sessions).map((x) => ({ ...x, id: text(x.id), classId: text(x.classId), title: text(x.title), chapterId: text(x.chapterId) || undefined, senseiId: text(x.senseiId), startAt: text(x.startAt), endAt: text(x.endAt), meetingUrl: text(x.meetingUrl), status: ["Terjadwal", "Berlangsung", "Selesai", "Dibatalkan"].includes(x.status) ? x.status : "Terjadwal", replayId: text(x.replayId) || undefined, notes: text(x.notes) || undefined })));
  return { version: 1, sensei, classes, sessions };
};
const uniqueStrings = (items: unknown[]) => Array.from(new Set(items.map(text).filter(Boolean)));
export function readClassOperationsStore(storage: Pick<Storage, "getItem"> | null = typeof window === "undefined" ? null : window.localStorage): ClassOperationsStore { if (!storage) return createInitialClassOperationsStore(); try { return normalize(JSON.parse(storage.getItem(CLASS_OPERATIONS_STORAGE_KEY) || "null")); } catch { return createInitialClassOperationsStore(); } }
function save(store: ClassOperationsStore, storage: Pick<Storage, "setItem"> = window.localStorage) { const next = normalize(store); const serialized = JSON.stringify(next); storage.setItem(CLASS_OPERATIONS_STORAGE_KEY, serialized); snapshot = next; snapshotRaw = serialized; window.dispatchEvent(new CustomEvent(CLASS_OPERATIONS_CHANGE_EVENT)); }
export function saveClassOperationsStore(store: ClassOperationsStore, storage = window.localStorage) { save(store, storage); }
export const upsertSensei = (item: Sensei, storage = window.localStorage) => { const s = readClassOperationsStore(storage); save({ ...s, sensei: [...s.sensei.filter((x) => x.id !== item.id), item] }, storage); return item; };
export const upsertClass = (item: ClassRecord, storage = window.localStorage) => { const s = readClassOperationsStore(storage); save({ ...s, classes: [...s.classes.filter((x) => x.id !== item.id), item] }, storage); return item; };
export const upsertSession = (item: Session, storage = window.localStorage) => { const s = readClassOperationsStore(storage); save({ ...s, sessions: [...s.sessions.filter((x) => x.id !== item.id), item] }, storage); return item; };
export function deleteSensei(id: string, storage = window.localStorage) { const s = readClassOperationsStore(storage); if (s.classes.some((x) => x.senseiId === id) || s.sessions.some((x) => x.senseiId === id)) return false; save({ ...s, sensei: s.sensei.filter((x) => x.id !== id) }, storage); return true; }
export function deleteClass(id: string, storage = window.localStorage) { const s = readClassOperationsStore(storage); save({ ...s, classes: s.classes.filter((x) => x.id !== id), sessions: s.sessions.filter((x) => x.classId !== id) }, storage); }
export function deleteSession(id: string, storage = window.localStorage) { const s = readClassOperationsStore(storage); save({ ...s, sessions: s.sessions.filter((x) => x.id !== id) }, storage); }
export const toggleSenseiStatus = (id: string, storage = window.localStorage) => { const s = readClassOperationsStore(storage); const item = s.sensei.find((x) => x.id === id); if (!item) return; upsertSensei({ ...item, status: item.status === "Aktif" ? "Nonaktif" : "Aktif", updatedAt: new Date().toISOString() }, storage); };
export const toggleClassStatus = (id: string, storage = window.localStorage) => { const s = readClassOperationsStore(storage); const item = s.classes.find((x) => x.id === id); if (!item) return; upsertClass({ ...item, status: item.status === "Aktif" ? "Nonaktif" : "Aktif", updatedAt: new Date().toISOString() }, storage); };
export const isValidMeetingUrl = (url: string) => { try { return ["http:", "https:"].includes(new URL(url).protocol); } catch { return false; } };
const parseIsoDate = (value: string) => { const timestamp = Date.parse(value); return Number.isFinite(timestamp) ? timestamp : null; };
export function findSenseiScheduleConflicts(session: Session, storage = window.localStorage) { const s = readClassOperationsStore(storage); const start = parseIsoDate(session.startAt), end = parseIsoDate(session.endAt); return start !== null && end !== null && end > start ? s.sessions.filter((x) => { const existingStart = parseIsoDate(x.startAt), existingEnd = parseIsoDate(x.endAt); return x.id !== session.id && x.senseiId === session.senseiId && x.status !== "Dibatalkan" && existingStart !== null && existingEnd !== null && existingStart < end && existingEnd > start; }) : []; }
export const updateSessionStatus = (id: string, status: Session["status"], storage = window.localStorage) => { const s = readClassOperationsStore(storage), x = s.sessions.find((v) => v.id === id); if (!x) return; upsertSession({ ...x, status }, storage); };
export function assignReplay(sessionId: string, replayId: string, storage = window.localStorage) { if (!readReplays(undefined, storage).some((x) => x.id === replayId)) return false; const s = readClassOperationsStore(storage), x = s.sessions.find((v) => v.id === sessionId); if (!x) return false; upsertSession({ ...x, replayId }, storage); return true; }
const initialSSRStore = createInitialClassOperationsStore();
const getInitialSSRStore = () => initialSSRStore;
let snapshot = initialSSRStore;
let snapshotRaw: string | null = null;
const read = () => { const raw = window.localStorage.getItem(CLASS_OPERATIONS_STORAGE_KEY); if (raw !== snapshotRaw) { snapshotRaw = raw; snapshot = readClassOperationsStore(); } return snapshot; };
const subscribe = (cb: () => void) => { const f = () => { read(); cb(); }; window.addEventListener("storage", f); window.addEventListener(CLASS_OPERATIONS_CHANGE_EVENT, f); return () => { window.removeEventListener("storage", f); window.removeEventListener(CLASS_OPERATIONS_CHANGE_EVENT, f); }; };
export function useClassOperationsStore() { return useSyncExternalStore(subscribe, read, getInitialSSRStore); }
