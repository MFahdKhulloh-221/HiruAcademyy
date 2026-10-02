"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LuBell, LuEllipsis, LuHouse, LuLockKeyhole, LuLogOut, LuMenu, LuMessagesSquare, LuPlay, LuRoute, LuSettings, LuTrendingUp, LuUser, LuX } from "react-icons/lu";
import type { IconType } from "react-icons";
import { BrandLogo } from "@/components/brand-logo";
import type { Membership } from "@/lib/dashboard-mock";

export type StudentNavKey = "dashboard" | "journey" | "practice" | "flashcards" | "library" | "tryout" | "schedule" | "replay" | "mini-checkpoint" | "community" | "ask-sensei" | "progress" | "leaderboard" | "certificate" | "notifications" | "profile" | "membership" | "affiliate";
type Entitlement = "available" | "limited" | "readOnly" | "locked";
type Implementation = "implemented" | "notImplemented";
type NavChild = { key: StudentNavKey; label: string; href: string; entitlement: Entitlement };
type NavItem = { key?: StudentNavKey; label: string; icon: IconType; href?: string; entitlement: Entitlement; implementation: Implementation; active?: boolean; children?: NavChild[] };
type ModalState = { feature: string; variant: "membershipLock" | "notImplemented" };

function matchesFamily(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function resolveStudentNavKey(pathname: string): StudentNavKey | null {
  if (pathname === "/dashboard") return "dashboard";
  if (matchesFamily(pathname, "/journey")) return "journey";
  if (/^\/learn\/[^/]+\/[^/]+\/flashcards$/.test(pathname)) return "flashcards";
  if (matchesFamily(pathname, "/learn")) return "journey";
  if (pathname === "/practice") return "practice";
  if (pathname === "/flashcards") return "flashcards";
  if (pathname === "/library") return "library";
  if (matchesFamily(pathname, "/tryout")) return "tryout";
  if (matchesFamily(pathname, "/schedule")) return "schedule";
  if (matchesFamily(pathname, "/replay")) return "replay";
  if (matchesFamily(pathname, "/mini-checkpoint")) return "mini-checkpoint";
  if (pathname === "/community/ask") return "ask-sensei";
  if (matchesFamily(pathname, "/community")) return "community";
  if (pathname === "/ask-sensei") return "ask-sensei";
  if (pathname === "/progress") return "progress";
  if (pathname === "/leaderboard") return "leaderboard";
  if (matchesFamily(pathname, "/certificate")) return "certificate";
  if (pathname === "/notifications") return "notifications";
  if (pathname === "/profile") return "profile";
  if (matchesFamily(pathname, "/renewal") || pathname === "/membership") return "membership";
  if (pathname === "/affiliate") return "affiliate";
  return null;
}

function itemsFor(membership: Membership, current: StudentNavKey | null): NavItem[] {
  const free = membership === "free";
  const sensei = membership === "sensei";
  const query = `?membership=${membership}`;
  const items: NavItem[] = [
    { key: "dashboard", label: "Dashboard", icon: LuHouse, href: `/dashboard${query}`, entitlement: "available", implementation: "implemented" },
    { label: "Kelas Saya", icon: LuRoute, entitlement: "available", implementation: "implemented", children: [
      { key: "journey", label: "Perjalanan Level", href: `/journey${query}`, entitlement: "available" },
      { key: "practice", label: "Latihan Harian", href: `/practice${query}`, entitlement: free ? "limited" : "available" },
      { key: "flashcards", label: "Kumpulan Flashcard", href: `/flashcards${query}`, entitlement: free ? "limited" : "available" },
      { key: "library", label: "Perpustakaan", href: `/library${query}`, entitlement: free ? "limited" : "available" },
      { key: "tryout", label: "Try Out", href: `/tryout${query}`, entitlement: free ? "locked" : "available" },
      { key: "schedule", label: "Jadwal", href: `/schedule${query}`, entitlement: sensei ? "available" : "locked" },
      { key: "replay", label: "Replay", href: `/replay${query}`, entitlement: sensei ? "available" : "locked" },
      { key: "mini-checkpoint", label: "Mini Checkpoint", href: `/mini-checkpoint${query}`, entitlement: sensei ? "available" : "locked" },
    ] },
    { label: "Komunitas", icon: LuMessagesSquare, entitlement: free ? "readOnly" : "available", implementation: "implemented", children: [
      { key: "community", label: "Diskusi Member", href: `/community${query}`, entitlement: free ? "readOnly" : "available" },
      { key: "ask-sensei", label: "Tanya Sensei", href: `/ask-sensei${query}`, entitlement: sensei ? "available" : "locked" },
    ] },
    { label: "Progres", icon: LuTrendingUp, entitlement: "available", implementation: "implemented", children: [
      { key: "progress", label: "Ringkasan Progres", href: `/progress${query}`, entitlement: "available" },
      { key: "leaderboard", label: "Leaderboard", href: `/leaderboard${query}`, entitlement: "available" },
      { key: "certificate", label: "Sertifikat", href: `/certificate${query}`, entitlement: free ? "locked" : "available" },
    ] },
    { key: "notifications", label: "Notifikasi", icon: LuBell, href: `/notifications${query}`, entitlement: "available", implementation: "implemented" },
    { label: "Profil", icon: LuUser, entitlement: "available", implementation: "implemented", children: [
      { key: "profile", label: "Profil Saya", href: `/profile${query}`, entitlement: "available" },
      { key: "membership", label: "Membership", href: `/renewal${query}`, entitlement: "available" },
      { key: "affiliate", label: "Affiliate", href: `/affiliate${query}`, entitlement: "available" },
    ] },
  ];
  return items.map((item) => ({ ...item, active: item.key === current || item.children?.some((child) => child.key === current) }));
}

export function StudentNavigation({ membership }: { membership: Membership }) {
  const pathname = usePathname();
  const current = resolveStudentNavKey(pathname);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [modal, setModal] = useState<ModalState | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement | null>(null);
  const mobileCloseRef = useRef<HTMLButtonElement | null>(null);
  const mobilePanelRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);

  function openModal(feature: string, variant: ModalState["variant"], trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    if (variant === "membershipLock") {
      setFeedback(feature);
      window.setTimeout(() => setFeedback(null), 280);
    }
    setModal({ feature, variant });
  }

  function closeModal() {
    setModal(null);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  useEffect(() => {
    if (!mobileOpen) return;
    mobileCloseRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileOpen(false);
        window.setTimeout(() => mobileTriggerRef.current?.focus(), 0);
      }
      if (event.key !== "Tab" || !mobilePanelRef.current) return;
      const focusable = [...mobilePanelRef.current.querySelectorAll<HTMLElement>('button,[href]')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  useEffect(() => {
    if (!modal) return;
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeModal();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button,[href]')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [modal]);

  const items = itemsFor(membership, current);
  const navigation = (
    <>
      <Link className="student-nav-brand" href="/" aria-label="HIRU Academy, kembali ke beranda"><BrandLogo /></Link>
      <nav aria-label="Navigasi siswa">{items.map((item) => {
        const stateClass = item.active ? "active" : item.entitlement;
        const Icon = item.icon;
        if (item.children && item.entitlement !== "locked") {
          const open = item.active || expanded[item.label] === true;
          return <div className="student-nav-group" key={item.label}><button className={`student-nav-item student-nav-parent state-${stateClass}`} type="button" aria-expanded={open} onClick={() => setExpanded((state) => ({ ...state, [item.label]: !open }))}><span aria-hidden="true"><Icon /></span>{item.label}<i className={open ? "open" : ""} aria-hidden="true">⌄</i></button>{open && <div className="student-submenu">{item.children.map((child) => { const active = child.key === current; return child.entitlement === "locked" ? <button className={`${active ? "active " : ""}locked`} type="button" aria-current={active ? "page" : undefined} onClick={(event) => openModal(child.label, "membershipLock", event.currentTarget)} key={child.key}><span>{child.label}</span><LuLockKeyhole aria-hidden="true" /></button> : <Link className={active ? "active" : ""} href={child.href} aria-current={active ? "page" : undefined} onClick={() => { setMobileOpen(false); if (child.key === "practice") window.dispatchEvent(new CustomEvent("hiru:practice-list")); }} key={child.key}>{child.label}</Link>; })}</div>}</div>;
        }
        if (item.entitlement !== "locked" && item.implementation === "implemented" && item.href) return <Link className={`student-nav-item state-${stateClass}`} href={item.href} aria-current={item.active ? "page" : undefined} onClick={() => setMobileOpen(false)} key={item.label}><span aria-hidden="true"><Icon /></span>{item.label}</Link>;
        const variant = item.entitlement === "locked" ? "membershipLock" : "notImplemented";
        return <button className={`student-nav-item state-${stateClass}${feedback === item.label ? " locked-feedback" : ""}`} type="button" onClick={(event) => openModal(item.label, variant, event.currentTarget)} key={item.label}><span aria-hidden="true"><Icon /></span>{item.label}{item.entitlement === "locked" && <i aria-hidden="true"><LuLockKeyhole /></i>}</button>;
      })}</nav>
      <div className="student-nav-bottom">
        <button type="button" onClick={(event) => openModal("Mulai Belajar", "notImplemented", event.currentTarget)}>
          <span aria-hidden="true"><LuPlay /></span>
          <span>Mulai Belajar</span>
        </button>
        <button type="button" onClick={(event) => openModal("Pengaturan", "notImplemented", event.currentTarget)}>
          <span aria-hidden="true"><LuSettings /></span>
          <span>Pengaturan</span>
        </button>
        <button type="button" onClick={(event) => openModal("Keluar", "notImplemented", event.currentTarget)}>
          <span aria-hidden="true"><LuLogOut /></span>
          <span>Keluar</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      <aside className="student-nav-desktop">{navigation}</aside>
      <button ref={mobileTriggerRef} className="student-mobile-trigger" type="button" onClick={() => setMobileOpen(true)} aria-label="Buka navigasi" aria-expanded={mobileOpen} aria-controls="student-mobile-panel"><LuMenu aria-hidden="true" /></button>
      {mobileOpen && <div className="student-mobile-nav"><button className="student-mobile-backdrop" type="button" aria-label="Tutup navigasi" onClick={() => { setMobileOpen(false); window.setTimeout(() => mobileTriggerRef.current?.focus(), 0); }} /><aside ref={mobilePanelRef} id="student-mobile-panel" aria-label="Navigasi siswa seluler"><button ref={mobileCloseRef} className="student-mobile-close" type="button" onClick={() => { setMobileOpen(false); window.setTimeout(() => mobileTriggerRef.current?.focus(), 0); }} aria-label="Tutup navigasi"><LuX aria-hidden="true" /></button>{navigation}</aside></div>}
      {modal && <div className="locked-modal"><button className="locked-modal-backdrop" type="button" aria-label="Tutup" onClick={closeModal} /><section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="student-modal-title"><button ref={closeRef} className="locked-modal-close" type="button" onClick={closeModal} aria-label="Tutup"><LuX aria-hidden="true" /></button><span className="locked-modal-icon" aria-hidden="true">{modal.variant === "membershipLock" ? <LuLockKeyhole /> : <LuEllipsis />}</span><p>{modal.feature}</p><h2 id="student-modal-title">{modal.variant === "membershipLock" ? "Akses Terkunci" : "Fitur Belum Tersedia"}</h2>{modal.variant === "notImplemented" && <p className="locked-modal-message">Fitur ini sedang disiapkan dan akan segera hadir.</p>}<div className={`locked-modal-actions${modal.variant === "notImplemented" ? " single" : ""}`}><button type="button" onClick={closeModal}>Tutup</button>{modal.variant === "membershipLock" && <Link href="/#program" onClick={closeModal}>Upgrade</Link>}</div></section></div>}
    </>
  );
}
