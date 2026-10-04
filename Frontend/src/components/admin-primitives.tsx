"use client";

import Link from "next/link";
import { KeyboardEvent, ReactNode, RefObject, useEffect, useId, useRef } from "react";
export { AdminShell } from "@/components/admin-shell";

export function AdminPageHeader({ title, description, eyebrow, actions, headingLevel = 1 }: { title: string; description?: string; eyebrow?: string; actions?: ReactNode; headingLevel?: 1 | 2 }) {
  const Heading = headingLevel === 2 ? "h2" : "h1";
  return <header className="admin-page-header"><div>{eyebrow && <p className="admin-kicker">{eyebrow}</p>}<Heading>{title}</Heading>{description && <p>{description}</p>}</div>{actions && <div className="admin-page-actions">{actions}</div>}</header>;
}

export function AdminBreadcrumb({ items }: { items: readonly { label: string; href?: string }[] }) {
  return <nav className="admin-breadcrumb" aria-label="Breadcrumb"><ol>{items.map((item, index) => <li key={`${item.label}-${index}`} aria-current={index === items.length - 1 ? "page" : undefined}>{item.href && index !== items.length - 1 ? <Link href={item.href}>{item.label}</Link> : item.label}</li>)}</ol></nav>;
}

export function AdminToolbar({ children }: { children: ReactNode }) { return <div className="admin-toolbar">{children}</div>; }
export function AdminFilterToolbar({ children }: { children: ReactNode }) { return <div className="admin-filter-toolbar" aria-label="Filter data">{children}</div>; }
export function AdminSection({ title, description, actions, children, className = "" }: { title?: string; description?: string; actions?: ReactNode; children: ReactNode; className?: string }) { return <section className={`admin-section ${className}`}>{(title || description || actions) && <header><div>{title && <h2>{title}</h2>}{description && <p>{description}</p>}</div>{actions}</header>}{children}</section>; }
export function AdminMetricCard({ label, value, detail }: { label: string; value: ReactNode; detail?: string }) { return <article className="admin-metric-card"><p>{label}</p><strong>{value}</strong>{detail && <small>{detail}</small>}</article>; }

const statusClasses: Record<string, string> = {
  draft: "draft", draf: "draft", published: "published", terbit: "published", dipublikasikan: "published",
  pending: "pending", menunggu: "pending", verified: "verified", terverifikasi: "verified", diperiksa: "verified",
  active: "active", aktif: "active", rejected: "rejected", ditolak: "rejected", paid: "paid", dibayar: "paid", diproses: "pending",
  baru: "pending", "sudah dihubungi": "verified",
  "menunggu pembayaran": "pending", "sudah bayar": "pending", diverifikasi: "verified",
  "sudah dicairkan": "paid", "menunggu validasi": "pending", tersedia: "active", dibatalkan: "rejected", nonaktif: "draft",
};
export function AdminStatusBadge({ status }: { status: string }) { return <span className={`admin-status-badge status-${statusClasses[status.toLowerCase()] ?? "neutral"}`}>{status}</span>; }

export function AdminEmptyState({ title = "Belum ada data", description, action }: { title?: string; description?: string; action?: ReactNode }) { return <div className="admin-empty-state"><h3>{title}</h3>{description && <p>{description}</p>}{action}</div>; }

type Column<Row> = { key: string; header: ReactNode; cell: (row: Row) => ReactNode };
export function AdminDataTable<Row>({ caption, columns, rows, rowKey, empty, actions }: { caption?: string; columns: readonly Column<Row>[]; rows: readonly Row[]; rowKey: (row: Row) => string; empty?: ReactNode; actions?: { header?: string; cell: (row: Row) => ReactNode } }) {
  if (!rows.length) return <AdminEmptyState title="Belum ada data" description={typeof empty === "string" ? empty : undefined} action={typeof empty === "string" ? undefined : empty}/>;
  return <div className="admin-data-table-wrap"><table className="admin-data-table">{caption && <caption>{caption}</caption>}<thead><tr>{columns.map((column) => <th key={column.key} scope="col">{column.header}</th>)}{actions && <th scope="col">{actions.header ?? "Tindakan"}</th>}</tr></thead><tbody>{rows.map((row) => <tr key={rowKey(row)}>{columns.map((column) => <td key={column.key}>{column.cell(row)}</td>)}{actions && <td>{actions.cell(row)}</td>}</tr>)}</tbody></table></div>;
}

export function AdminConfirmDialog({ open, title, children, close, initialFocusRef, closeOnBackdrop = true, actions }: { open: boolean; title: string; children: ReactNode; close: () => void; initialFocusRef?: RefObject<HTMLElement | null>; closeOnBackdrop?: boolean; actions?: ReactNode }) {
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement as HTMLElement;
    const focusable = () => [...(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])];
    (initialFocusRef?.current ?? focusable()[0] ?? panel.current)?.focus();
    function keydown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (!elements.length) { event.preventDefault(); panel.current?.focus(); return; }
      const first = elements[0]; const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); returnFocus.current?.focus(); };
  }, [close, initialFocusRef, open]);
  if (!open) return null;
  return <div className="admin-dialog-layer"><div className="admin-dialog-backdrop" onMouseDown={closeOnBackdrop ? close : undefined} role="presentation" /><section ref={panel} className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}><header><h2 id={titleId}>{title}</h2><button type="button" onClick={close} aria-label="Tutup dialog">×</button></header><div className="admin-dialog-content">{children}</div>{actions && <footer>{actions}</footer>}</section></div>;
}
export const AdminDialog = AdminConfirmDialog;

export function AdminTabs({ tabs, active, onChange, label, children }: { tabs: readonly string[]; active: string; onChange: (tab: string) => void; label: string; children?: ReactNode }) {
  const baseId = useId();
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault(); onChange(tabs[next]); event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }
  return <><div className="admin-tabs" role="tablist" aria-label={label}>{tabs.map((name, index) => <button id={`${baseId}-tab-${index}`} aria-controls={`${baseId}-panel-${index}`} key={name} type="button" role="tab" aria-selected={active === name} tabIndex={active === name ? 0 : -1} className={active === name ? "active" : ""} onClick={() => onChange(name)} onKeyDown={(event) => keyboard(event, index)}>{name}</button>)}</div>{children && <div id={`${baseId}-panel-${tabs.indexOf(active)}`} role="tabpanel" aria-labelledby={`${baseId}-tab-${tabs.indexOf(active)}`} tabIndex={0}>{children}</div>}</>;
}

export function AdminActivityList({ items }: { items: readonly { id: string; title: string; detail: string; status?: string }[] }) { return items.length ? <ol className="admin-activity-list">{items.map((item) => <li key={item.id}><div><strong>{item.title}</strong><p>{item.detail}</p></div>{item.status && <AdminStatusBadge status={item.status}/>}</li>)}</ol> : <AdminEmptyState/>; }
