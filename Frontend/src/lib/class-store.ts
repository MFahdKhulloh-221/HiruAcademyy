"use client";

import { useMemo } from "react";
import { useLearningRequest } from "@/components/learning-hooks";
import { studentSchedules } from "@/lib/schedule-replay-api";
import { type ClassRecord, type Session, type Sensei, useClassOperationsStore } from "@/lib/admin-class-operations-store";

export type StudentScheduleItem = { id: string; title: string; meta: string; status: Session["status"]; senseiName: string; program: string; chapter?: string; meetingUrl: string; replayId?: string };
export function formatStudentScheduleDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(date); }
export type PublishedClassOperations = { sensei: Sensei[]; classes: ClassRecord[]; sessions: Session[]; schedule: StudentScheduleItem[] };
const empty: PublishedClassOperations = { sensei: [], classes: [], sessions: [], schedule: [] };
export function readPublishedClassOperations(): PublishedClassOperations { return empty; }
export function readPublishedClassOperationsStable() { return empty; }
export function usePublishedClassOperations() {
  const request = useLearningRequest(studentSchedules, "schedules");
  return useMemo(() => ({ ...empty, schedule: request.data?.map(item => ({ id: String(item.id), title: item.title, meta: formatStudentScheduleDate(item.scheduled_at), status: "Terjadwal" as const, senseiName: item.sensei_name || "", program: String(item.program_id), chapter: item.chapter || undefined, meetingUrl: item.meeting_url || "" })) || [] }), [request.data]);
}
export function readActiveSensei() { return empty.sensei; }
export function readActiveClasses() { return empty.classes; }
export function readActiveSessions() { return empty.sessions; }
export { useClassOperationsStore };
