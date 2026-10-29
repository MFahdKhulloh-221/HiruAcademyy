"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { AdminDialog } from "./admin-primitives";

type Guard = { dirty: boolean; saving: boolean; discard: () => void };
const Navigation = createContext<{ setGuard: (guard: Guard | null) => void; request: (proceed: () => void) => void } | null>(null);
export const useEditorNavigation = () => useContext(Navigation);

export function AdminEditorNavigation({ children }: { children: ReactNode }) {
  const [guard, setGuard] = useState<Guard | null>(null);
  const [pending, setPending] = useState<(() => void) | null>(null);
  function request(proceed: () => void) {
    if (guard?.saving || guard?.dirty) setPending(() => proceed);
    else proceed();
  }
  return <Navigation.Provider value={{ setGuard, request }}>{children}<AdminDialog open={Boolean(pending)} title="Perubahan belum disimpan" close={() => setPending(null)} actions={<><button type="button" className="button" onClick={() => setPending(null)}>Tetap Mengedit</button><button type="button" className="button button-primary" disabled={guard?.saving} onClick={() => { const proceed = pending; guard?.discard(); setPending(null); proceed?.(); }}>Keluar Tanpa Menyimpan</button></>}><p>Kamu memiliki perubahan artikel yang belum disimpan. Jika keluar sekarang, perubahan tersebut bisa hilang.</p>{guard?.saving && <p role="status">Tunggu penyimpanan selesai sebelum keluar.</p>}</AdminDialog></Navigation.Provider>;
}
