import { freeChapterDestination } from "./free-chapter";

// Keep auth return routes narrow; authorization still belongs to Laravel.
export function safeAuthDestination(value: string | null): string | null {
  if (freeChapterDestination(value)) return value;
  if (!value || /[\\\u0000-\u0020\u007f]/.test(value)) return null;
  if (!/^\/(checkout|invoice)(?:\?|$)/.test(value)) return null;
  try {
    const url = new URL(value, "https://auth.invalid");
    if (url.origin !== "https://auth.invalid" || !["/checkout", "/invoice"].includes(url.pathname) || url.hash) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}
