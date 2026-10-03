"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { adminGroups } from "@/lib/admin-console";

function isActive(pathname: string, href: string) { return href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`); }

export function AdminNavigation({ current }: { current: string }) {
  const pathname = usePathname() || current;
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => [...(sidebar.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])") ?? [])];
    focusable()[0]?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); requestAnimationFrame(() => trigger.current?.focus()); return; }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first || !last) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !sidebar.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !sidebar.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); document.body.style.overflow = previousOverflow; };
  }, [open]);
  return <><button ref={trigger} className="admin-mobile-toggle" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="admin-sidebar" aria-label={open ? "Tutup navigasi admin" : "Buka navigasi admin"}><span aria-hidden="true">≡</span></button><aside ref={sidebar} id="admin-sidebar" className={`admin-sidebar ${open ? "open" : ""}`} aria-hidden={!open ? undefined : false}><div className="admin-brand"><BrandLogo/><p>ADMIN CONSOLE</p></div><nav aria-label="Navigasi admin">{adminGroups.map((group) => <section className="console-nav-group" key={group.label}><p>{group.label}</p>{group.items.map((item) => <Link key={item.href} href={item.href} className={`admin-nav-item ${isActive(pathname, item.href) ? "active" : ""}`} aria-current={pathname === item.href ? "page" : undefined} onClick={() => setOpen(false)}>{item.label}</Link>)}</section>)}</nav><div className="admin-nav-footer"><Link href="/" className="admin-nav-item">Kembali ke Situs</Link></div></aside>{open && <div className="admin-mobile-backdrop" role="presentation" onMouseDown={() => { setOpen(false); requestAnimationFrame(() => trigger.current?.focus()); }} />}</>;
}
