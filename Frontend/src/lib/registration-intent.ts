"use client";

import { safeAuthDestination } from "@/lib/auth-destination";

const key = "hiru.registration-intent.v1";
const lifetime = 30 * 60 * 1000;

export function clearRegistrationIntent() {
  try { sessionStorage.removeItem(key); } catch { /* Storage is optional. */ }
}

function purchaseDestination(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const destination = safeAuthDestination(value);
  if (!destination) return null;
  const url = new URL(destination, "https://hiruacademy.id");
  if (url.pathname === "/invoice" && /^\d+$/.test(url.searchParams.get("id") ?? "")) return destination;
  return url.pathname === "/checkout" && ["lms", "sensei"].includes(url.searchParams.get("plan") ?? "") && Boolean(url.searchParams.get("program")) ? destination : null;
}

export function writeRegistrationIntent(userId: string | number, destination: string) {
  const valid = purchaseDestination(destination);
  if (!valid) { clearRegistrationIntent(); return; }
  try { sessionStorage.setItem(key, JSON.stringify({ userId: String(userId), destination: valid, updatedAt: Date.now() })); } catch { /* Navigation must work without storage. */ }
}

export function readRegistrationIntent(userId: string | number): string | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (!value || value.userId !== String(userId) || !Number.isSafeInteger(value.updatedAt) || value.updatedAt > Date.now() || Date.now() - value.updatedAt >= lifetime) { clearRegistrationIntent(); return null; }
    const destination = purchaseDestination(value.destination);
    if (!destination) clearRegistrationIntent();
    return destination;
  } catch { clearRegistrationIntent(); return null; }
}
