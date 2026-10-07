"use client";

import { apiRequest, ApiError } from "@/lib/api";
import type { EffectiveAccess } from "@/lib/commercial-api";

export type ClassSchedule = { id: number; program_id: number; program?: SystemProgram; title: string; description: string | null; scheduled_at: string; duration_minutes: number | null; meeting_url: string | null; chapter: string | null; session: string | null; sensei_name: string | null; status: string; sort_order: number };
export type ReplayVideo = { id: number; replay_playlist_id: number; title: string; description: string | null; video_url: string | null; video_url_resolved_url?: string | null; recorded_at: string | null; chapter: string | null; session: string | null; sensei_name: string | null; status: string; sort_order: number };
export type ReplayPlaylist = { id: number; program_id: number; program?: SystemProgram; title: string; description: string | null; status: string; sort_order: number; videos?: ReplayVideo[] };
export type SystemProgram = { id: number; code: string; name: string };
export type SystemNotification = { id: number; type: string; title: string; body: string; cta_label: string | null; preset: string; path: string | null; audience: string; level: string | null; status: string; time: string | null; read: boolean; read_at: string | null };
export function systemId(value: string | number) { if (!/^[1-9]\d*$/.test(String(value))) throw new ApiError(404); return String(value); }
export function safeSystemUrl(value: string | null | undefined) { try { const url = new URL(value || ""); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; } }
export function safeNotificationPath(value: string | null) { return !!value && /^\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]*$/.test(value) && !value.split("/").some(part => part === "." || part === ".."); }
export async function systemData<T>(path: string, signal?: AbortSignal): Promise<T> { return (await apiRequest<{ data: T }>(path, { signal })).data; }
export async function systemWrite<T>(path: string, method: string, body?: unknown): Promise<T> { return (await apiRequest<{ data: T }>(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }))?.data; }
export const studentSchedules = (signal: AbortSignal) => systemData<ClassSchedule[]>("/api/student/class-schedules", signal);
export const studentNotifications = (signal: AbortSignal) => systemData<SystemNotification[]>("/api/student/notifications", signal);
export async function studentReplays(signal: AbortSignal) {
  const [playlists, access, programs] = await Promise.all([systemData<ReplayPlaylist[]>("/api/student/replays", signal), systemData<EffectiveAccess>("/api/student/access", signal), systemData<SystemProgram[]>("/api/public/programs", signal)]);
  return { playlists, access, programs };
}
