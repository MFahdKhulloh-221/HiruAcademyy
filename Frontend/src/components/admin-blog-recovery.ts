"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Article } from "./admin-blog-preview";

const prefix = "hiru:blog-editor:v1:";
const maxAge = 24 * 60 * 60 * 1000;
export function useBlogRecovery(userId: number | string | undefined, original: Article, draft: Article, baseline: string, dirty: boolean) {
  const key = userId === undefined ? null : `${prefix}${userId}:${original.id}`;
  const suppressed = useRef<string | null>(null);
  const [candidate, setCandidate] = useState<{ draft: Article; stale: boolean } | null>(null);
  const [warning, setWarning] = useState("");
  const [checkedKey, setCheckedKey] = useState<string | null>(null);
  useEffect(() => {
    if (!key) return;
    let active = true;
    queueMicrotask(() => {
    if (!active) return;
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const saved = JSON.parse(raw);
        const valid = saved.version === 1 && saved.draft?.id === original.id && typeof saved.at === "number" && saved.at <= Date.now() && Date.now() - saved.at < maxAge && typeof saved.baseline === "string" && ["title", "excerpt", "body", "category", "author"].every(field => typeof saved.draft[field] === "string") && (saved.draft.thumbnail === null || typeof saved.draft.thumbnail === "string");
        if (valid && JSON.stringify(saved.draft) !== JSON.stringify(original)) setCandidate({ draft: saved.draft, stale: saved.baseline !== JSON.stringify(original) });
        else sessionStorage.removeItem(key);
      }
    } catch { setWarning("Pemulihan browser tidak tersedia atau snapshot rusak. Salin tulisan sebelum keluar."); }
    setCheckedKey(key);
    });
    return () => { active = false; };
    // Original API snapshot is captured once for this editor mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (!key || checkedKey !== key || candidate || suppressed.current === JSON.stringify(draft)) return;
    let active = true;
    try {
      if (dirty) sessionStorage.setItem(key, JSON.stringify({ version: 1, at: Date.now(), baseline, draft }));
      else sessionStorage.removeItem(key);
    } catch { queueMicrotask(() => { if (active) setWarning("Tulisan belum dapat dicadangkan di browser. Salin tulisan sebelum keluar."); }); }
    return () => { active = false; };
  }, [key, checkedKey, candidate, dirty, draft, baseline]);
  const clear = useCallback(() => {
    suppressed.current = JSON.stringify(draft);
    try { if (key) sessionStorage.removeItem(key); } catch { setWarning("Snapshot browser tidak dapat dihapus."); }
    setCandidate(null);
  }, [key, draft]);
  return { candidate, warning, clear };
}
