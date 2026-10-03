"use client";

import { FormEvent, useMemo, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import {
  AdminBreadcrumb,
  AdminPageHeader,
  AdminShell,
  AdminTabs,
} from "@/components/admin-primitives";
import {
  updateBusinessSettings,
  useBusinessAdminStore,
} from "@/lib/admin-business-store";
import {
  type AdminSettings,
  saveAdminSettings,
  useAdminSettings,
} from "@/lib/admin-settings-store";

const tabs = ["Umum", "Branding", "Kontak", "Integrasi", "Privasi", "Profil Admin"] as const;
type Tab = (typeof tabs)[number];
type IntegrationStatus = "Nonaktif" | "Perlu dilengkapi" | "Siap digunakan";

function integrationStatus(enabled: boolean, valid: boolean): IntegrationStatus {
  if (!enabled) return "Nonaktif";
  return valid ? "Siap digunakan" : "Perlu dilengkapi";
}

function Field({ label, children, help }: { label: string; children: React.ReactNode; help?: string }) {
  return <label className="settings-field"><span>{label}</span>{children}{help && <small>{help}</small>}</label>;
}

function Status({ value }: { value: IntegrationStatus }) {
  return <span className={`settings-status status-${value === "Siap digunakan" ? "ready" : value === "Perlu dilengkapi" ? "warning" : "off"}`}>{value}</span>;
}

function AdminSettingsForm({
  savedSettings,
  business,
  initialTab,
}: {
  savedSettings: AdminSettings;
  business: ReturnType<typeof useBusinessAdminStore>;
  initialTab: Tab;
}) {
  const { user } = useAuth();
  const [active, setActive] = useState<Tab>(initialTab);
  const [draft, setDraft] = useState<AdminSettings>(savedSettings);
  const [invoiceTemplate, setInvoiceTemplate] = useState(business.settings.invoiceWhatsAppTemplate);
  const [affiliate, setAffiliate] = useState({
    affiliateEnabled: business.settings.affiliateEnabled,
    commissionMode: business.settings.commissionMode,
    commissionValue: business.settings.commissionValue,
    validationPeriodDays: business.settings.validationPeriodDays,
  });
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(savedSettings) || invoiceTemplate !== business.settings.invoiceWhatsAppTemplate || JSON.stringify(affiliate) !== JSON.stringify({ affiliateEnabled: business.settings.affiliateEnabled, commissionMode: business.settings.commissionMode, commissionValue: business.settings.commissionValue, validationPeriodDays: business.settings.validationPeriodDays }), [affiliate, business.settings, draft, invoiceTemplate, savedSettings]);
  const ga4Valid = /^G-[A-Z0-9]+$/i.test(draft.integrations.ga4MeasurementId.trim());
  const metaValid = /^\d{5,20}$/.test(draft.integrations.metaPixelId.trim());

  function patch<K extends Exclude<keyof AdminSettings, "version">>(section: K, value: Partial<AdminSettings[K]>) {
    setDraft((current) => ({ ...current, [section]: { ...current[section], ...value } }));
    setMessage("");
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (active === "Profil Admin") return;
    const nextErrors: Record<string, string> = {};
    if (active === "Umum" && !draft.general.siteName.trim()) nextErrors.siteName = "Nama situs wajib diisi.";
    if (active === "Kontak") {
      if (!/^\+?\d{8,15}$/.test(draft.contact.whatsappNumber.replace(/[\s()-]/g, ""))) nextErrors.whatsapp = "Gunakan 8–15 digit nomor WhatsApp.";
      if (draft.contact.supportEmail && !/^\S+@\S+\.\S+$/.test(draft.contact.supportEmail)) nextErrors.supportEmail = "Email dukungan tidak valid.";
    }
    if (active === "Integrasi") {
      if (draft.integrations.ga4Enabled && !ga4Valid) nextErrors.ga4 = "Measurement ID harus berformat G-XXXXXXXXXX.";
      if (draft.integrations.metaEnabled && !metaValid) nextErrors.meta = "Pixel ID harus berisi 5–20 digit.";
      if (draft.integrations.senderEmail && !/^\S+@\S+\.\S+$/.test(draft.integrations.senderEmail)) nextErrors.senderEmail = "Email pengirim tidak valid.";
      if (affiliate.commissionValue < 0) nextErrors.commissionValue = "Nilai komisi tidak boleh negatif.";
      if (affiliate.validationPeriodDays < 0) nextErrors.validationPeriodDays = "Periode validasi tidak boleh negatif.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    saveAdminSettings(draft);
    updateBusinessSettings({ invoiceWhatsAppTemplate: invoiceTemplate, ...affiliate });
    setMessage(`Pengaturan ${active} berhasil disimpan.`);
  }

  return (
    <>
      <AdminPageHeader eyebrow="SISTEM" title="Pengaturan & Integrasi" description="Kelola identitas situs, kontak, integrasi, privasi, dan profil admin." actions={<span className={`settings-dirty ${dirty ? "is-dirty" : ""}`}>{dirty ? "Perubahan belum disimpan" : "Semua perubahan tersimpan"}</span>} />
      <AdminTabs tabs={tabs} active={active} onChange={(tab) => { setActive(tab as Tab); setErrors({}); setMessage(""); }} label="Bagian pengaturan">
        <form className="settings-form" onSubmit={save}>
          {active === "Umum" && <section className="settings-card"><header><div><h2>Pengaturan umum</h2><p>Identitas dan standar tetap situs.</p></div></header><div className="settings-grid">
            <Field label="Nama situs"><input value={draft.general.siteName} onChange={(e) => patch("general", { siteName: e.target.value })} aria-invalid={!!errors.siteName} />{errors.siteName && <em>{errors.siteName}</em>}</Field>
            <Field label="Locale" help="Standar bahasa situs ditetapkan untuk Indonesia."><input value="id-ID" disabled /></Field>
            <Field label="Zona waktu" help="Semua jadwal ditampilkan dalam waktu Jakarta."><input value="Asia/Jakarta" disabled /></Field>
          </div></section>}
          {active === "Branding" && <section className="settings-card"><header><div><h2>Branding</h2><p>Aset identitas yang dipakai pada pengalaman situs.</p></div></header><div className="settings-grid">
            <Field label="URL logo situs"><input type="url" value={draft.branding.logoUrl} onChange={(e) => patch("branding", { logoUrl: e.target.value })} placeholder="https://…" /></Field>
            <Field label="URL favicon"><input type="url" value={draft.branding.faviconUrl} onChange={(e) => patch("branding", { faviconUrl: e.target.value })} placeholder="https://…" /></Field>
            <Field label="Label perusahaan"><input value={draft.branding.companyLabel} onChange={(e) => patch("branding", { companyLabel: e.target.value })} /></Field>
          </div></section>}
          {active === "Kontak" && <section className="settings-stack"><div className="settings-card"><header><div><h2>Kontak utama</h2><p>Nomor WhatsApp ini menjadi sumber tunggal untuk tautan konfirmasi invoice.</p></div></header><div className="settings-grid">
            <Field label="Nomor WhatsApp"><input inputMode="tel" value={draft.contact.whatsappNumber} onChange={(e) => patch("contact", { whatsappNumber: e.target.value })} aria-invalid={!!errors.whatsapp} />{errors.whatsapp && <em>{errors.whatsapp}</em>}</Field>
            <Field label="Email dukungan"><input type="email" value={draft.contact.supportEmail} onChange={(e) => patch("contact", { supportEmail: e.target.value })} aria-invalid={!!errors.supportEmail} />{errors.supportEmail && <em>{errors.supportEmail}</em>}</Field>
            <Field label="Alamat"><textarea rows={3} value={draft.contact.address} onChange={(e) => patch("contact", { address: e.target.value })} /></Field>
            <Field label="URL Instagram"><input type="url" value={draft.contact.instagramUrl} onChange={(e) => patch("contact", { instagramUrl: e.target.value })} placeholder="https://instagram.com/…" /></Field>
          </div></div><div className="settings-card"><header><div><h2>Template WhatsApp invoice</h2><p>Variabel tersedia: {"{invoice_id}, {name}, {program}, {level}, {plan}, {amount}, {target}"}.</p></div></header><Field label="Pesan invoice"><textarea rows={9} value={invoiceTemplate} onChange={(e) => setInvoiceTemplate(e.target.value)} /></Field></div></section>}
          {active === "Integrasi" && <section className="settings-stack">
            <div className="settings-card"><header><div><h2>Google Analytics 4</h2><p>Pelacakan hanya boleh dijalankan setelah pengunjung memberi persetujuan.</p></div><Status value={integrationStatus(draft.integrations.ga4Enabled, ga4Valid)} /></header><label className="settings-toggle"><input type="checkbox" checked={draft.integrations.ga4Enabled} onChange={(e) => patch("integrations", { ga4Enabled: e.target.checked })} /><span>Aktifkan konfigurasi GA4</span></label><Field label="Measurement ID"><input value={draft.integrations.ga4MeasurementId} onChange={(e) => patch("integrations", { ga4MeasurementId: e.target.value })} placeholder="G-XXXXXXXXXX" aria-invalid={!!errors.ga4} />{errors.ga4 && <em>{errors.ga4}</em>}</Field></div>
            <div className="settings-card"><header><div><h2>Meta Pixel</h2><p>Pelacakan hanya boleh dijalankan setelah pengunjung memberi persetujuan.</p></div><Status value={integrationStatus(draft.integrations.metaEnabled, metaValid)} /></header><label className="settings-toggle"><input type="checkbox" checked={draft.integrations.metaEnabled} onChange={(e) => patch("integrations", { metaEnabled: e.target.checked })} /><span>Aktifkan konfigurasi Meta Pixel</span></label><Field label="Pixel ID"><input inputMode="numeric" value={draft.integrations.metaPixelId} onChange={(e) => patch("integrations", { metaPixelId: e.target.value })} aria-invalid={!!errors.meta} />{errors.meta && <em>{errors.meta}</em>}</Field></div>
            <div className="settings-card"><header><div><h2>Rapat & email</h2><p>Penyedia rapat bersifat informasi/manual. Nama dan email hanya menyimpan konfigurasi pengirim.</p></div></header><div className="settings-grid"><Field label="Penyedia rapat"><select value={draft.integrations.meetingProvider} onChange={(e) => patch("integrations", { meetingProvider: e.target.value as AdminSettings["integrations"]["meetingProvider"] })}><option>Manual</option><option>Zoom</option><option>Google Meet</option><option>Lainnya</option></select></Field><Field label="Nama pengirim"><input value={draft.integrations.senderName} onChange={(e) => patch("integrations", { senderName: e.target.value })} /></Field><Field label="Email pengirim"><input type="email" value={draft.integrations.senderEmail} onChange={(e) => patch("integrations", { senderEmail: e.target.value })} aria-invalid={!!errors.senderEmail} />{errors.senderEmail && <em>{errors.senderEmail}</em>}</Field></div></div>
            <div className="settings-card"><header><div><h2>Affiliate</h2><p>Atur status dan aturan komisi operasional.</p></div></header><label className="settings-toggle"><input type="checkbox" checked={affiliate.affiliateEnabled} onChange={(e) => setAffiliate((v) => ({ ...v, affiliateEnabled: e.target.checked }))} /><span>Aktifkan affiliate</span></label><div className="settings-grid"><Field label="Mode komisi"><select value={affiliate.commissionMode} onChange={(e) => setAffiliate((v) => ({ ...v, commissionMode: e.target.value as "Percentage" | "Nominal" }))}><option value="Percentage">Persentase</option><option value="Nominal">Nominal</option></select></Field><Field label="Nilai komisi"><input type="number" min="0" value={affiliate.commissionValue} onChange={(e) => setAffiliate((v) => ({ ...v, commissionValue: Number(e.target.value) }))} />{errors.commissionValue && <em>{errors.commissionValue}</em>}</Field><Field label="Periode validasi (hari)"><input type="number" min="0" value={affiliate.validationPeriodDays} onChange={(e) => setAffiliate((v) => ({ ...v, validationPeriodDays: Number(e.target.value) }))} />{errors.validationPeriodDays && <em>{errors.validationPeriodDays}</em>}</Field></div></div>
          </section>}
          {active === "Privasi" && <section className="settings-card"><header><div><h2>Privasi & persetujuan</h2><p>Tentukan jalur dokumen dan kewajiban persetujuan analitik. Pengaturan ini bukan mesin kebijakan otomatis.</p></div></header><div className="settings-grid"><Field label="Path kebijakan privasi"><input value={draft.privacy.privacyPolicyPath} onChange={(e) => patch("privacy", { privacyPolicyPath: e.target.value })} /></Field><Field label="Path syarat & ketentuan"><input value={draft.privacy.termsPath} onChange={(e) => patch("privacy", { termsPath: e.target.value })} /></Field></div><label className="settings-toggle"><input type="checkbox" checked={draft.privacy.analyticsConsentRequired} onChange={(e) => patch("privacy", { analyticsConsentRequired: e.target.checked })} /><span>Wajibkan persetujuan sebelum pelacakan analitik</span></label></section>}
          {active === "Profil Admin" && <section className="settings-card"><header><div><h2>Profil admin</h2><p>Informasi tampilan akun admin.</p></div></header><div className="settings-grid"><Field label="Nama tampilan"><input value={user?.name ?? ""} readOnly /></Field><Field label="Email"><input type="email" value={user?.email ?? ""} readOnly /></Field><Field label="URL avatar"><input type="url" value="" disabled placeholder="https://…" /></Field></div></section>}
          <footer className="settings-actions"><button className="button button-primary" type="submit" disabled={active === "Profil Admin" || !dirty}>Simpan {active}</button>{message && <p role="status">{message}</p>}</footer>
        </form>
      </AdminTabs>
    </>
  );
}

export function AdminSettingsWorkspace() {
  const searchParams = useSearchParams();
  const queryTab = searchParams.get("tab");
  const initialTab = (tabs.find((t) => t.toLowerCase() === queryTab?.toLowerCase()) ?? "Umum") as Tab;
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const savedSettings = useAdminSettings();
  const business = useBusinessAdminStore();

  return (
    <AdminShell current="/admin/pengaturan-integrasi">
      <main className="admin-page admin-settings-workspace">
        <AdminBreadcrumb items={[{ label: "Admin", href: "/admin" }, { label: "Pengaturan & Integrasi" }]} />
        {isClient ? (
          <AdminSettingsForm
            savedSettings={savedSettings}
            business={business}
            initialTab={initialTab}
          />
        ) : (
          <>
            <AdminPageHeader eyebrow="SISTEM" title="Pengaturan & Integrasi" description="Kelola identitas situs, kontak, integrasi, privasi, dan profil admin." />
            <div className="admin-loading">Memuat Pengaturan &amp; Integrasi…</div>
          </>
        )}
      </main>
    </AdminShell>
  );
}
