"use client";

import { useEffect, useRef, useState } from "react";
import { placementHtml } from "@/lib/placement-rich-text";

export function PlacementRichText({ value }: { value: string }) {
  const element = useRef<HTMLSpanElement>(null);
  useEffect(() => { if (element.current) element.current.innerHTML = placementHtml(value); }, [value]);
  return <span ref={element} className="placement-rich-content" />;
}

export function PlacementTextEditor({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const editor = useRef<HTMLDivElement>(null);
  const range = useRef<Range | null>(null);
  const ruby = useRef<HTMLElement | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingRuby, setEditingRuby] = useState(false);
  useEffect(() => { if (editor.current && document.activeElement !== editor.current) editor.current.innerHTML = placementHtml(value); }, [value]);
  function emit() { if (editor.current) onChange(placementHtml(editor.current.innerHTML)); }
  function remember() {
    const selection = window.getSelection();
    if (selection?.rangeCount && editor.current?.contains(selection.anchorNode) && editor.current.contains(selection.focusNode)) range.current = selection.getRangeAt(0).cloneRange();
  }
  function restore() {
    editor.current?.focus();
    if (range.current) { const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range.current); }
  }
  async function furigana() {
    if (!range.current) return;
    const node = range.current.startContainer;
    ruby.current = (node instanceof Element ? node : node.parentElement)?.closest("ruby") ?? null;
    setEditingRuby(Boolean(ruby.current));
    if (ruby.current) { setReading(ruby.current.querySelector("rt")?.textContent ?? ""); return; }
    const text = range.current.toString();
    if (!text.trim() || text.length > 500) return;
    setBusy(true); setReading("");
    try { const response = await fetch("/api/furigana", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }); const data = await response.json(); setReading(typeof data.reading === "string" ? data.reading : ""); } catch { setReading(""); }
    finally { setBusy(false); }
  }
  function apply(remove = false) {
    if (!range.current) return;
    if (ruby.current) {
      const current = ruby.current;
      if (remove) { current.querySelectorAll("rt").forEach(rt => rt.remove()); current.replaceWith(...current.childNodes); }
      else { let rt = current.querySelector("rt"); if (!rt) { rt = document.createElement("rt"); current.append(rt); } rt.textContent = reading; }
    } else if (!remove && reading?.trim()) {
      const element = document.createElement("ruby"); element.textContent = range.current.toString();
      const rt = document.createElement("rt"); rt.textContent = reading; element.append(rt);
      range.current.deleteContents(); range.current.insertNode(element);
    }
    setReading(null); emit();
  }
  return <div className="placement-text-editor">
    <div role="toolbar" aria-label={`Format ${label}`}>
      {([ ["bold", "B"], ["italic", "I"], ["underline", "U"] ] as const).map(([command, text]) => <button type="button" key={command} aria-label={command} onMouseDown={event => event.preventDefault()} onClick={() => { restore(); document.execCommand(command); remember(); emit(); }}>{text}</button>)}
      <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => void furigana()}>あ Furigana</button>
    </div>
    <div ref={editor} contentEditable suppressContentEditableWarning role="textbox" aria-label={label} aria-multiline="true" onInput={emit} onKeyUp={remember} onMouseUp={remember} onPaste={event => { event.preventDefault(); document.execCommand("insertText", false, event.clipboardData.getData("text/plain")); emit(); }} />
    {reading !== null && <div className="placement-furigana-panel" role="group" aria-label="Edit Furigana"><label>Bacaan Hiragana<input value={reading} disabled={busy} onChange={event => setReading(event.target.value)} /></label><small>{busy ? "Menganalisis…" : "Periksa bacaan. Jika kosong atau tidak tepat, isi manual."}</small><div><button type="button" disabled={busy || !reading.trim()} onClick={() => apply()}>Terapkan</button>{editingRuby && <button type="button" onClick={() => apply(true)}>Hapus Furigana</button>}<button type="button" onClick={() => setReading(null)}>Batal</button></div></div>}
  </div>;
}
