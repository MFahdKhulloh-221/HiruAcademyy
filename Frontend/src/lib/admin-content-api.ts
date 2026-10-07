"use client";

import { useRef, useState } from "react";
import { apiRequest } from "@/lib/api";
import { rememberAdminMedia } from "@/lib/admin-media";
import { decodeContent, encodeContent, useContent } from "@/lib/public-content-api";

export function useAdminContent<T extends { id: string }>(resource: string) {
  const remote = useContent<Record<string, unknown>>(`/api/admin/${resource}`);
  const rows = remote.data.map(item => { rememberAdminMedia(item); return decodeContent<T>(item); });
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const mutate = async (item: T, remove = false) => {
    if (locked.current) throw new Error("Permintaan sedang diproses.");
    locked.current = true; setBusy(true);
    try {
      const exists = /^\d+$/.test(item.id);
      const fields = Object.fromEntries(Object.entries(item).filter(([key]) => !key.endsWith("_resolved_url")));
      await apiRequest(`/api/admin/${resource}${exists ? `/${item.id}` : ""}`, { method: remove ? "DELETE" : exists ? "PATCH" : "POST", ...(!remove ? { body: JSON.stringify(encodeContent(fields)) } : {}) });
      remote.reload();
    } finally { locked.current = false; setBusy(false); }
  };
  return { rows, loading: remote.loading, loadError: remote.error, reload: remote.reload, busy, mutate };
}
