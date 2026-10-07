"use client";

import { useState } from "react";
import { rememberAdminMedia } from "@/lib/admin-media";
import { useLearningRequest } from "@/components/learning-hooks";
import { emptyLiveReplay, type LiveReplayRecord } from "@/lib/admin-live-replay-fixtures";
import { systemData, systemWrite, type ClassSchedule, type ReplayPlaylist, type ReplayVideo, type SystemProgram } from "@/lib/schedule-replay-api";

async function loadClassAdmin(signal: AbortSignal) {
  const [schedules, playlists, videos, programs] = await Promise.all([systemData<ClassSchedule[]>("/api/admin/class-schedules", signal), systemData<ReplayPlaylist[]>("/api/admin/replay-playlists", signal), systemData<ReplayVideo[]>("/api/admin/replay-videos", signal), systemData<SystemProgram[]>("/api/admin/programs", signal)]);
  videos.forEach(item => rememberAdminMedia(item as unknown as Record<string, unknown>));
  const code = (id?: number) => programs.find(item => item.id === id)?.code.toUpperCase() || "";
  const rows: LiveReplayRecord[] = schedules.map(item => { const date = new Date(item.scheduled_at); const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date).split(" "); const end = item.duration_minutes ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(date.getTime() + item.duration_minutes * 60000)) : ""; return { ...emptyLiveReplay("live"), id: String(item.id), title: item.title, program: code(item.program_id), chapter: item.chapter || item.session || "", sensei: item.sensei_name || "", date: parts[0], start: parts[1], end, url: item.meeting_url || "", status: item.status === "cancelled" ? "Dibatalkan" : item.status === "draft" ? "Draft" : "Terjadwal", description: item.description || "", order: String(item.sort_order) }; });
  rows.push(...videos.map(item => ({ ...emptyLiveReplay("replay"), id: String(item.id), playlistId: String(item.replay_playlist_id), title: item.title, program: code(playlists.find(value => value.id === item.replay_playlist_id)?.program_id), chapter: item.chapter || item.session || "", sensei: item.sensei_name || "", date: item.recorded_at || "", url: item.video_url, status: item.status === "published" ? "Published" : "Draft", description: item.description || "", order: String(item.sort_order) })));
  return { rows, playlists, programs };
}

export function useClassAdmin() {
  const request = useLearningRequest(loadClassAdmin, "class-admin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function write(item: LiveReplayRecord | ReplayPlaylist, action: "save" | "delete", playlist = false) {
    if (busy || !request.data) return false;
    setBusy(true); setError("");
    try {
      const live = "kind" in item && item.kind === "live";
      const resource = playlist ? "replay-playlists" : live ? "class-schedules" : "replay-videos";
      const existing = playlist ? request.data.playlists.some(row => row.id === Number(item.id)) : request.data.rows.some(row => row.id === String(item.id) && row.kind === (item as LiveReplayRecord).kind);
      let body: unknown;
      if (playlist) { const row = item as ReplayPlaylist; body = { program_id: row.program_id, title: row.title, description: row.description, status: row.status, sort_order: row.sort_order }; }
      else { const row = item as LiveReplayRecord; const common = { title: row.title, description: row.description || null, chapter: row.chapter || null, sensei_name: row.sensei || null, sort_order: Number(row.order), status: row.status === "Draft" ? "draft" : row.status === "Dibatalkan" ? "cancelled" : "published" }; body = live ? { ...common, program_id: request.data.programs.find(program => program.code.toUpperCase() === row.program)?.id, scheduled_at: new Date(`${row.date}T${row.start}:00+07:00`).toISOString(), duration_minutes: row.end ? (Date.parse(`${row.date}T${row.end}:00+07:00`) - Date.parse(`${row.date}T${row.start}:00+07:00`)) / 60000 : null, meeting_url: row.url || null } : { ...common, replay_playlist_id: Number(row.playlistId), video_url: row.url, recorded_at: row.date || null }; }
      await systemWrite(`/api/admin/${resource}${existing || action === "delete" ? `/${item.id}` : ""}`, action === "delete" ? "DELETE" : existing ? "PATCH" : "POST", action === "delete" ? undefined : body);
      request.retry(); return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Permintaan belum berhasil. Silakan coba lagi."); return false; }
    finally { setBusy(false); }
  }
  return { ...request, rows: request.data?.rows || [], playlists: request.data?.playlists || [], programs: request.data?.programs || [], busy, mutationError: error, write };
}
