"use client";

import { useSyncExternalStore } from "react";
import { CLASS_OPERATIONS_CHANGE_EVENT, CLASS_OPERATIONS_STORAGE_KEY, readClassOperationsStore, type ClassRecord, type Session, type Sensei, useClassOperationsStore } from "@/lib/admin-class-operations-store";

export type StudentScheduleItem = { id: string; title: string; meta: string; status: Session["status"]; senseiName: string; program: string; chapter?: string; meetingUrl: string; replayId?: string };

export function formatStudentScheduleDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(date);
}
export type PublishedClassOperations = { sensei: Sensei[]; classes: ClassRecord[]; sessions: Session[]; schedule: StudentScheduleItem[] };

export function readPublishedClassOperations(): PublishedClassOperations {
  const store = readClassOperationsStore();
  const sensei = store.sensei.filter((x) => x.status === "Aktif");
  const classes = store.classes.filter((x) => x.status === "Aktif");
  const allowed = new Set(classes.map((x) => x.id));
  const sessions = store.sessions.filter((x) => allowed.has(x.classId) && x.status !== "Dibatalkan");
  const people = new Map(store.sensei.map((x) => [x.id, x.name]));
  const byId = new Map(classes.map((x) => [x.id, x]));
  return { sensei, classes, sessions, schedule: sessions.map((x) => { const c = byId.get(x.classId); return { id: x.id, title: x.title, meta: `${x.startAt} – ${x.endAt}`, status: x.status, senseiName: people.get(x.senseiId) || "", program: c?.programCode || "", chapter: x.chapterId, meetingUrl: x.meetingUrl, replayId: x.replayId }; }) };
}

const initialPublishedFallback: PublishedClassOperations = { sensei: [], classes: [], sessions: [], schedule: [] };
const getPublishedFallback = () => initialPublishedFallback;
let raw: string | null | undefined;
let cached: PublishedClassOperations = initialPublishedFallback;
export function readPublishedClassOperationsStable() { if (typeof window === "undefined") return initialPublishedFallback; const next = localStorage.getItem(CLASS_OPERATIONS_STORAGE_KEY); if (next !== raw) { raw = next; cached = readPublishedClassOperations(); } return cached; }
const subscribe = (cb: () => void) => { const f = (e: Event) => { if (e.type === "storage" && (e as StorageEvent).key !== CLASS_OPERATIONS_STORAGE_KEY) return; raw = undefined; readPublishedClassOperationsStable(); cb(); }; window.addEventListener("storage", f); window.addEventListener(CLASS_OPERATIONS_CHANGE_EVENT, f); return () => { window.removeEventListener("storage", f); window.removeEventListener(CLASS_OPERATIONS_CHANGE_EVENT, f); }; };
export function usePublishedClassOperations() { return useSyncExternalStore(subscribe, readPublishedClassOperationsStable, getPublishedFallback); }
export function readActiveSensei() { return readPublishedClassOperationsStable().sensei; }
export function readActiveClasses() { return readPublishedClassOperationsStable().classes; }
export function readActiveSessions() { return readPublishedClassOperationsStable().sessions; }
export { useClassOperationsStore };
