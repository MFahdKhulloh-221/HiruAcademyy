"use client";

export const registrationDraftKey = "hiru.registration-draft.v1";
export const registrationDraftLifetime = 30 * 60 * 1000;
const fields = ["name", "email", "whatsapp"] as const;
export type RegistrationDraft = Record<(typeof fields)[number], string>;

export function clearRegistrationDraft() {
  try { sessionStorage.removeItem(registrationDraftKey); } catch { /* Storage is optional. */ }
}

export function readRegistrationDraft(): RegistrationDraft | null {
  try {
    const raw = sessionStorage.getItem(registrationDraftKey);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!value || Object.keys(value).sort().join() !== "email,name,updatedAt,whatsapp" || !Number.isSafeInteger(value.updatedAt) || value.updatedAt > Date.now() || Date.now() - value.updatedAt >= registrationDraftLifetime || fields.some(field => typeof value[field] !== "string" || value[field].length > 10000)) {
      clearRegistrationDraft();
      return null;
    }
    return { name: value.name, email: value.email, whatsapp: value.whatsapp };
  } catch {
    clearRegistrationDraft();
    return null;
  }
}

export function writeRegistrationDraft(form: HTMLFormElement) {
  try {
    const data = new FormData(form);
    const draft = Object.fromEntries(fields.map(field => [field, String(data.get(field) ?? "")]));
    if (Object.values(draft).some(value => value.length > 10000)) { clearRegistrationDraft(); return; }
    sessionStorage.setItem(registrationDraftKey, JSON.stringify({ ...draft, updatedAt: Date.now() }));
  } catch { /* Registration must work without storage. */ }
}
