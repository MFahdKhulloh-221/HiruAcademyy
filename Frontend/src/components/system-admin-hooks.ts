"use client";

import { useCallback, useState } from "react";
import { useLearningRequest } from "@/components/learning-hooks";
import { systemData, systemId, systemWrite } from "@/lib/schedule-replay-api";

export function useSystemAdminRows<T extends { id: string }, R extends { id: number }>(resource: string, decode: (row: R) => T, encode: (row: T) => unknown) {
  const load = useCallback((signal: AbortSignal) => systemData<R[]>(`/api/admin/${resource}`, signal).then(rows => rows.map(decode)), [resource, decode]);
  const request = useLearningRequest(load, `admin:${resource}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(row: T) {
    if (busy) return false;
    setBusy(true); setError("");
    try { const existing = request.data?.some(value => value.id === row.id); await systemWrite(`/api/admin/${resource}${existing ? `/${systemId(row.id)}` : ""}`, existing ? "PATCH" : "POST", encode(row)); request.retry(); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Permintaan belum berhasil. Silakan coba lagi."); return false; }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (busy) return false;
    setBusy(true); setError("");
    try { await systemWrite(`/api/admin/${resource}/${systemId(id)}`, "DELETE"); request.retry(); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Permintaan belum berhasil. Silakan coba lagi."); return false; }
    finally { setBusy(false); }
  }
  return { ...request, rows: request.data || [], busy, mutationError: error, save, remove };
}
