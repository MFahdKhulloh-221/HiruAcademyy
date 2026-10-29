"use client";

import Link from "next/link";
import { useEditorNavigation } from "./admin-editor-navigation";
import { usePathname, useRouter } from "next/navigation";
import { LuLogOut } from "react-icons/lu";
import { useAuth } from "@/components/auth-provider";
import { useEffect, useRef, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { adminGroups } from "@/lib/admin-console";

function isActive(pathname: string, href: string) { const path = href.split("?")[0]; return path === "/admin" ? pathname === path : pathname === path || pathname.startsWith(`${path}/`); }

export function AdminNavigation({ current }: { current: string }) {
  const navigation = useEditorNavigation();
  const pathname = usePathname() || current;
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const logoutPending = useRef(false);

  async function handleLogout() {
    if (logoutPending.current) return;
    logoutPending.current = true;
    setLoggingOut(true);
    setLogoutError("");
    try {
      await logout();
      router.replace("/login");
    } catch {
      setLogoutError("Gagal keluar. Periksa koneksi, lalu coba lagi.");
    } finally {
      logoutPending.current = false;
      setLoggingOut(false);
    }
  }
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
  return <><button ref={trigger} className="admin-mobile-toggle" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="admin-sidebar" aria-label={open ? "Tutup navigasi admin" : "Buka navigasi admin"}><span aria-hidden="true">≡</span></button><aside ref={sidebar} id="admin-sidebar" className={`admin-sidebar ${open ? "open" : ""}`} aria-hidden={!open ? undefined : false}><div className="admin-brand"><BrandLogo/><p>ADMIN CONSOLE</p></div><nav aria-label="Navigasi admin">{adminGroups.map((group) => <section className="console-nav-group" key={group.label}><p>{group.label}</p>{group.items.map((item) => <Link key={item.href} href={item.href} className={`admin-nav-item ${isActive(pathname, item.href) ? "active" : ""}`} aria-current={pathname === item.href ? "page" : undefined} onNavigate={event => { if (navigation) { event.preventDefault(); navigation.request(() => { setOpen(false); router.push(item.href); }); } }} onClick={() => { if (!navigation) setOpen(false); }}>{item.label}</Link>)}</section>)}</nav><div className="admin-nav-footer"><Link href="/" className="admin-nav-item" onNavigate={event => { if (navigation) { event.preventDefault(); navigation.request(() => router.push("/")); } }}>Kembali ke Situs</Link>{logoutError && <p role="alert">{logoutError}</p>}<button type="button" className="admin-nav-item logout" disabled={loggingOut} onClick={() => navigation ? navigation.request(() => void handleLogout()) : void handleLogout()}><LuLogOut aria-hidden="true" />{loggingOut ? "Keluar…" : "Keluar"}</button></div></aside>{open && <div className="admin-mobile-backdrop" role="presentation" onMouseDown={() => { setOpen(false); requestAnimationFrame(() => trigger.current?.focus()); }} />}</>;
}
