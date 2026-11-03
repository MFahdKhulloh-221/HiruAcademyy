"use client";

import { useEffect, useId, useRef } from "react";

export function AdminErrorDialog({ error, close }: { error: { message: string } | null; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const messageId = useId();
  useEffect(() => {
    const modal = dialog.current;
    if (error && modal && !modal.open) modal.showModal();
    else if (!error && modal?.open) modal.close();
  }, [error]);
  return <dialog ref={dialog} aria-labelledby={titleId} aria-describedby={messageId} onCancel={event => { event.preventDefault(); close(); }} onKeyDown={event => { if (event.key === "Tab") { event.preventDefault(); dialog.current?.querySelector("button")?.focus(); } }} style={{ width: "min(36rem, calc(100% - 2rem))", maxHeight: "80dvh", overflow: "auto", margin: "auto", padding: "1.5rem", border: "1px solid #ccc", borderRadius: "1rem", background: "#fff", color: "#222" }}>
    <h2 id={titleId}>Tindakan belum berhasil</h2>
    <p id={messageId} style={{ whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{error?.message}</p>
    <button type="button" className="button button-primary" autoFocus onClick={close}>Tutup pesan</button>
  </dialog>;
}
