"use client";

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { placementHtml } from "@/lib/placement-rich-text";

type EditorController = {
  id: string;
  label: string;
  element: HTMLDivElement | null;
  range: Range | null;
  composing: boolean;
  emit: () => void;
  restore: (range?: Range) => boolean;
  remember: () => void;
  attach: (element: HTMLDivElement | null) => void;
  sync: (value: string) => void;
  compose: (composing: boolean) => void;
  writable: () => boolean;
};
type EditorContext = {
  active: EditorController | null;
  formats: Record<string, boolean>;
  activate: (controller: EditorController, formats: Record<string, boolean>) => void;
  unregister: (controller: EditorController) => void;
  isActive: (controller: EditorController) => boolean;
};
const EditorContext = createContext<EditorContext | null>(null);

export function PlacementEditorProvider({ children }: { children: ReactNode }) {
  const current = useRef<EditorController | null>(null);
  const [active, setActive] = useState<EditorController | null>(null);
  const [formats, setFormats] = useState<Record<string, boolean>>({});
  const activate = useCallback((controller: EditorController, next: Record<string, boolean>) => {
    current.current = controller;
    setActive(controller);
    setFormats(previous => Object.keys(next).every(key => previous[key] === next[key]) ? previous : next);
  }, []);
  const unregister = useCallback((controller: EditorController) => {
    if (current.current !== controller) return;
    current.current = null;
    setActive(null);
    setFormats({});
  }, []);
  const isActive = useCallback((controller: EditorController) => current.current === controller, []);
  const context = useMemo(() => ({ active, formats, activate, unregister, isActive }), [active, formats, activate, unregister, isActive]);
  return <EditorContext.Provider value={context}>{children}</EditorContext.Provider>;
}

export function PlacementRichText({ value }: { value: string }) {
  const element = useRef<HTMLSpanElement>(null);
  useEffect(() => { if (element.current) element.current.innerHTML = placementHtml(value); }, [value]);
  return <span ref={element} className="placement-rich-content" />;
}

export function PlacementEditorToolbar({ disabled = false }: { disabled?: boolean }) {
  const context = useContext(EditorContext);
  if (!context) throw new Error("PlacementEditorToolbar requires PlacementEditorProvider");
  return <EditorToolbarControls key={context.active?.id ?? "empty"} context={context} disabled={disabled} />;
}

function EditorToolbarControls({ context, disabled }: { context: EditorContext; disabled: boolean }) {
  const { active, formats, isActive } = context;
  const [reading, setReading] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingRuby, setEditingRuby] = useState(false);
  const session = useRef<{ range: Range; ruby: HTMLElement | null } | null>(null);
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);
  const unavailable = disabled || !active || active.composing;
  const canEdit = () => !unavailable && active.writable() && isActive(active);
  function command(command: string) {
    if (!canEdit() || !active || !active.restore()) return;
    document.execCommand(command);
    active.remember();
    active.emit();
  }
  async function furigana() {
    if (!canEdit() || !active?.range || !active.restore()) return;
    const range = active.range.cloneRange();
    const node = range.startContainer;
    const ruby = (node instanceof Element ? node : node.parentElement)?.closest("ruby") ?? null;
    session.current = { range, ruby };
    setEditingRuby(Boolean(ruby));
    const token = ++request.current;
    if (ruby) { setReading(ruby.querySelector("rt")?.textContent ?? ""); return; }
    const text = range.toString();
    if (!text.trim() || text.length > 500) return;
    setBusy(true); setReading("");
    try {
      const response = await fetch("/api/furigana", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      if (!response.ok) throw new Error("Furigana request failed");
      const data = await response.json();
      if (request.current === token && isActive(active)) setReading(typeof data.reading === "string" ? data.reading : "");
    } catch { if (request.current === token && isActive(active)) setReading(""); }
    finally { if (request.current === token && isActive(active)) setBusy(false); }
  }
  function cancel() { request.current++; session.current = null; setReading(null); setBusy(false); }
  function apply(remove = false) {
    const saved = session.current;
    if (!canEdit() || !active || busy || !saved) return;
    const { range, ruby } = saved;
    if (ruby) {
      if (!active.element?.contains(ruby)) { cancel(); return; }
      range.selectNode(ruby);
    }
    if (!active.restore(range)) { cancel(); return; }
    let html: string;
    if (remove && ruby) {
      const content = ruby.cloneNode(true) as HTMLElement;
      content.querySelectorAll("rt").forEach(rt => rt.remove());
      html = content.innerHTML;
    } else {
      const element = document.createElement("ruby");
      if (ruby) {
        const content = ruby.cloneNode(true) as HTMLElement;
        content.querySelectorAll("rt").forEach(rt => rt.remove());
        element.append(...content.childNodes);
      } else element.textContent = range.toString();
      const rt = document.createElement("rt"); rt.textContent = reading; element.append(rt);
      html = element.outerHTML;
    }
    document.execCommand("insertHTML", false, placementHtml(html));
    active.remember(); active.emit(); cancel();
  }
  return <>
    <div role="toolbar" aria-label={active ? `Format ${active.label}` : "Format teks"} onPointerDown={event => { if (event.target instanceof Element && event.target.closest("button")) event.preventDefault(); }} onMouseDown={event => event.preventDefault()}>
      <span className="placement-editor-label">{active ? `Aktif: ${active.label}` : "Pilih kolom teks untuk memformat"}</span>
      {([["bold", "B"], ["italic", "I"], ["underline", "U"]] as const).map(([name, text]) => <button type="button" key={name} disabled={unavailable} aria-label={name} aria-pressed={Boolean(formats[name])} onClick={() => command(name)}>{text}</button>)}
      <button type="button" disabled={unavailable || busy} onClick={() => void furigana()}>{"\u3042"} Furigana</button>
    </div>
    {reading !== null && <div className="placement-furigana-panel" role="group" aria-label="Edit Furigana"><label>Bacaan Hiragana<input value={reading} disabled={disabled || busy} onChange={event => setReading(event.target.value)} /></label><small>{busy ? "Menganalisis…" : "Periksa bacaan. Jika kosong atau tidak tepat, isi manual."}</small><div><button type="button" disabled={unavailable || busy || !reading.trim()} onClick={() => apply()}>Terapkan</button>{editingRuby && <button type="button" disabled={unavailable || busy} onClick={() => apply(true)}>Hapus Furigana</button>}<button type="button" onClick={cancel}>Batal</button></div></div>}
  </>;
}

type EditorProps = { contextual?: boolean; shared?: boolean; disabled?: boolean; value: string; onChange: (value: string) => void; label: string };
export function PlacementTextEditor(props: EditorProps) {
  return props.shared ? <TextEditor {...props} /> : <PlacementEditorProvider><TextEditor {...props} /></PlacementEditorProvider>;
}

function TextEditor({ value, onChange, label, contextual = false, shared = false, disabled = false }: EditorProps) {
  const context = useContext(EditorContext);
  if (!context) throw new Error("Shared PlacementTextEditor requires PlacementEditorProvider");
  const { activate, unregister, active } = context;
  const editor = useRef<HTMLDivElement>(null);
  const change = useRef(onChange);
  const blocked = useRef(disabled);
  useLayoutEffect(() => { change.current = onChange; blocked.current = disabled; }, [onChange, disabled]);
  const id = useId();
  const controller = useMemo<EditorController>(() => {
    const controller: EditorController = {
      id, label, element: null, range: null, composing: false,
      writable() { return Boolean(!blocked.current && controller.element?.isConnected && !controller.element.closest("fieldset:disabled")); },
      attach(element) { controller.element = element; },
      sync(value) {
        const element = controller.element;
        if (!element || controller.composing || document.activeElement === element) return;
        const html = placementHtml(value);
        if (element.innerHTML !== html) { controller.range = null; element.innerHTML = html; }
      },
      compose(composing) { controller.composing = composing; controller.remember(); if (!composing) controller.emit(); },
      emit() { if (controller.writable() && controller.element && !controller.composing) change.current(placementHtml(controller.element.innerHTML)); },
      restore(saved = controller.range ?? undefined) {
        const element = controller.element;
        if (!controller.writable() || !element || controller.composing || !saved || !element.contains(saved.startContainer) || !element.contains(saved.endContainer)) return false;
        element.focus();
        const selection = window.getSelection();
        selection?.removeAllRanges(); selection?.addRange(saved);
        return Boolean(selection);
      },
      remember() {
        if (!controller.writable()) return;
        const selection = window.getSelection();
        if (!selection?.rangeCount || !controller.element?.contains(selection.anchorNode) || !controller.element.contains(selection.focusNode)) return;
        controller.range = selection.getRangeAt(0).cloneRange();
        activate(controller, Object.fromEntries(["bold", "italic", "underline"].map(command => [command, document.queryCommandState(command)])));
      },
    };
    return controller;
  }, [id, label, activate]);
  useEffect(() => {
    controller.attach(editor.current);
    const element = editor.current;
    const syncDisabled = () => { if (element) element.contentEditable = String(!blocked.current && !element.closest("fieldset:disabled")); };
    syncDisabled();
    const observer = new MutationObserver(syncDisabled);
    for (let parent = element?.parentElement; parent; parent = parent.parentElement) {
      if (parent instanceof HTMLFieldSetElement) observer.observe(parent, { attributes: true, attributeFilter: ["disabled"] });
    }
    document.addEventListener("selectionchange", controller.remember);
    return () => { observer.disconnect(); document.removeEventListener("selectionchange", controller.remember); controller.attach(null); unregister(controller); };
  }, [controller, unregister]);
  useLayoutEffect(() => { if (editor.current) editor.current.contentEditable = String(!disabled && !editor.current.closest("fieldset:disabled")); }, [disabled]);
  useEffect(() => { controller.sync(value); }, [value, controller]);
  return <div className={`placement-text-editor${contextual ? " contextual-text-editor" : ""}`} data-active={active?.id === id ? "true" : undefined}>
    <span className="placement-editor-label">{label}</span>
    {!shared && <PlacementEditorToolbar disabled={disabled} />}
    <div ref={editor} contentEditable={!disabled} aria-disabled={disabled || undefined} suppressContentEditableWarning role="textbox" aria-label={label} aria-multiline="true" onFocus={controller.remember} onBlur={controller.remember} onInput={() => { controller.remember(); controller.emit(); }} onCompositionStart={() => controller.compose(true)} onCompositionEnd={() => controller.compose(false)} onKeyUp={controller.remember} onMouseUp={controller.remember} onBeforeInput={event => { if (!controller.writable()) event.preventDefault(); }} onKeyDown={event => { if (!controller.writable()) event.preventDefault(); }} onCut={event => { if (!controller.writable()) event.preventDefault(); }} onDrop={event => event.preventDefault()} onPaste={event => { event.preventDefault(); if (!controller.writable() || controller.composing) return; document.execCommand("insertText", false, event.clipboardData.getData("text/plain")); controller.remember(); controller.emit(); }} />
  </div>;
}
