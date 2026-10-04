"use client";

import { useSyncExternalStore } from "react";

export const SETTINGS_STORAGE_KEY = "hiru-admin-settings:v1";
export const SETTINGS_CHANGE_EVENT = "hiru:settings-change";
const LEGACY_BUSINESS_STORAGE_KEY = "hiru-admin-business:v1";

export type GeneralSettings = {
  siteName: string;
  locale: "id-ID";
  timezone: "Asia/Jakarta";
};

export type BrandingSettings = {
  logoUrl: string;
  faviconUrl: string;
  companyLabel: string;
};

export type ContactSettings = {
  whatsappNumber: string;
  supportEmail: string;
  address: string;
  instagramUrl: string;
};

export type IntegrationSettings = {
  ga4Enabled: boolean;
  ga4MeasurementId: string;
  metaEnabled: boolean;
  metaPixelId: string;
  meetingProvider: "Manual" | "Zoom" | "Google Meet" | "Lainnya";
  senderName: string;
  senderEmail: string;
};

export type PrivacySettings = {
  privacyPolicyPath: string;
  termsPath: string;
  analyticsConsentRequired: boolean;
};

export type AdminProfileSettings = {
  displayName: string;
  email: string;
  avatarUrl: string;
};

export type AdminSettings = {
  version: 1;
  general: GeneralSettings;
  branding: BrandingSettings;
  contact: ContactSettings;
  integrations: IntegrationSettings;
  privacy: PrivacySettings;
  adminProfile: AdminProfileSettings;
};

const initialSettings: AdminSettings = {
  version: 1,
  general: { siteName: "Hiru Academy", locale: "id-ID", timezone: "Asia/Jakarta" },
  branding: { logoUrl: "", faviconUrl: "", companyLabel: "Hiru Academy" },
  contact: {
    whatsappNumber: "",
    supportEmail: "",
    address: "",
    instagramUrl: "",
  },
  integrations: {
    ga4Enabled: false,
    ga4MeasurementId: "",
    metaEnabled: false,
    metaPixelId: "",
    meetingProvider: "Manual",
    senderName: "",
    senderEmail: "",
  },
  privacy: {
    privacyPolicyPath: "/kebijakan-privasi",
    termsPath: "/syarat-ketentuan",
    analyticsConsentRequired: true,
  },
  adminProfile: { displayName: "", email: "", avatarUrl: "" },
};

export const initialAdminSettings: AdminSettings = initialSettings;

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeAdminSettings(value: unknown): AdminSettings {
  const root = record(value);
  const general = record(root.general);
  const branding = record(root.branding);
  const contact = record(root.contact);
  const integrations = record(root.integrations);
  const privacy = record(root.privacy);
  const adminProfile = record(root.adminProfile);
  const provider = integrations.meetingProvider;

  return {
    version: 1,
    general: {
      siteName: text(general.siteName, initialSettings.general.siteName),
      locale: "id-ID",
      timezone: "Asia/Jakarta",
    },
    branding: {
      logoUrl: text(branding.logoUrl, ""),
      faviconUrl: text(branding.faviconUrl, ""),
      companyLabel: text(branding.companyLabel, initialSettings.branding.companyLabel),
    },
    contact: {
      whatsappNumber: text(contact.whatsappNumber, ""),
      supportEmail: text(contact.supportEmail, ""),
      address: text(contact.address, ""),
      instagramUrl: text(contact.instagramUrl, ""),
    },
    integrations: {
      ga4Enabled: flag(integrations.ga4Enabled, false),
      ga4MeasurementId: text(integrations.ga4MeasurementId, ""),
      metaEnabled: flag(integrations.metaEnabled, false),
      metaPixelId: text(integrations.metaPixelId, ""),
      meetingProvider:
        provider === "Zoom" || provider === "Google Meet" || provider === "Lainnya"
          ? provider
          : "Manual",
      senderName: text(integrations.senderName, ""),
      senderEmail: text(integrations.senderEmail, ""),
    },
    privacy: {
      privacyPolicyPath: text(privacy.privacyPolicyPath, initialSettings.privacy.privacyPolicyPath),
      termsPath: text(privacy.termsPath, initialSettings.privacy.termsPath),
      analyticsConsentRequired: flag(privacy.analyticsConsentRequired, true),
    },
    adminProfile: {
      displayName: text(adminProfile.displayName, ""),
      email: text(adminProfile.email, ""),
      avatarUrl: text(adminProfile.avatarUrl, ""),
    },
  };
}

function legacyWhatsApp(storage: Pick<Storage, "getItem">): string {
  try {
    const business = record(JSON.parse(storage.getItem(LEGACY_BUSINESS_STORAGE_KEY) || "null"));
    const settings = record(business.settings);
    return text(settings.adminWhatsAppNumber, "");
  } catch {
    return "";
  }
}

export function loadAdminSettings(
  storage: Pick<Storage, "getItem" | "setItem"> | null =
    typeof window === "undefined" ? null : window.localStorage
): AdminSettings {
  if (!storage) return initialSettings;
  try {
    const raw = storage.getItem(SETTINGS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const settings = normalizeAdminSettings(parsed);
    const canonicalWhatsApp = record(record(parsed).contact).whatsappNumber;
    if (typeof canonicalWhatsApp === "string" && canonicalWhatsApp.trim()) return settings;
    const whatsappNumber = legacyWhatsApp(storage) || initialSettings.contact.whatsappNumber;
    const migrated = normalizeAdminSettings({
      ...settings,
      contact: { ...settings.contact, whatsappNumber },
    });
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    return initialSettings;
  }
}

export const readAdminSettingsStore = loadAdminSettings;

export function saveAdminSettings(
  value: unknown,
  storage: Pick<Storage, "setItem"> | null =
    typeof window === "undefined" ? null : window.localStorage
): AdminSettings {
  const settings = normalizeAdminSettings(value);
  try {
    storage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {}
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SETTINGS_CHANGE_EVENT));
  return settings;
}

export type AdminSettingsPatch = Partial<{
  general: Partial<GeneralSettings>;
  branding: Partial<BrandingSettings>;
  contact: Partial<ContactSettings>;
  integrations: Partial<IntegrationSettings>;
  privacy: Partial<PrivacySettings>;
  adminProfile: Partial<AdminProfileSettings>;
}>;

export function updateAdminSettings(patch: AdminSettingsPatch): AdminSettings {
  const current = loadAdminSettings();
  return saveAdminSettings({
    ...current,
    ...patch,
    general: { ...current.general, ...patch.general },
    branding: { ...current.branding, ...patch.branding },
    contact: { ...current.contact, ...patch.contact },
    integrations: { ...current.integrations, ...patch.integrations },
    privacy: { ...current.privacy, ...patch.privacy },
    adminProfile: { ...current.adminProfile, ...patch.adminProfile },
  });
}

let cachedRaw: string | null | undefined;
let cachedSettings: AdminSettings = initialSettings;

function readSnapshot(): AdminSettings {
  if (typeof window === "undefined") return initialSettings;
  const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (raw !== cachedRaw) {
    cachedSettings = loadAdminSettings();
    cachedRaw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
  }
  return cachedSettings;
}

function subscribe(onStoreChange: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key !== SETTINGS_STORAGE_KEY) return;
    cachedRaw = undefined;
    onStoreChange();
  };
  const change = () => {
    cachedRaw = undefined;
    onStoreChange();
  };
  window.addEventListener("storage", storage);
  window.addEventListener(SETTINGS_CHANGE_EVENT, change);
  return () => {
    window.removeEventListener("storage", storage);
    window.removeEventListener(SETTINGS_CHANGE_EVENT, change);
  };
}

export function useAdminSettings(): AdminSettings {
  return useSyncExternalStore(subscribe, readSnapshot, () => initialSettings);
}
