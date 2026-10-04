"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AdminShell } from "@/components/admin-shell";
import {
  AdminBreadcrumb,
  AdminConfirmDialog,
  AdminDataTable,
  AdminDialog,
  AdminPageHeader,
  AdminStatusBadge,
  AdminTabs,
} from "@/components/admin-primitives";
import { programCodes, type ProgramCode } from "@/lib/admin-curriculum-store";

// =============================================================================
// STORAGE & TYPES (Simulates admin-website-store / website-store contracts)
// =============================================================================

export const WEBSITE_STORAGE_KEY = "hiru-admin-website:v1";
export const WEBSITE_CHANGE_EVENT = "hiru:website-change";

export type LandingSectionId =
  | "hero"
  | "program"
  | "alur-belajar"
  | "lms"
  | "sensei"
  | "testimoni"
  | "artikel"
  | "placement-cta";

export type LandingSection = {
  id: LandingSectionId;
  name: string;
  badge: string;
  headline: string;
  description: string;
  primaryCtaText?: string;
  primaryCtaUrl?: string;
  secondaryCtaText?: string;
  secondaryCtaUrl?: string;
  isVisible: boolean;
};

export type CampaignStatus = "Draft" | "Published" | "Archived";
export type CampaignPlan = "self_study" | "sensei";

export type Campaign = {
  id: string;
  code: string;
  name: string;
  bannerText: string;
  targetPrograms: ProgramCode[];
  targetPlans: CampaignPlan[];
  discountType: "percentage" | "fixed";
  discountValue: number;
  startDate: string;
  endDate: string;
  status: CampaignStatus;
  ctaText?: string;
  ctaUrl?: string;
};

export type BlockType =
  | "paragraph"
  | "h2"
  | "h3"
  | "bulleted"
  | "numbered"
  | "link"
  | "image";

export type StructuredBlock = {
  id: string;
  type: BlockType;
  content: string;
  url?: string;
  caption?: string;
  alt?: string;
};

export type BlogStatus = "Draft" | "Published" | "Scheduled" | "Archived";

export type BlogPost = {
  id: string;
  slug: string;
  slugManuallyEdited: boolean;
  title: string;
  category: string;
  excerpt: string;
  coverImage: string;
  coverImageAlt: string;
  author: string;
  publishedAt: string;
  status: BlogStatus;
  blocks: StructuredBlock[];
  seo: {
    metaTitle: string;
    metaDescription: string;
    canonicalUrl: string;
    ogImage: string;
  };
};

export type TestimonialStatus = "Draft" | "Approved" | "Published" | "Rejected";

export type Testimonial = {
  id: string;
  name: string;
  membership: string;
  avatarSrc: string;
  initials: string;
  videoSrc: string;
  quote: string;
  hasConsent: boolean;
  isFeatured: boolean;
  sortOrder: number;
  status: TestimonialStatus;
  rejectionReason?: string;
};

export type AnnouncementAudience = "all" | "free" | "lms" | "sensei";
export type AnnouncementPriority = "normal" | "important" | "urgent";
export type AnnouncementStatus = "Draft" | "Published" | "Scheduled" | "Archived";

export type Announcement = {
  id: string;
  title: string;
  content: string;
  audience: AnnouncementAudience;
  priority: AnnouncementPriority;
  startDate: string;
  endDate: string;
  ctaText?: string;
  ctaUrl?: string;
  status: AnnouncementStatus;
};

export type WebsiteStoreData = {
  landingSections: LandingSection[];
  publishedLandingSections: LandingSection[];
  campaigns: Campaign[];
  blogs: BlogPost[];
  testimonials: Testimonial[];
  announcements: Announcement[];
};

const initialLandingSections: LandingSection[] = [
  {
    id: "hero",
    name: "Hero",
    badge: "LIVE CLASS + LMS DALAM SATU ALUR BELAJAR",
    headline: "Belajar Bahasa Jepang Terarah dari Dasar sampai Siap JLPT",
    description:
      "Placement test, pembelajaran, flashcard, latihan, try out, komunitas, dan kelas bersama Sensei tersedia dalam satu pengalaman belajar yang konsisten.",
    primaryCtaText: "Coba Gratis",
    primaryCtaUrl: "/register",
    secondaryCtaText: "Lihat Program",
    secondaryCtaUrl: "#program",
    isVisible: true,
  },
  {
    id: "program",
    name: "Program",
    badge: "INVESTASI BELAJAR",
    headline: "Pilih cara belajar yang paling sesuai",
    description:
      "Pilih cara belajar, lalu tentukan level N5–N1 secara bebas. Harga dan akses mengikuti konfigurasi sistem.",
    isVisible: true,
  },
  {
    id: "alur-belajar",
    name: "Alur Belajar",
    badge: "ALUR BELAJAR",
    headline: "Belajar Terarah dari Menentukan Level hingga Mencapai Target",
    description:
      "Mulai dari mengetahui kemampuan awal, mempelajari materi secara bertahap, hingga mengukur kesiapan menghadapi JLPT—semuanya tersedia dalam satu alur belajar yang terstruktur.",
    isVisible: true,
  },
  {
    id: "lms",
    name: "LMS",
    badge: "FITUR LMS",
    headline: "Bukan Hanya Belajar Saat Zoom",
    description:
      "Lanjutkan belajar melalui materi, rekaman, latihan, dan evaluasi yang tersimpan di LMS Hiru Academy.",
    isVisible: true,
  },
  {
    id: "sensei",
    name: "Sensei",
    badge: "PENGAJAR TERBAIK",
    headline: "Belajar Bersama Sensei Berpengalaman",
    description:
      "Sensei bersertifikat JLPT N1/N2 dengan pengalaman mengajar dan studi di Jepang siap membimbingmu.",
    primaryCtaText: "Lihat Semua Sensei",
    primaryCtaUrl: "/sensei",
    isVisible: true,
  },
  {
    id: "testimoni",
    name: "Testimoni",
    badge: "CERITA PEMBELAJAR",
    headline: "Cerita dari Pembelajar Hiru Academy",
    description:
      "Pengalaman nyata mereka yang telah belajar dan bertumbuh bersama ekosistem Hiru Academy.",
    primaryCtaText: "Lihat lebih banyak",
    primaryCtaUrl: "/testimoni",
    isVisible: true,
  },
  {
    id: "artikel",
    name: "Artikel",
    badge: "INSIGHT & TIPS",
    headline: "Panduan Belajar & Wawasan Seputar Jepang",
    description:
      "Kumpulan artikel tips belajar, grammar, persiapan JLPT, dan informasi karir di Jepang.",
    primaryCtaText: "Lihat Semua Artikel",
    primaryCtaUrl: "/blog",
    isVisible: true,
  },
  {
    id: "placement-cta",
    name: "Placement CTA",
    badge: "MULAI SEKARANG",
    headline: "Belum tahu harus mulai dari level mana?",
    description:
      "Belum yakin levelmu? Gunakan Placement Test. Sudah punya target? Coba Chapter 1 gratis pada level pilihanmu.",
    primaryCtaText: "Mulai Sekarang",
    primaryCtaUrl: "/placement",
    isVisible: true,
  },
];

const initialCampaigns: Campaign[] = [
  {
    id: "cmp-01",
    code: "HIRUJAPAN2026",
    name: "Promo Semangat Belajar JLPT 2026",
    bannerText: "Diskon 20% untuk paket Belajar Mandiri dan Bersama Sensei level N5!",
    targetPrograms: ["N5"],
    targetPlans: ["self_study", "sensei"],
    discountType: "percentage",
    discountValue: 20,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    status: "Published",
    ctaText: "Klaim Diskon",
    ctaUrl: "/#program",
  },
];

const initialBlogs: BlogPost[] = [
  {
    id: "blog-01",
    slug: "strategi-rutinitas-belajar-n4",
    slugManuallyEdited: true,
    title: "Strategi membangun rutinitas belajar N4 yang realistis",
    category: "Tips Belajar",
    excerpt:
      "Susun ritme belajar mingguan dengan video, modul, flashcard, latihan, dan checkpoint tanpa kehilangan fokus.",
    coverImage: "",
    coverImageAlt: "Ilustrasi alur belajar mandiri Hiru Academy",
    author: "Hiru Academic Team",
    publishedAt: "2026-08-20",
    status: "Published",
    blocks: [
      {
        id: "b1",
        type: "paragraph",
        content:
          "Belajar untuk persiapan JLPT N4 membutuhkan konsistensi harian daripada belajar maraton dalam satu waktu. Luangkan waktu 30-45 menit per hari dengan alur terarah.",
      },
      {
        id: "b2",
        type: "h2",
        content: "1. Bagi Sesi Menjadi Tiga Blok Utama",
      },
      {
        id: "b3",
        type: "bulleted",
        content:
          "Pahami pola kalimat baru (Bunpou) lewat video singkat.\nLatih kosakata dan kanji menggunakan fitur flashcard repetisi berjarak.\nKerjakan latihan singkat di akhir chapter untuk menguji pemahaman.",
      },
      {
        id: "b4",
        type: "h2",
        content: "2. Evaluasi Rutin Melalui Try Out",
      },
      {
        id: "b5",
        type: "paragraph",
        content:
          "Setiap menyelesaikan satu tingkat capaian, uji kesiapanmu dengan try out berkala agar terbiasa dengan batasan waktu ujian sesungguhnya.",
      },
    ],
    seo: {
      metaTitle: "Strategi Membangun Rutinitas Belajar N4 | Hiru Academy",
      metaDescription:
        "Panduan praktis menyusun jadwal belajar JLPT N4 dengan efisien menggunakan metode bertahap dan materi terstruktur.",
      canonicalUrl: "https://hiruacademy.com/blog/strategi-rutinitas-belajar-n4",
      ogImage: "/showcase/dashboard-showcase.png",
    },
  },
  {
    id: "blog-02",
    slug: "cara-memahami-pola-kalimat-tanpa-menghafal",
    slugManuallyEdited: false,
    title: "Cara memahami pola kalimat tanpa menghafal berlebihan",
    category: "Grammar / Bunpou",
    excerpt: "Gunakan konteks, ilustrasi, dan latihan singkat untuk memperkuat pemahaman.",
    coverImage: "",
    coverImageAlt: "",
    author: "Sensei Kenji",
    publishedAt: "2026-08-18",
    status: "Published",
    blocks: [
      {
        id: "b2-1",
        type: "paragraph",
        content:
          "Pola kalimat bahasa Jepang memiliki logika rasa bahasa yang konsisten jika dipelajari melalui contoh kalimat utuh daripada menghafal rumus semata.",
      },
    ],
    seo: {
      metaTitle: "Cara Memahami Pola Kalimat Tanpa Menghafal | Hiru Academy",
      metaDescription: "Pelajari grammar bahasa Jepang secara natural melalui pemahaman konteks dan latihan terapan.",
      canonicalUrl: "https://hiruacademy.com/blog/cara-memahami-pola-kalimat-tanpa-menghafal",
      ogImage: "",
    },
  },
];

const initialTestimonials: Testimonial[] = [
  {
    id: "testi-01",
    name: "Rina",
    membership: "Free Member",
    avatarSrc: "/testimonials/remaja3.png",
    initials: "RI",
    videoSrc: "",
    quote: "Journey membantu saya tahu apa yang harus dipelajari setelah menyelesaikan satu materi.",
    hasConsent: true,
    isFeatured: true,
    sortOrder: 1,
    status: "Published",
  },
  {
    id: "testi-02",
    name: "Budi T.",
    membership: "Program SSW",
    avatarSrc: "/testimonials/remaja1.png",
    initials: "BT",
    videoSrc: "",
    quote:
      "Materi SSW sangat relevan dengan kebutuhan kerja di Jepang. Simulasi interviewnya membuat saya jauh lebih percaya diri saat wawancara dengan perusahaan Jepang.",
    hasConsent: true,
    isFeatured: true,
    sortOrder: 2,
    status: "Published",
  },
  {
    id: "testi-03",
    name: "Ayu",
    membership: "Belajar dengan Sensei",
    avatarSrc: "/testimonials/remaja2.png",
    initials: "AY",
    videoSrc: "",
    quote: "Jadwal, replay, dan learning journey terasa menyatu dalam satu alur belajar.",
    hasConsent: true,
    isFeatured: true,
    sortOrder: 3,
    status: "Published",
  },
  {
    id: "testi-04",
    name: "Dimas Anggara",
    membership: "Belajar Mandiri (N5)",
    avatarSrc: "",
    initials: "DA",
    videoSrc: "",
    quote: "Penjelasan tata bahasanya runtut dan fitur flashcard sangat menghemat waktu saat menghafal kanji dasar.",
    hasConsent: false,
    isFeatured: false,
    sortOrder: 4,
    status: "Draft",
  },
];

const initialAnnouncements: Announcement[] = [
  {
    id: "ann-01",
    title: "Pendaftaran Try Out Akbar JLPT Periode Juli Telah Dibuka",
    content:
      "Simulasi lengkap format ujian resmi dengan penilaian instan dan analisis butir soal. Seluruh siswa mandiri dan kelas sensei dapat mendaftar langsung.",
    audience: "all",
    priority: "important",
    startDate: "2026-05-01",
    endDate: "2026-07-15",
    ctaText: "Daftar Try Out",
    ctaUrl: "/tryout",
    status: "Published",
  },
  {
    id: "ann-02",
    title: "Pembaruan Jadwal Sesi Live Zoom Bersama Sensei N4",
    content:
      "Mulai pekan depan, sesi tanya jawab mingguan N4 dialihkan ke hari Sabtu pukul 19.30 WIB. Pastikan memeriksa tab Jadwal di akun masing-masing.",
    audience: "sensei",
    priority: "urgent",
    startDate: "2026-06-01",
    endDate: "2026-08-01",
    ctaText: "Periksa Jadwal",
    ctaUrl: "/schedule?membership=sensei",
    status: "Published",
  },
];

const initialStore: WebsiteStoreData = {
  landingSections: initialLandingSections,
  publishedLandingSections: initialLandingSections,
  campaigns: initialCampaigns,
  blogs: initialBlogs,
  testimonials: initialTestimonials,
  announcements: initialAnnouncements,
};

function loadStore(): WebsiteStoreData {
  if (typeof window === "undefined") {
    return initialStore;
  }
  try {
    const raw = localStorage.getItem(WEBSITE_STORAGE_KEY);
    if (!raw) {
      const fallback: WebsiteStoreData = initialStore;
      localStorage.setItem(WEBSITE_STORAGE_KEY, JSON.stringify(fallback));
      return fallback;
    }
    const parsed = JSON.parse(raw);
    const sanitizeSections = (sections: LandingSection[]) =>
      sections.map((s) => ({
        ...s,
        description: s.description ? s.description.replace(/learning journey/gi, "pembelajaran") : s.description,
      }));
    return {
      landingSections: Array.isArray(parsed.landingSections)
        ? sanitizeSections(parsed.landingSections)
        : initialLandingSections,
      publishedLandingSections: Array.isArray(parsed.publishedLandingSections)
        ? sanitizeSections(parsed.publishedLandingSections)
        : initialLandingSections,
      campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns : initialCampaigns,
      blogs: Array.isArray(parsed.blogs)
        ? parsed.blogs.map((b: BlogPost) =>
            b.coverImage === "/showcase/dashboard-showcase.png" ? { ...b, coverImage: "" } : b
          )
        : initialBlogs,
      testimonials: Array.isArray(parsed.testimonials)
        ? parsed.testimonials
        : initialTestimonials,
      announcements: Array.isArray(parsed.announcements)
        ? parsed.announcements
        : initialAnnouncements,
    };
  } catch {
    return initialStore;
  }
}

function saveStore(data: WebsiteStoreData) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WEBSITE_STORAGE_KEY, JSON.stringify(data));
    window.dispatchEvent(new Event(WEBSITE_CHANGE_EVENT));
  } catch (err) {
    console.error("Gagal menyimpan ke localStorage:", err);
  }
}

let cachedRaw: string | null | undefined;
let cachedStore: WebsiteStoreData = initialStore;

function getStoreSnapshot(): WebsiteStoreData {
  if (typeof window === "undefined") return initialStore;
  const raw = localStorage.getItem(WEBSITE_STORAGE_KEY);
  if (raw !== cachedRaw) {
    cachedStore = loadStore();
    cachedRaw = localStorage.getItem(WEBSITE_STORAGE_KEY);
  }
  return cachedStore;
}

function subscribeWebsiteStore(callback: () => void) {
  window.addEventListener(WEBSITE_CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(WEBSITE_CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function useWebsiteStore() {
  const store = useSyncExternalStore(subscribeWebsiteStore, getStoreSnapshot, () => initialStore);

  const refresh = useCallback(() => {
    cachedRaw = undefined;
    window.dispatchEvent(new Event(WEBSITE_CHANGE_EVENT));
  }, []);

  const update = useCallback(
    (updater: (prev: WebsiteStoreData) => WebsiteStoreData) => {
      const current = getStoreSnapshot();
      const next = updater(current);
      saveStore(next);
      cachedRaw = undefined;
    },
    []
  );

  return { store, update, refresh };
}

// =============================================================================
// SHARED INTERNAL LIFECYCLE, DIRTY & VALIDATION HELPERS
// =============================================================================

function useDirtyGuard(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);
}

function ValidationAlert({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <div className="cms-validation-alert" role="alert">
      <strong>Harap perbaiki kesalahan berikut sebelum menyimpan:</strong>
      <ul>
        {errors.map((err, idx) => (
          <li key={idx}>{err}</li>
        ))}
      </ul>
    </div>
  );
}

function SaveToast({ message, open }: { message: string; open: boolean }) {
  if (!open) return null;
  return (
    <div className="cms-save-toast" role="status">
      ✓ {message}
    </div>
  );
}

function DirtyBadge({ isDirty }: { isDirty: boolean }) {
  if (!isDirty) return null;
  return (
    <span className="cms-dirty-badge" title="Terdapat perubahan belum disimpan">
      ● Ada Perubahan
    </span>
  );
}

function DiscardConfirmModal({
  open,
  onDiscard,
  onKeep,
}: {
  open: boolean;
  onDiscard: () => void;
  onKeep: () => void;
}) {
  return (
    <AdminConfirmDialog
      open={open}
      title="Buang Perubahan?"
      close={onKeep}
      actions={
        <div className="table-action-buttons">
          <button type="button" className="button button-secondary" onClick={onKeep}>
            Tetap Mengedit
          </button>
          <button type="button" className="button button-primary" onClick={onDiscard}>
            Ya, Buang Perubahan
          </button>
        </div>
      }
    >
      <p>
        Terdapat perubahan yang belum disimpan. Jika Anda meninggalkan halaman ini,
        perubahan tersebut akan hilang.
      </p>
    </AdminConfirmDialog>
  );
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// =============================================================================
// SURFACE 1: LANDING PAGE CMS
// =============================================================================

export function LandingPageStudio() {
  useWebsiteStore();
  const [activeTab, setActiveTab] = useState<string>("Bagian Halaman");

  return (
    <AdminShell current="/admin/landing-page">
      <main className="admin-page website-studio-page">
        <AdminBreadcrumb
          items={[
            { label: "Admin", href: "/admin" },
            { label: "Landing Page" },
          ]}
        />
        <AdminPageHeader
          eyebrow="ADMIN • WEBSITE"
          title="Pengelolaan Landing Page"
          description="Atur susunan dan tampilan teks bagian halaman utama, visibilitas publik, serta kampanye promo."
        />

        <AdminTabs
          label="Menu Landing Page"
          tabs={["Bagian Halaman", "Kampanye & Promo"]}
          active={activeTab}
          onChange={setActiveTab}
        >
           {activeTab === "Bagian Halaman" && <><p role="status">Copy dan susunan Landing Page dikunci. Kelola media melalui Showcase, Sensei, dan Testimoni.</p><fieldset disabled style={{ border: 0, padding: 0, minWidth: 0 }}><LandingSectionsEditor /></fieldset></>}
           {activeTab === "Kampanye & Promo" && <><Link className="button button-primary" href="/admin/program-harga">Program &amp; Harga</Link><p role="status">Kelola promo melalui Program &amp; Harga. Builder kampanye ini belum didukung API.</p><fieldset disabled style={{ border: 0, padding: 0, minWidth: 0 }}><CampaignHub /></fieldset></>}
        </AdminTabs>
      </main>
    </AdminShell>
  );
}

function LandingSectionsEditor() {
  const { store, update } = useWebsiteStore();
  const [draftSections, setDraftSections] = useState<LandingSection[] | null>(null);
  const sections = draftSections ?? store.landingSections;
  const [selectedId, setSelectedId] = useState<LandingSectionId>("hero");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);

  const activeSection = sections.find((s) => s.id === selectedId) ?? sections[0];

  const isDirty = useMemo(() => {
    if (!draftSections) return false;
    return JSON.stringify(draftSections) !== JSON.stringify(store.landingSections);
  }, [draftSections, store.landingSections]);

  useDirtyGuard(isDirty);

  function patchActive(field: Partial<LandingSection>) {
    setDraftSections((prev) => {
      const current = prev ?? store.landingSections;
      return current.map((sec) =>
        sec.id === activeSection.id ? { ...sec, ...field } : sec
      );
    });
  }

  function handleSaveDraft() {
    update((prev) => ({
      ...prev,
      landingSections: sections,
    }));
    setDraftSections(null);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  }

  function handlePublish() {
    update((prev) => ({
      ...prev,
      landingSections: sections,
      publishedLandingSections: sections,
    }));
    setDraftSections(null);
    setPublishSuccess(true);
    setTimeout(() => setPublishSuccess(false), 2500);
  }

  return (
    <div className="cms-workspace-wrap">
      <SaveToast message="Draf bagian landing page berhasil disimpan." open={saveSuccess} />
      <SaveToast message="Landing page berhasil diterbitkan ke publik!" open={publishSuccess} />

      <div className="cms-actions-bar">
        <div className="cms-actions-left">
          <DirtyBadge isDirty={isDirty} />
          <span className="field-hint">
            Perubahan tampilan dan visibilitas di sini hanya memengaruhi presentasi halaman utama.
          </span>
        </div>
        <div className="cms-actions-right">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setPreviewOpen(true)}
          >
            Pratinjau Halaman
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={handleSaveDraft}
          >
            Simpan Draf
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={handlePublish}
          >
            Terbitkan Perubahan
          </button>
        </div>
      </div>

      <div className="cms-split-grid">
        {/* Fixed Section Navigator */}
        <aside className="cms-section-navigator">
          <header className="cms-nav-header">
            <h3>Navigasi Bagian</h3>
            <span className="field-hint">8 bagian utama</span>
          </header>
          <nav aria-label="Daftar Bagian Landing Page">
            {sections.map((sec, idx) => (
              <button
                key={sec.id}
                type="button"
                className={`cms-nav-item ${sec.id === selectedId ? "active" : ""}`}
                onClick={() => setSelectedId(sec.id)}
              >
                <span className="cms-nav-index">{idx + 1}</span>
                <div className="cms-nav-info">
                  <strong>{sec.name}</strong>
                  <small>{sec.headline.slice(0, 32)}…</small>
                </div>
                <span
                  className={`cms-pill ${sec.isVisible ? "cms-pill-visible" : "cms-pill-hidden"}`}
                >
                  {sec.isVisible ? "Aktif" : "Sembunyi"}
                </span>
              </button>
            ))}
          </nav>
        </aside>

        {/* Section Presentation Editor */}
        <section className="cms-editor-card">
          <header className="cms-editor-header">
            <div>
              <h2>Edit Bagian: {activeSection.name}</h2>
              <p className="field-hint">
                Sesuaikan teks, tautan tombol, dan status visibilitas bagian ini.
              </p>
            </div>
            <label className="toggle-label cms-vis-toggle">
              <input
                type="checkbox"
                checked={activeSection.isVisible}
                onChange={(e) => patchActive({ isVisible: e.target.checked })}
              />
              <span>Tampilkan di Halaman Utama</span>
            </label>
          </header>

          <div className="cms-form-body">
            <label>
              <span>Label / Kicker (Eyebrow)</span>
              <input
                type="text"
                value={activeSection.badge}
                onChange={(e) => patchActive({ badge: e.target.value })}
                placeholder="Contoh: LIVE CLASS + LMS..."
              />
            </label>

            <label>
              <span>Judul Utama (Headline)</span>
              <input
                type="text"
                value={activeSection.headline}
                onChange={(e) => patchActive({ headline: e.target.value })}
                placeholder="Judul bagian..."
              />
            </label>

            <label>
              <span>Deskripsi / Penjelasan Singkat</span>
              <textarea
                rows={3}
                value={activeSection.description}
                onChange={(e) => patchActive({ description: e.target.value })}
                placeholder="Penjelasan ringkas bagian ini..."
              />
            </label>

            {(activeSection.primaryCtaText !== undefined ||
              activeSection.id === "hero" ||
              activeSection.id === "sensei" ||
              activeSection.id === "testimoni" ||
              activeSection.id === "artikel" ||
              activeSection.id === "placement-cta") && (
              <div className="form-grid">
                <label>
                  <span>Teks Tombol CTA</span>
                  <input
                    type="text"
                    value={activeSection.primaryCtaText ?? ""}
                    onChange={(e) => patchActive({ primaryCtaText: e.target.value })}
                    placeholder="Contoh: Coba Gratis"
                  />
                </label>
                <label>
                  <span>Tautan URL CTA</span>
                  <input
                    type="text"
                    value={activeSection.primaryCtaUrl ?? ""}
                    onChange={(e) => patchActive({ primaryCtaUrl: e.target.value })}
                    placeholder="Contoh: /register atau /placement"
                  />
                </label>
              </div>
            )}

            {activeSection.id === "hero" && (
              <div className="form-grid">
                <label>
                  <span>Teks Tombol Sekunder</span>
                  <input
                    type="text"
                    value={activeSection.secondaryCtaText ?? ""}
                    onChange={(e) => patchActive({ secondaryCtaText: e.target.value })}
                    placeholder="Contoh: Lihat Program"
                  />
                </label>
                <label>
                  <span>Tautan URL Sekunder</span>
                  <input
                    type="text"
                    value={activeSection.secondaryCtaUrl ?? ""}
                    onChange={(e) => patchActive({ secondaryCtaUrl: e.target.value })}
                    placeholder="Contoh: #program"
                  />
                </label>
              </div>
            )}
          </div>

          {/* Section Live Card Preview */}
          <div className="cms-preview-box">
            <h4>Pratinjau Tampilan Bagian Ini</h4>
            <div className="cms-mock-section">
              {activeSection.badge && (
                <span className="eyebrow" style={{ display: "inline-block", marginBottom: 12 }}>
                  {activeSection.badge}
                </span>
              )}
              <h2>{activeSection.headline || "(Judul Kosong)"}</h2>
              <p>{activeSection.description || "(Deskripsi Kosong)"}</p>
              <div className="cms-mock-buttons">
                {activeSection.primaryCtaText && (
                  <span className="button button-primary">{activeSection.primaryCtaText}</span>
                )}
                {activeSection.secondaryCtaText && (
                  <span className="button button-dark">{activeSection.secondaryCtaText}</span>
                )}
              </div>
              {!activeSection.isVisible && (
                <div className="cms-hidden-badge-notice">
                  Bagian ini saat ini disetel SEMBUNYI dan tidak akan tampak di web publik.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Full Page Admin Dialog Preview */}
      <AdminDialog
        open={previewOpen}
        title="Pratinjau Urutan Landing Page"
        close={() => setPreviewOpen(false)}
      >
        <div className="cms-dialog-preview-list">
          <p className="field-hint">
            Berikut urutan seluruh 8 bagian halaman utama sesuai konfigurasi aktif saat ini:
          </p>
          {sections.map((sec, i) => (
            <article
              key={sec.id}
              className={`cms-dialog-preview-item ${!sec.isVisible ? "dimmed" : ""}`}
            >
              <div className="cms-dialog-preview-head">
                <span className="program-code-badge">
                  {i + 1}. {sec.name}
                </span>
                <AdminStatusBadge status={sec.isVisible ? "active" : "draft"} />
              </div>
              <h4>{sec.headline}</h4>
              <p>{sec.description}</p>
              {sec.primaryCtaText && (
                <span className="field-hint">Tombol: {sec.primaryCtaText} ({sec.primaryCtaUrl})</span>
              )}
            </article>
          ))}
        </div>
      </AdminDialog>
    </div>
  );
}

function CampaignHub() {
  const { store, update } = useWebsiteStore();
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);
  const [previewCampaign, setPreviewCampaign] = useState<Campaign | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const filtered = store.campaigns.filter((c: Campaign) => {
    const matchesQ =
      !query ||
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      c.code.toLowerCase().includes(query.toLowerCase());
    const matchesS = !statusFilter || c.status === statusFilter;
    return matchesQ && matchesS;
  });

  function handleCreateNew() {
    const newCamp: Campaign = {
      id: `cmp-${Date.now()}`,
      code: "PROMO" + Math.floor(100 + Math.random() * 900),
      name: "Kampanye Promo Baru",
      bannerText: "Dapatkan penawaran belajar bahasa Jepang terbaik!",
      targetPrograms: ["N5", "N4"],
      targetPlans: ["self_study", "sensei"],
      discountType: "percentage",
      discountValue: 15,
      startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      status: "Draft",
      ctaText: "Lihat Promo",
      ctaUrl: "/#program",
    };
    setEditingCampaign(newCamp);
  }

  function handleSave(campaignToSave: Campaign) {
    update((prev) => {
      const exists = prev.campaigns.some((c: Campaign) => c.id === campaignToSave.id);
      return {
        ...prev,
        campaigns: exists
          ? prev.campaigns.map((c: Campaign) => (c.id === campaignToSave.id ? campaignToSave : c))
          : [campaignToSave, ...prev.campaigns],
      };
    });
    setEditingCampaign(null);
    const isPub = campaignToSave.status === "Published";
    setToastMessage(isPub ? "Kampanye berhasil diterbitkan ke publik!" : "Draf kampanye berhasil disimpan.");
    setTimeout(() => setToastMessage(null), 2500);
  }

  function handleDelete() {
    if (!deleteTarget) return;
    update((prev) => ({
      ...prev,
      campaigns: prev.campaigns.filter((c: Campaign) => c.id !== deleteTarget.id),
    }));
    setDeleteTarget(null);
  }

  if (editingCampaign) {
    return (
      <CampaignEditor
        campaign={editingCampaign}
        onSave={handleSave}
        onCancel={() => setEditingCampaign(null)}
      />
    );
  }

  return (
    <div className="cms-campaign-hub">
      <SaveToast message={toastMessage || ""} open={!!toastMessage} />
      <div className="cms-header-bar">
        <div>
          <h3>Daftar Kampanye Promo</h3>
          <p className="field-hint">
            Kelola kode diskon, banner pengumuman promo, dan batas masa berlaku kampanye.
          </p>
        </div>
        <button
          type="button"
          className="button button-primary"
          onClick={handleCreateNew}
        >
          + Buat Kampanye Baru
        </button>
      </div>

      <div className="program-pricing-filters">
        <label>
          <span>Cari Nama / Kode</span>
          <input
            type="search"
            placeholder="Cari kampanye..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          <span>Status</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Semua Status</option>
            <option value="Draft">Draft</option>
            <option value="Published">Published</option>
            <option value="Archived">Archived</option>
          </select>
        </label>
        {(query || statusFilter) && (
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              setQuery("");
              setStatusFilter("");
            }}
          >
            Reset
          </button>
        )}
      </div>

      <AdminDataTable<Campaign>
        caption="Tabel Kampanye Promo"
        rows={filtered}
        rowKey={(row: Campaign) => row.id}
        empty="Belum ada kampanye promo yang tersimpan."
        columns={[
          {
            key: "code",
            header: "Kode Promo",
            cell: (row: Campaign) => <span className="program-code-badge">{row.code}</span>,
          },
          {
            key: "name",
            header: "Nama Kampanye",
            cell: (row: Campaign) => (
              <div>
                <strong>{row.name}</strong>
                <div className="field-hint">{row.bannerText.slice(0, 48)}…</div>
              </div>
            ),
          },
          {
            key: "discount",
            header: "Nilai Diskon",
            cell: (row: Campaign) => (
              <span>
                {row.discountType === "percentage"
                  ? `${row.discountValue}%`
                  : `Rp ${row.discountValue.toLocaleString("id-ID")}`}
              </span>
            ),
          },
          {
            key: "period",
            header: "Masa Berlaku",
            cell: (row: Campaign) => (
              <small>
                {row.startDate} s/d {row.endDate}
              </small>
            ),
          },
          {
            key: "status",
            header: "Status",
            cell: (row: Campaign) => <AdminStatusBadge status={row.status} />,
          },
        ]}
        actions={{
          header: "Tindakan",
          cell: (row: Campaign) => (
            <div className="table-action-buttons">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setPreviewCampaign(row)}
              >
                Pratinjau
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setEditingCampaign(row)}
              >
                Ubah
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setDeleteTarget(row)}
              >
                Hapus
              </button>
            </div>
          ),
        }}
      />

      {/* Delete confirmation dialog */}
      <AdminConfirmDialog
        open={Boolean(deleteTarget)}
        title="Hapus Kampanye Promo?"
        close={() => setDeleteTarget(null)}
        actions={
          <div className="table-action-buttons">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setDeleteTarget(null)}
            >
              Batal
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={handleDelete}
            >
              Hapus
            </button>
          </div>
        }
      >
        <p>
          Yakin ingin menghapus kampanye <strong>{deleteTarget?.name}</strong>?
          Tindakan ini tidak dapat dibatalkan.
        </p>
      </AdminConfirmDialog>

      {/* Campaign Banner Preview Dialog */}
      <AdminDialog
        open={Boolean(previewCampaign)}
        title="Pratinjau Banner Kampanye Promo"
        close={() => setPreviewCampaign(null)}
      >
        {previewCampaign && (
          <div className="cms-campaign-preview-card">
            <div className="cms-campaign-preview-banner">
              <span className="cms-campaign-tag">PROMO SPESIAL</span>
              <h4>{previewCampaign.bannerText}</h4>
              <p>
                Gunakan kode kupon: <strong>{previewCampaign.code}</strong> saat checkout.
              </p>
              <small>
                Berlaku untuk program:{" "}
                {previewCampaign.targetPrograms.join(", ") || "Semua"} • Paket:{" "}
                {previewCampaign.targetPlans
                  .map((p) => (p === "self_study" ? "Mandiri" : "Sensei"))
                  .join(", ")}
              </small>
            </div>
          </div>
        )}
      </AdminDialog>
    </div>
  );
}

function CampaignEditor({
  campaign,
  onSave,
  onCancel,
}: {
  campaign: Campaign;
  onSave: (c: Campaign) => void;
  onCancel: () => void;
}) {
  const [data, setData] = useState<Campaign>(campaign);
  const [errors, setErrors] = useState<string[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);

  function patch(field: Partial<Campaign>) {
    setData((prev) => ({ ...prev, ...field }));
  }

  function toggleProgram(code: ProgramCode) {
    setData((prev) => {
      const exists = prev.targetPrograms.includes(code);
      return {
        ...prev,
        targetPrograms: exists
          ? prev.targetPrograms.filter((c) => c !== code)
          : [...prev.targetPrograms, code],
      };
    });
  }

  function togglePlan(plan: CampaignPlan) {
    setData((prev) => {
      const exists = prev.targetPlans.includes(plan);
      return {
        ...prev,
        targetPlans: exists
          ? prev.targetPlans.filter((p) => p !== plan)
          : [...prev.targetPlans, plan],
      };
    });
  }

  function validate(): boolean {
    const errs: string[] = [];
    if (!data.name.trim()) errs.push("Nama kampanye wajib diisi.");
    if (!data.code.trim()) errs.push("Kode promo wajib diisi.");
    if (!data.bannerText.trim()) errs.push("Teks banner pengumuman wajib diisi.");
    if (data.discountValue <= 0) errs.push("Nilai diskon harus lebih besar dari 0.");
    if (data.discountType === "percentage" && data.discountValue > 100) {
      errs.push("Diskon persentase tidak boleh lebih dari 100%.");
    }
    if (data.startDate && data.endDate && data.endDate < data.startDate) {
      errs.push("Tanggal selesai tidak boleh lebih awal dari tanggal mulai.");
    }
    if (data.targetPrograms.length === 0) {
      errs.push("Pilih minimal satu program target.");
    }
    if (data.targetPlans.length === 0) {
      errs.push("Pilih minimal satu paket belajar (Mandiri atau Sensei).");
    }
    setErrors(errs);
    return errs.length === 0;
  }

  function handleSaveClick(status: CampaignStatus) {
    const updated = { ...data, status };
    if (!validate()) return;
    onSave(updated);
  }

  return (
    <div className="cms-campaign-editor-wrap">
      <div className="editor-top-nav">
        <button type="button" className="back-link" onClick={onCancel}>
          ← Kembali ke Daftar Kampanye
        </button>
        <div className="publication-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setPreviewOpen(true)}
          >
            Pratinjau
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => handleSaveClick("Draft")}
          >
            Simpan Draf
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => handleSaveClick("Published")}
          >
            Terbitkan Kampanye
          </button>
        </div>
      </div>

      <ValidationAlert errors={errors} />

      <section className="program-form-card">
        <h3>Detail Kampanye Promo</h3>

        <div className="form-grid">
          <label>
            <span>Nama Kampanye</span>
            <input
              type="text"
              value={data.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="Contoh: Promo Ramadhan 2026"
            />
          </label>
          <label>
            <span>Kode Promo (Kupon)</span>
            <input
              type="text"
              value={data.code}
              onChange={(e) => patch({ code: e.target.value.toUpperCase().replace(/\s/g, "") })}
              placeholder="Contoh: HIRURAMADHAN"
            />
          </label>
        </div>

        <label>
          <span>Teks Banner Pengumuman Promo</span>
          <textarea
            rows={2}
            value={data.bannerText}
            onChange={(e) => patch({ bannerText: e.target.value })}
            placeholder="Teks yang akan muncul pada bar promosi website..."
          />
        </label>

        <div className="form-grid">
          <label>
            <span>Tipe Diskon</span>
            <select
              value={data.discountType}
              onChange={(e) => patch({ discountType: e.target.value as "percentage" | "fixed" })}
            >
              <option value="percentage">Persentase (%)</option>
              <option value="fixed">Nominal Tetap (Rp)</option>
            </select>
          </label>
          <label>
            <span>
              Nilai Diskon {data.discountType === "percentage" ? "(%)" : "(Rupiah)"}
            </span>
            <input
              type="number"
              min={1}
              max={data.discountType === "percentage" ? 100 : undefined}
              value={data.discountValue}
              onChange={(e) => patch({ discountValue: Number(e.target.value) })}
            />
          </label>
        </div>

        <div className="form-grid">
          <label>
            <span>Tanggal Mulai</span>
            <input
              type="date"
              value={data.startDate}
              onChange={(e) => patch({ startDate: e.target.value })}
            />
          </label>
          <label>
            <span>Tanggal Selesai</span>
            <input
              type="date"
              value={data.endDate}
              onChange={(e) => patch({ endDate: e.target.value })}
            />
          </label>
        </div>

        <div className="cms-picker-group">
          <span className="cms-picker-label">Target Program (Batch 3 Codes):</span>
          <div className="cms-badges-select">
            {programCodes.map((code) => {
              const active = data.targetPrograms.includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  className={`cms-badge-btn ${active ? "active" : ""}`}
                  onClick={() => toggleProgram(code)}
                >
                  {code} {active && "✓"}
                </button>
              );
            })}
          </div>
        </div>

        <div className="cms-picker-group">
          <span className="cms-picker-label">Target Paket Belajar:</span>
          <div className="cms-badges-select">
            {[
              { id: "self_study" as CampaignPlan, label: "Belajar Mandiri (LMS)" },
              { id: "sensei" as CampaignPlan, label: "Belajar dengan Sensei" },
            ].map((plan) => {
              const active = data.targetPlans.includes(plan.id);
              return (
                <button
                  key={plan.id}
                  type="button"
                  className={`cms-badge-btn ${active ? "active" : ""}`}
                  onClick={() => togglePlan(plan.id)}
                >
                  {plan.label} {active && "✓"}
                </button>
              );
            })}
          </div>
        </div>

        <div className="form-grid">
          <label>
            <span>Teks Tombol CTA Banner</span>
            <input
              type="text"
              value={data.ctaText ?? ""}
              onChange={(e) => patch({ ctaText: e.target.value })}
              placeholder="Contoh: Klaim Diskon Sekarang"
            />
          </label>
          <label>
            <span>Tautan URL CTA</span>
            <input
              type="text"
              value={data.ctaUrl ?? ""}
              onChange={(e) => patch({ ctaUrl: e.target.value })}
              placeholder="Contoh: /#program"
            />
          </label>
        </div>
      </section>

      <AdminDialog
        open={previewOpen}
        title="Pratinjau Banner Kampanye"
        close={() => setPreviewOpen(false)}
      >
        <div className="cms-campaign-preview-card">
          <div className="cms-campaign-preview-banner">
            <span className="cms-campaign-tag">PROMO KAMPANYE</span>
            <h4>{data.bannerText || "(Teks banner kosong)"}</h4>
            <p>
              Kode Promo: <strong>{data.code || "KODE"}</strong> (
              {data.discountType === "percentage"
                ? `Diskon ${data.discountValue}%`
                : `Potongan Rp ${data.discountValue.toLocaleString("id-ID")}`}
              )
            </p>
            <small>
              Masa aktif: {data.startDate} s/d {data.endDate}
            </small>
          </div>
        </div>
      </AdminDialog>
    </div>
  );
}

// =============================================================================
// SURFACE 2: BLOG & SEO CMS
// =============================================================================

export function BlogSeoStudio() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const action = searchParams.get("action");
  const isEditing = Boolean(id || action === "new");

  if (isEditing) {
    return <BlogEditor key={id ?? "new"} id={id} />;
  }

  return <BlogHub />;
}

function BlogHub() {
  const { store, update } = useWebsiteStore();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<BlogPost | null>(null);
  const [previewArticle, setPreviewArticle] = useState<BlogPost | null>(null);

  const categories = Array.from(
    new Set<string>(store.blogs.map((b: BlogPost) => b.category).filter(Boolean))
  );

  const filtered = store.blogs.filter((b: BlogPost) => {
    const matchesQ =
      !query ||
      b.title.toLowerCase().includes(query.toLowerCase()) ||
      b.slug.toLowerCase().includes(query.toLowerCase()) ||
      b.author.toLowerCase().includes(query.toLowerCase());
    const matchesS = !statusFilter || b.status === statusFilter;
    const matchesC = !categoryFilter || b.category === categoryFilter;
    return matchesQ && matchesS && matchesC;
  });

  function handleDelete() {
    if (!deleteTarget) return;
    update((prev) => ({
      ...prev,
      blogs: prev.blogs.filter((b: BlogPost) => b.id !== deleteTarget.id),
    }));
    setDeleteTarget(null);
  }

  return (
    <AdminShell current="/admin/blog-seo">
      <main className="admin-page website-studio-page">
        <AdminBreadcrumb
          items={[
            { label: "Admin", href: "/admin" },
            { label: "Blog & SEO" },
          ]}
        />
        <AdminPageHeader
          eyebrow="ADMIN • CONTENT STUDIO"
          title="Blog & SEO"
          description="Kelola publikasi artikel, struktur konten modular, serta optimasi metadata mesin pencari dan media sosial."
          actions={
            <Link className="button button-primary" href="/admin/blog-seo?action=new">
              + Buat Artikel Baru
            </Link>
          }
        />

        <div className="program-pricing-filters">
          <label>
            <span>Cari Artikel</span>
            <input
              type="search"
              placeholder="Cari judul, slug, atau penulis..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label>
            <span>Kategori</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">Semua Kategori</option>
              {categories.map((c: string) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">Semua Status</option>
              <option value="Draft">Draft</option>
              <option value="Published">Published</option>
              <option value="Scheduled">Scheduled</option>
              <option value="Archived">Archived</option>
            </select>
          </label>
          {(query || statusFilter || categoryFilter) && (
            <button
              type="button"
              className="button button-secondary"
              onClick={() => {
                setQuery("");
                setStatusFilter("");
                setCategoryFilter("");
              }}
            >
              Reset
            </button>
          )}
        </div>

        <AdminDataTable<BlogPost>
          caption="Daftar Artikel Blog"
          rows={filtered}
          rowKey={(row: BlogPost) => row.id}
          empty="Belum ada artikel yang terdaftar."
          columns={[
            {
              key: "title",
              header: "Judul & Slug",
              cell: (row: BlogPost) => (
                <div>
                  <strong>{row.title}</strong>
                  <div className="cms-slug-preview">/{row.slug}</div>
                </div>
              ),
            },
            {
              key: "category",
              header: "Kategori",
              cell: (row: BlogPost) => <span className="type-pill">{row.category}</span>,
            },
            {
              key: "author",
              header: "Penulis",
              cell: (row: BlogPost) => <small>{row.author || "Anonim"}</small>,
            },
            {
              key: "date",
              header: "Tanggal",
              cell: (row: BlogPost) => <small>{row.publishedAt || "—"}</small>,
            },
            {
              key: "status",
              header: "Status",
              cell: (row: BlogPost) => <AdminStatusBadge status={row.status} />,
            },
          ]}
          actions={{
            header: "Tindakan",
            cell: (row: BlogPost) => (
              <div className="table-action-buttons">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setPreviewArticle(row)}
                >
                  Pratinjau
                </button>
                <Link
                  className="button button-secondary"
                  href={`/admin/blog-seo?id=${row.id}`}
                >
                  Ubah
                </Link>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setDeleteTarget(row)}
                >
                  Hapus
                </button>
              </div>
            ),
          }}
        />

        <AdminConfirmDialog
          open={Boolean(deleteTarget)}
          title="Hapus Artikel Blog?"
          close={() => setDeleteTarget(null)}
          actions={
            <div className="table-action-buttons">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setDeleteTarget(null)}
              >
                Batal
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={handleDelete}
              >
                Hapus
              </button>
            </div>
          }
        >
          <p>
            Yakin ingin menghapus artikel <strong>{deleteTarget?.title}</strong>?
            Tindakan ini tidak dapat dibatalkan.
          </p>
        </AdminConfirmDialog>

        {/* Article Full Preview Modal */}
        <AdminDialog
          open={Boolean(previewArticle)}
          title="Pratinjau Artikel Blog"
          close={() => setPreviewArticle(null)}
        >
          {previewArticle && (
            <div className="cms-article-preview">
              <span className="type-pill">{previewArticle.category}</span>
              <h2>{previewArticle.title}</h2>
              <p className="field-hint">
                Oleh {previewArticle.author} • {previewArticle.publishedAt}
              </p>
              <p className="hero-lead">{previewArticle.excerpt}</p>
              <hr />
              <div className="cms-preview-rendered-blocks">
                {previewArticle.blocks.map((blk) => (
                  <div key={blk.id} className="cms-preview-rendered-block">
                    {blk.type === "h2" && <h3>{blk.content}</h3>}
                    {blk.type === "h3" && <h4>{blk.content}</h4>}
                    {blk.type === "paragraph" && <p>{blk.content}</p>}
                    {blk.type === "bulleted" && (
                      <ul>
                        {blk.content.split("\n").map((line, lidx) => (
                          <li key={lidx}>{line}</li>
                        ))}
                      </ul>
                    )}
                    {blk.type === "numbered" && (
                      <ol>
                        {blk.content.split("\n").map((line, lidx) => (
                          <li key={lidx}>{line}</li>
                        ))}
                      </ol>
                    )}
                    {blk.type === "link" && (
                      <p>
                        <a href={blk.url} target="_blank" rel="noreferrer" className="url-link">
                          🔗 {blk.content || blk.url}
                        </a>
                      </p>
                    )}
                    {blk.type === "image" && (
                      <figure>
                        <div className="cms-img-placeholder">Gambar: {blk.url || "Tanpa URL"}</div>
                        {blk.caption && <figcaption>{blk.caption}</figcaption>}
                      </figure>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </AdminDialog>
      </main>
    </AdminShell>
  );
}

function BlogEditor({ id }: { id: string | null }) {
  const router = useRouter();
  const { store, update } = useWebsiteStore();

  const [article, setArticle] = useState<BlogPost>(() => {
    if (id) {
      const existing = store.blogs.find((b: BlogPost) => b.id === id);
      if (existing) return existing;
    }
    return {
      id: `blog-${Date.now()}`,
      slug: "",
      slugManuallyEdited: false,
      title: "",
      category: "Tips Belajar",
      excerpt: "",
      coverImage: "",
      coverImageAlt: "",
      author: "Tim Hiru Academy",
      publishedAt: new Date().toISOString().slice(0, 10),
      status: "Draft",
      blocks: [
        {
          id: `b-${Date.now()}`,
          type: "paragraph",
          content: "",
        },
      ],
      seo: {
        metaTitle: "",
        metaDescription: "",
        canonicalUrl: "",
        ogImage: "",
      },
    };
  });

  const [activeTab, setActiveTab] = useState<"content" | "seo" | "publication">("content");
  const [errors, setErrors] = useState<string[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [discardModalOpen, setDiscardModalOpen] = useState(false);

  // Track original copy to check isDirty
  const original = useMemo(() => {
    return id ? store.blogs.find((b: BlogPost) => b.id === id) : null;
  }, [id, store.blogs]);

  const isDirty = useMemo(() => {
    if (!original) {
      return Boolean(article.title.trim() || article.excerpt.trim());
    }
    return JSON.stringify(article) !== JSON.stringify(original);
  }, [article, original]);

  useDirtyGuard(isDirty);

  function patch(values: Partial<BlogPost>) {
    setArticle((prev) => ({ ...prev, ...values }));
  }

  function patchSeo(values: Partial<BlogPost["seo"]>) {
    setArticle((prev) => ({ ...prev, seo: { ...prev.seo, ...values } }));
  }

  // Slug suggestion logic: auto-update only until user manually edits
  function handleTitleChange(newTitle: string) {
    setArticle((prev) => {
      const nextSlug = prev.slugManuallyEdited ? prev.slug : slugify(newTitle);
      const nextMetaTitle = prev.seo.metaTitle ? prev.seo.metaTitle : newTitle;
      return {
        ...prev,
        title: newTitle,
        slug: nextSlug,
        seo: {
          ...prev.seo,
          metaTitle: nextMetaTitle,
        },
      };
    });
  }

  function handleSlugChange(newSlug: string) {
    setArticle((prev) => ({
      ...prev,
      slug: slugify(newSlug),
      slugManuallyEdited: true,
    }));
  }

  // Block management
  function addBlock(type: BlockType) {
    const newBlock: StructuredBlock = {
      id: `blk-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type,
      content: "",
      alt: type === "image" ? "" : undefined,
    };
    setArticle((prev) => ({ ...prev, blocks: [...prev.blocks, newBlock] }));
  }

  function updateBlock(blockId: string, values: Partial<StructuredBlock>) {
    setArticle((prev) => ({
      ...prev,
      blocks: prev.blocks.map((blk) => (blk.id === blockId ? { ...blk, ...values } : blk)),
    }));
  }

  function moveBlock(index: number, direction: "up" | "down") {
    setArticle((prev) => {
      const nextBlocks = [...prev.blocks];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= nextBlocks.length) return prev;
      const temp = nextBlocks[index];
      nextBlocks[index] = nextBlocks[targetIndex];
      nextBlocks[targetIndex] = temp;
      return { ...prev, blocks: nextBlocks };
    });
  }

  function removeBlock(blockId: string) {
    setArticle((prev) => ({
      ...prev,
      blocks: prev.blocks.filter((blk) => blk.id !== blockId),
    }));
  }

  function validate(): boolean {
    const errs: string[] = [];
    if (!article.title.trim()) errs.push("Judul artikel wajib diisi.");
    if (!article.slug.trim()) errs.push("Slug URL artikel wajib diisi.");
    if (!article.excerpt.trim()) errs.push("Ringkasan artikel wajib diisi.");

    // Duplicate slug check
    const duplicate = store.blogs.find(
      (b: BlogPost) => b.slug === article.slug && b.id !== article.id
    );
    if (duplicate) {
      errs.push(`Slug "${article.slug}" sudah digunakan oleh artikel lain.`);
    }

    // Image Alt text validation
    if (article.coverImage.trim() && !article.coverImageAlt.trim()) {
      errs.push("Alt text gambar sampul wajib diisi demi aksesibilitas & SEO.");
    }

    article.blocks.forEach((blk, idx) => {
      if (blk.type === "image" && blk.url?.trim() && !blk.alt?.trim()) {
        errs.push(`Blok gambar #${idx + 1} wajib memiliki deskripsi Alt Text.`);
      }
    });

    setErrors(errs);
    return errs.length === 0;
  }

  function handleSave(targetStatus: BlogStatus) {
    if (targetStatus === "Published" && !validate()) return;
    const updated: BlogPost = { ...article, status: targetStatus };

    update((prev) => {
      const exists = prev.blogs.some((b: BlogPost) => b.id === updated.id);
      return {
        ...prev,
        blogs: exists
          ? prev.blogs.map((b: BlogPost) => (b.id === updated.id ? updated : b))
          : [updated, ...prev.blogs],
      };
    });

    if (!id) {
      router.replace(`/admin/blog-seo?id=${updated.id}`);
    }
  }

  function handleBackClick() {
    if (isDirty) {
      setDiscardModalOpen(true);
    } else {
      router.push("/admin/blog-seo");
    }
  }

  return (
    <AdminShell current="/admin/blog-seo">
      <main className="admin-page website-studio-page">
        <AdminBreadcrumb
          items={[
            { label: "Admin", href: "/admin" },
            { label: "Blog & SEO", href: "/admin/blog-seo" },
            { label: article.title || "Artikel Baru" },
          ]}
        />

        <div className="editor-top-nav">
          <button type="button" className="back-link" onClick={handleBackClick}>
            ← Kembali ke Hub Blog
          </button>
          <div className="publication-actions">
            <DirtyBadge isDirty={isDirty} />
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setPreviewOpen(true)}
            >
              Pratinjau
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => handleSave("Draft")}
            >
              Simpan Draf
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={() => handleSave("Published")}
            >
              Terbitkan
            </button>
          </div>
        </div>

        <ValidationAlert errors={errors} />

        <div className="cms-tabs-subnav">
          <button
            type="button"
            className={`cms-tab-btn ${activeTab === "content" ? "active" : ""}`}
            onClick={() => setActiveTab("content")}
          >
            1. Konten Artikel
          </button>
          <button
            type="button"
            className={`cms-tab-btn ${activeTab === "seo" ? "active" : ""}`}
            onClick={() => setActiveTab("seo")}
          >
            2. Pengaturan SEO & Pratinjau
          </button>
          <button
            type="button"
            className={`cms-tab-btn ${activeTab === "publication" ? "active" : ""}`}
            onClick={() => setActiveTab("publication")}
          >
            3. Jadwal & Penulis
          </button>
        </div>

        {activeTab === "content" && (
          <div className="cms-form-section">
            <section className="program-form-card">
              <h3>Informasi Pokok Artikel</h3>
              <label>
                <span>Judul Artikel</span>
                <input
                  type="text"
                  value={article.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Masukkan judul artikel..."
                />
              </label>

              <div className="form-grid">
                <label>
                  <span>
                    Slug URL {article.slugManuallyEdited && "(Diedit Manual)"}
                  </span>
                  <input
                    type="text"
                    value={article.slug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    placeholder="slug-url-artikel"
                  />
                  {article.slugManuallyEdited && (
                    <button
                      type="button"
                      className="cms-inline-btn"
                      onClick={() =>
                        setArticle((prev) => ({
                          ...prev,
                          slug: slugify(prev.title),
                          slugManuallyEdited: false,
                        }))
                      }
                    >
                      ↺ Sinkronkan ulang dengan judul
                    </button>
                  )}
                </label>
                <label>
                  <span>Kategori</span>
                  <input
                    type="text"
                    value={article.category}
                    onChange={(e) => patch({ category: e.target.value })}
                    placeholder="Contoh: Tips Belajar, Grammar, dsb"
                  />
                </label>
              </div>

              <label>
                <span>Ringkasan / Excerpt</span>
                <textarea
                  rows={2}
                  value={article.excerpt}
                  onChange={(e) => patch({ excerpt: e.target.value })}
                  placeholder="Ringkasan singkat yang memikat pembaca..."
                />
              </label>

              <div className="form-grid">
                <label>
                  <span>URL Gambar Sampul (Cover)</span>
                  <input
                    type="text"
                    value={article.coverImage}
                    onChange={(e) => patch({ coverImage: e.target.value })}
                    placeholder="/showcase/cover.png atau https://..."
                  />
                </label>
                <label>
                  <span>Alt Text Gambar Sampul (Wajib jika ada gambar)</span>
                  <input
                    type="text"
                    value={article.coverImageAlt}
                    onChange={(e) => patch({ coverImageAlt: e.target.value })}
                    placeholder="Deskripsi gambar untuk pembaca tuna netra & SEO..."
                  />
                </label>
              </div>
            </section>

            {/* Structured Block Editor */}
            <section className="program-form-card cms-block-editor-card">
              <div className="cms-block-header">
                <div>
                  <h3>Editor Blok Konten</h3>
                  <p className="field-hint">
                    Bangun badan artikel menggunakan blok terstruktur berikut.
                  </p>
                </div>
                <div className="cms-block-toolbar">
                  <button type="button" onClick={() => addBlock("paragraph")}>
                    + Paragraf
                  </button>
                  <button type="button" onClick={() => addBlock("h2")}>
                    + Sub-judul H2
                  </button>
                  <button type="button" onClick={() => addBlock("h3")}>
                    + Sub-judul H3
                  </button>
                  <button type="button" onClick={() => addBlock("bulleted")}>
                    + Poin Bullet
                  </button>
                  <button type="button" onClick={() => addBlock("numbered")}>
                    + Daftar Nomor
                  </button>
                  <button type="button" onClick={() => addBlock("link")}>
                    + Tautan/Rujukan
                  </button>
                  <button type="button" onClick={() => addBlock("image")}>
                    + Gambar
                  </button>
                </div>
              </div>

              <div className="cms-blocks-list">
                {article.blocks.map((blk, index) => (
                  <div key={blk.id} className="cms-block-item">
                    <div className="cms-block-item-top">
                      <span className="type-pill">
                        #{index + 1} {blk.type.toUpperCase()}
                      </span>
                      <div className="cms-block-move-btns">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => moveBlock(index, "up")}
                          aria-label="Geser ke atas"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          disabled={index === article.blocks.length - 1}
                          onClick={() => moveBlock(index, "down")}
                          aria-label="Geser ke bawah"
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          className="cms-del-btn"
                          onClick={() => removeBlock(blk.id)}
                          aria-label="Hapus blok"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    <div className="cms-block-item-body">
                      {blk.type === "paragraph" && (
                        <textarea
                          rows={3}
                          value={blk.content}
                          onChange={(e) => updateBlock(blk.id, { content: e.target.value })}
                          placeholder="Ketik paragraf..."
                        />
                      )}
                      {blk.type === "h2" && (
                        <input
                          type="text"
                          value={blk.content}
                          onChange={(e) => updateBlock(blk.id, { content: e.target.value })}
                          placeholder="Judul Sub-bagian H2..."
                        />
                      )}
                      {blk.type === "h3" && (
                        <input
                          type="text"
                          value={blk.content}
                          onChange={(e) => updateBlock(blk.id, { content: e.target.value })}
                          placeholder="Sub-bagian H3..."
                        />
                      )}
                      {blk.type === "bulleted" && (
                        <textarea
                          rows={3}
                          value={blk.content}
                          onChange={(e) => updateBlock(blk.id, { content: e.target.value })}
                          placeholder="Satu baris untuk setiap poin bullet..."
                        />
                      )}
                      {blk.type === "numbered" && (
                        <textarea
                          rows={3}
                          value={blk.content}
                          onChange={(e) => updateBlock(blk.id, { content: e.target.value })}
                          placeholder="Satu baris untuk setiap nomor..."
                        />
                      )}
                      {blk.type === "link" && (
                        <div className="form-grid">
                          <input
                            type="text"
                            value={blk.content}
                            onChange={(e) => updateBlock(blk.id, { content: e.target.value })}
                            placeholder="Teks tautan rujukan..."
                          />
                          <input
                            type="text"
                            value={blk.url ?? ""}
                            onChange={(e) => updateBlock(blk.id, { url: e.target.value })}
                            placeholder="https://... atau /placement"
                          />
                        </div>
                      )}
                      {blk.type === "image" && (
                        <div className="form-grid">
                          <input
                            type="text"
                            value={blk.url ?? ""}
                            onChange={(e) => updateBlock(blk.id, { url: e.target.value })}
                            placeholder="URL Gambar..."
                          />
                          <input
                            type="text"
                            value={blk.alt ?? ""}
                            onChange={(e) => updateBlock(blk.id, { alt: e.target.value })}
                            placeholder="Alt text wajib..."
                          />
                          <input
                            type="text"
                            value={blk.caption ?? ""}
                            onChange={(e) => updateBlock(blk.id, { caption: e.target.value })}
                            placeholder="Keterangan gambar (opsional)..."
                            style={{ gridColumn: "1 / -1" }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === "seo" && (
          <div className="cms-form-section">
            <section className="program-form-card">
              <h3>Metadata SEO Mesin Pencari</h3>
              <label>
                <span>Meta Title (Rekomendasi 50–60 karakter)</span>
                <input
                  type="text"
                  value={article.seo.metaTitle}
                  onChange={(e) => patchSeo({ metaTitle: e.target.value })}
                  placeholder="Meta title untuk Google..."
                />
                <small className="field-hint">
                  {article.seo.metaTitle.length} karakter
                </small>
              </label>

              <label>
                <span>Meta Description (Rekomendasi 120–160 karakter)</span>
                <textarea
                  rows={3}
                  value={article.seo.metaDescription}
                  onChange={(e) => patchSeo({ metaDescription: e.target.value })}
                  placeholder="Ringkasan penjelasan untuk SERP snippet..."
                />
                <small className="field-hint">
                  {article.seo.metaDescription.length} karakter
                </small>
              </label>

              <div className="form-grid">
                <label>
                  <span>Canonical URL</span>
                  <input
                    type="text"
                    value={article.seo.canonicalUrl}
                    onChange={(e) => patchSeo({ canonicalUrl: e.target.value })}
                    placeholder="https://hiruacademy.com/blog/..."
                  />
                </label>
                <label>
                  <span>Open Graph Image URL</span>
                  <input
                    type="text"
                    value={article.seo.ogImage}
                    onChange={(e) => patchSeo({ ogImage: e.target.value })}
                    placeholder="https://.../og-image.png"
                  />
                </label>
              </div>
            </section>

            {/* Google SERP Preview Card */}
            <section className="program-form-card cms-serp-card">
              <h3>Pratinjau Tampilan Google Search (SERP)</h3>
              <div className="cms-serp-preview">
                <div className="cms-serp-site">
                  <span className="cms-serp-favicon">日</span>
                  <span className="cms-serp-url">
                    https://hiruacademy.com › blog › {article.slug || "slug-artikel"}
                  </span>
                </div>
                <h4 className="cms-serp-title">
                  {article.seo.metaTitle || article.title || "Judul Artikel Hiru Academy"}
                </h4>
                <p className="cms-serp-snippet">
                  {article.seo.metaDescription ||
                    article.excerpt ||
                    "Kunjungi Hiru Academy untuk panduan belajar bahasa Jepang terstruktur, tips JLPT, dan materi berkualitas tinggi."}
                </p>
              </div>
            </section>

            {/* Social Share Preview Card */}
            <section className="program-form-card cms-social-card">
              <h3>Pratinjau Media Sosial (Open Graph)</h3>
              <div className="cms-social-preview">
                <div className="cms-social-img">
                  {article.seo.ogImage || article.coverImage ? (
                    <small>Gambar: {article.seo.ogImage || article.coverImage}</small>
                  ) : (
                    <span>HIRU ACADEMY • BLOG</span>
                  )}
                </div>
                <div className="cms-social-meta">
                  <span className="cms-social-domain">HIRUACADEMY.COM</span>
                  <h4>{article.seo.metaTitle || article.title || "Judul Artikel"}</h4>
                  <p>{article.seo.metaDescription || article.excerpt || "Ringkasan artikel..."}</p>
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === "publication" && (
          <div className="cms-form-section">
            <section className="program-form-card">
              <h3>Jadwal & Status Publikasi</h3>
              <div className="form-grid">
                <label>
                  <span>Status Saat Ini</span>
                  <select
                    value={article.status}
                    onChange={(e) => patch({ status: e.target.value as BlogStatus })}
                  >
                    <option value="Draft">Draft (Draf)</option>
                    <option value="Published">Published (Tayang Publik)</option>
                    <option value="Scheduled">Scheduled (Terjadwal)</option>
                    <option value="Archived">Archived (Arsip)</option>
                  </select>
                </label>
                <label>
                  <span>Tanggal Publikasi</span>
                  <input
                    type="date"
                    value={article.publishedAt}
                    onChange={(e) => patch({ publishedAt: e.target.value })}
                  />
                </label>
              </div>

              <label>
                <span>Nama Penulis / Kontributor</span>
                <input
                  type="text"
                  value={article.author}
                  onChange={(e) => patch({ author: e.target.value })}
                  placeholder="Nama Penulis..."
                />
              </label>
            </section>
          </div>
        )}

        <DiscardConfirmModal
          open={discardModalOpen}
          onKeep={() => setDiscardModalOpen(false)}
          onDiscard={() => {
            setDiscardModalOpen(false);
            router.push("/admin/blog-seo");
          }}
        />

        <AdminDialog
          open={previewOpen}
          title="Pratinjau Lengkap Artikel"
          close={() => setPreviewOpen(false)}
        >
          <div className="cms-article-preview">
            <span className="type-pill">{article.category}</span>
            <h2>{article.title || "(Tanpa Judul)"}</h2>
            <p className="field-hint">
              Oleh {article.author} • {article.publishedAt}
            </p>
            <p className="hero-lead">{article.excerpt}</p>
            <hr />
            <div className="cms-preview-rendered-blocks">
              {article.blocks.map((blk) => (
                <div key={blk.id} className="cms-preview-rendered-block">
                  {blk.type === "h2" && <h3>{blk.content}</h3>}
                  {blk.type === "h3" && <h4>{blk.content}</h4>}
                  {blk.type === "paragraph" && <p>{blk.content}</p>}
                  {blk.type === "bulleted" && (
                    <ul>
                      {blk.content.split("\n").map((line, lidx) => (
                        <li key={lidx}>{line}</li>
                      ))}
                    </ul>
                  )}
                  {blk.type === "numbered" && (
                    <ol>
                      {blk.content.split("\n").map((line, lidx) => (
                        <li key={lidx}>{line}</li>
                      ))}
                    </ol>
                  )}
                  {blk.type === "link" && (
                    <p>
                      <a href={blk.url} className="url-link">
                        🔗 {blk.content || blk.url}
                      </a>
                    </p>
                  )}
                  {blk.type === "image" && (
                    <figure>
                      <div className="cms-img-placeholder">Gambar: {blk.url || "Tanpa URL"}</div>
                      {blk.caption && <figcaption>{blk.caption}</figcaption>}
                    </figure>
                  )}
                </div>
              ))}
            </div>
          </div>
        </AdminDialog>
      </main>
    </AdminShell>
  );
}

// =============================================================================
// SURFACE 3: TESTIMONIAL CMS
// =============================================================================

export function TestimonialStudio() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const action = searchParams.get("action");
  const isEditing = Boolean(id || action === "new");

  if (isEditing) {
    return <TestimonialEditor key={id ?? "new"} id={id} />;
  }

  return <TestimonialHub />;
}

function TestimonialHub() {
  const { store, update } = useWebsiteStore();
  const [activeTab, setActiveTab] = useState<string>("Semua");
  const [query, setQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Testimonial | null>(null);
  const [previewTesti, setPreviewTesti] = useState<Testimonial | null>(null);

  const tabs = ["Semua", "Kandidat", "Disetujui", "Unggulan", "Ditolak"];

  const filtered = store.testimonials
    .slice()
    .sort((a: Testimonial, b: Testimonial) => a.sortOrder - b.sortOrder)
    .filter((t: Testimonial) => {
      const matchesQ =
        !query ||
        t.name.toLowerCase().includes(query.toLowerCase()) ||
        t.quote.toLowerCase().includes(query.toLowerCase()) ||
        t.membership.toLowerCase().includes(query.toLowerCase());

      if (!matchesQ) return false;
      if (activeTab === "Kandidat") return t.status === "Draft";
      if (activeTab === "Disetujui") return t.status === "Approved" || t.status === "Published";
      if (activeTab === "Unggulan") return t.isFeatured;
      if (activeTab === "Ditolak") return t.status === "Rejected";
      return true;
    });

  function handleDelete() {
    if (!deleteTarget) return;
    update((prev) => ({
      ...prev,
      testimonials: prev.testimonials.filter((t: Testimonial) => t.id !== deleteTarget.id),
    }));
    setDeleteTarget(null);
  }

  function handleQuickApprove(item: Testimonial) {
    update((prev) => ({
      ...prev,
      testimonials: prev.testimonials.map((t: Testimonial) =>
        t.id === item.id ? { ...t, hasConsent: true, status: "Approved" } : t
      ),
    }));
  }

  return (
    <AdminShell current="/admin/testimoni">
      <main className="admin-page website-studio-page">
        <AdminBreadcrumb
          items={[
            { label: "Admin", href: "/admin" },
            { label: "Testimoni" },
          ]}
        />
        <AdminPageHeader
          eyebrow="ADMIN • CONTENT STUDIO"
          title="Testimoni Pembelajar"
          description="Kelola kurasi cerita pembelajar, verifikasi persetujuan tayang (consent), dan tentukan testimoni unggulan."
          actions={
            <Link className="button button-primary" href="/admin/testimoni?action=new">
              + Tambah Testimoni
            </Link>
          }
        />

        <AdminTabs
          label="Status Testimoni"
          tabs={tabs}
          active={activeTab}
          onChange={setActiveTab}
        >
          <div className="program-pricing-filters" style={{ marginTop: 16 }}>
            <label>
              <span>Cari Pembelajar / Kutipan</span>
              <input
                type="search"
                placeholder="Cari nama, membership, atau kutipan..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            {query && (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setQuery("")}
              >
                Reset
              </button>
            )}
          </div>

          <AdminDataTable<Testimonial>
            caption="Daftar Testimoni"
            rows={filtered}
            rowKey={(row: Testimonial) => row.id}
            empty="Tidak ada testimoni untuk kategori ini."
            columns={[
              {
                key: "order",
                header: "Urutan",
                cell: (row: Testimonial) => <span className="order-pill">#{row.sortOrder}</span>,
              },
              {
                key: "user",
                header: "Pembelajar",
                cell: (row: Testimonial) => (
                  <div className="cms-testi-user-cell">
                    <span className="cms-avatar-circle">{row.initials || "HR"}</span>
                    <div>
                      <strong>{row.name}</strong>
                      <small className="field-hint">{row.membership}</small>
                    </div>
                  </div>
                ),
              },
              {
                key: "quote",
                header: "Kutipan",
                cell: (row: Testimonial) => <p className="cms-testi-quote-cell">&ldquo;{row.quote}&rdquo;</p>,
              },
              {
                key: "consent",
                header: "Persetujuan",
                cell: (row: Testimonial) => (
                  <span
                    className={`cms-pill ${
                      row.hasConsent ? "cms-pill-visible" : "cms-pill-hidden"
                    }`}
                  >
                    {row.hasConsent ? "✓ Disetujui" : "Belum Ada"}
                  </span>
                ),
              },
              {
                key: "featured",
                header: "Unggulan",
                cell: (row: Testimonial) => (row.isFeatured ? <span>⭐ Ya</span> : <span>—</span>),
              },
              {
                key: "status",
                header: "Status",
                cell: (row: Testimonial) => <AdminStatusBadge status={row.status} />,
              },
            ]}
            actions={{
              header: "Tindakan",
              cell: (row: Testimonial) => (
                <div className="table-action-buttons">
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setPreviewTesti(row)}
                  >
                    Pratinjau
                  </button>
                  {row.status === "Draft" && !row.hasConsent && (
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => handleQuickApprove(row)}
                    >
                      Verifikasi Consent
                    </button>
                  )}
                  <Link
                    className="button button-secondary"
                    href={`/admin/testimoni?id=${row.id}`}
                  >
                    Ubah
                  </Link>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setDeleteTarget(row)}
                  >
                    Hapus
                  </button>
                </div>
              ),
            }}
          />
        </AdminTabs>

        <AdminConfirmDialog
          open={Boolean(deleteTarget)}
          title="Hapus Testimoni?"
          close={() => setDeleteTarget(null)}
          actions={
            <div className="table-action-buttons">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setDeleteTarget(null)}
              >
                Batal
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={handleDelete}
              >
                Hapus
              </button>
            </div>
          }
        >
          <p>
            Yakin ingin menghapus testimoni dari <strong>{deleteTarget?.name}</strong>?
          </p>
        </AdminConfirmDialog>

        {/* Live Card Preview Dialog */}
        <AdminDialog
          open={Boolean(previewTesti)}
          title="Pratinjau Kartu Testimoni"
          close={() => setPreviewTesti(null)}
        >
          {previewTesti && <TestimonialCardPreview testi={previewTesti} />}
        </AdminDialog>
      </main>
    </AdminShell>
  );
}

function TestimonialCardPreview({ testi }: { testi: Testimonial }) {
  return (
    <div className="cms-testi-preview-wrap">
      <article className="testimonial-card cms-preview-real-card">
        <div className="testimonial-avatar">
          {testi.avatarSrc ? (
            <span className="cms-avatar-img-badge">Foto: {testi.avatarSrc}</span>
          ) : (
            <span aria-hidden="true">{testi.initials || "HR"}</span>
          )}
        </div>
        <blockquote>&ldquo;{testi.quote || "Isi kutipan testimoni..."}&rdquo;</blockquote>
        <footer>
          <strong>{testi.name || "Nama Siswa"}</strong>
          <small>{testi.membership || "Program"}</small>
        </footer>
        {testi.isFeatured && <span className="cms-featured-tag">★ UNGGULAN</span>}
      </article>
    </div>
  );
}

function TestimonialEditor({ id }: { id: string | null }) {
  const router = useRouter();
  const { store, update } = useWebsiteStore();

  const [testi, setTesti] = useState<Testimonial>(() => {
    if (id) {
      const existing = store.testimonials.find((t: Testimonial) => t.id === id);
      if (existing) return existing;
    }
    return {
      id: `testi-${Date.now()}`,
      name: "",
      membership: "Belajar Mandiri",
      avatarSrc: "",
      initials: "",
      videoSrc: "",
      quote: "",
      hasConsent: false,
      isFeatured: false,
      sortOrder: store.testimonials.length + 1,
      status: "Draft",
    };
  });

  const [errors, setErrors] = useState<string[]>([]);
  const [rejectPrompt, setRejectPrompt] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  function patch(values: Partial<Testimonial>) {
    setTesti((prev) => ({ ...prev, ...values }));
  }

  function handleNameChange(val: string) {
    const initials = val
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0].toUpperCase())
      .slice(0, 2)
      .join("");
    patch({ name: val, initials: initials || "HR" });
  }

  function validate(): boolean {
    const errs: string[] = [];
    if (!testi.name.trim()) errs.push("Nama pembelajar wajib diisi.");
    if (!testi.quote.trim()) errs.push("Isi kutipan testimoni wajib diisi.");
    if (testi.status === "Published" && !testi.hasConsent) {
      errs.push("Testimoni hanya dapat diterbitkan jika persetujuan (consent) siswa telah dicentang.");
    }
    setErrors(errs);
    return errs.length === 0;
  }

  function handleSave(targetStatus: TestimonialStatus) {
    const updated = { ...testi, status: targetStatus };
    if (targetStatus === "Published" && !updated.hasConsent) {
      setErrors(["Tidak dapat menerbitkan tanpa persetujuan (consent) tertulis siswa."]);
      return;
    }
    if (!validate()) return;

    update((prev) => {
      const exists = prev.testimonials.some((t: Testimonial) => t.id === updated.id);
      return {
        ...prev,
        testimonials: exists
          ? prev.testimonials.map((t: Testimonial) => (t.id === updated.id ? updated : t))
          : [updated, ...prev.testimonials],
      };
    });

    if (!id) {
      router.replace(`/admin/testimoni?id=${updated.id}`);
    }
  }

  function handleRejectSubmit() {
    patch({ status: "Rejected", rejectionReason: rejectReason });
    setRejectPrompt(false);
  }

  return (
    <AdminShell current="/admin/testimoni">
      <main className="admin-page website-studio-page">
        <AdminBreadcrumb
          items={[
            { label: "Admin", href: "/admin" },
            { label: "Testimoni", href: "/admin/testimoni" },
            { label: testi.name || "Testimoni Baru" },
          ]}
        />

        <div className="editor-top-nav">
          <Link className="back-link" href="/admin/testimoni">
            ← Kembali ke Daftar Testimoni
          </Link>
          <div className="publication-actions">
            <span className="cms-pill">Status: {testi.status}</span>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => handleSave("Draft")}
            >
              Simpan Draf
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={() => handleSave("Published")}
            >
              Terbitkan
            </button>
          </div>
        </div>

        <ValidationAlert errors={errors} />

        <div className="cms-split-grid" style={{ marginTop: 20 }}>
          <section className="program-form-card">
            <h3>Detail Testimoni & Persetujuan</h3>

            <div className="form-grid">
              <label>
                <span>Nama Siswa / Pembelajar</span>
                <input
                  type="text"
                  value={testi.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Contoh: Budi Santoso"
                />
              </label>
              <label>
                <span>Inisial Avatar</span>
                <input
                  type="text"
                  maxLength={3}
                  value={testi.initials}
                  onChange={(e) => patch({ initials: e.target.value.toUpperCase() })}
                  placeholder="BS"
                />
              </label>
            </div>

            <div className="form-grid">
              <label>
                <span>Program / Membership</span>
                <input
                  type="text"
                  value={testi.membership}
                  onChange={(e) => patch({ membership: e.target.value })}
                  placeholder="Contoh: Belajar Mandiri (N5)"
                />
              </label>
              <label>
                <span>Urutan Tampil</span>
                <input
                  type="number"
                  min={1}
                  value={testi.sortOrder}
                  onChange={(e) => patch({ sortOrder: Number(e.target.value) })}
                />
              </label>
            </div>

            <div className="form-grid">
              <label>
                <span>Foto Avatar URL (Opsional)</span>
                <input
                  type="text"
                  value={testi.avatarSrc}
                  onChange={(e) => patch({ avatarSrc: e.target.value })}
                  placeholder="/testimonials/foto.png"
                />
              </label>
              <label>
                <span>Video Testimoni URL (Opsional)</span>
                <input
                  type="text"
                  value={testi.videoSrc}
                  onChange={(e) => patch({ videoSrc: e.target.value })}
                  placeholder="https://youtube.com/..."
                />
              </label>
            </div>

            <label>
              <span>Kutipan Testimoni</span>
              <textarea
                rows={4}
                value={testi.quote}
                onChange={(e) => patch({ quote: e.target.value })}
                placeholder="Ceritakan pengalaman belajar di Hiru Academy..."
              />
            </label>

            {/* Consent and Featured Controls */}
            <div className="cms-workflow-box">
              <h4>Verifikasi & Ketentuan Publikasi</h4>
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={testi.hasConsent}
                  onChange={(e) => patch({ hasConsent: e.target.checked })}
                />
                <span>
                  <strong>Persetujuan (Consent) Tertulis Siswa Terverifikasi</strong>
                  <div className="field-hint">
                    Siswa telah memberikan persetujuan tertulis untuk publikasi nama, foto, dan isi ulasan.
                  </div>
                </span>
              </label>

              <label className="toggle-label" style={{ marginTop: 14 }}>
                <input
                  type="checkbox"
                  checked={testi.isFeatured}
                  onChange={(e) => patch({ isFeatured: e.target.checked })}
                />
                <span>Tampilkan sebagai Testimoni Unggulan di Beranda</span>
              </label>

              <div className="cms-workflow-buttons">
                {testi.status === "Draft" && (
                  <>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => patch({ hasConsent: true, status: "Approved" })}
                    >
                      ✓ Setujui Consent
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => setRejectPrompt(true)}
                    >
                      ✕ Tolak
                    </button>
                  </>
                )}
                {testi.status === "Approved" && (
                  <>
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={() => handleSave("Published")}
                    >
                      Terbitkan ke Publik
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => patch({ status: "Draft" })}
                    >
                      Kembalikan ke Draf
                    </button>
                  </>
                )}
                {testi.status === "Published" && (
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => patch({ status: "Draft" })}
                  >
                    Tarik dari Tayang (Jadikan Draf)
                  </button>
                )}
                {testi.status === "Rejected" && (
                  <div>
                    <span className="cms-pill cms-pill-hidden">
                      Ditolak: {testi.rejectionReason || "Tidak memenuhi kriteria"}
                    </span>
                    <button
                      type="button"
                      className="button button-secondary"
                      style={{ marginLeft: 8 }}
                      onClick={() => patch({ status: "Draft" })}
                    >
                      Tinjau Ulang
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Right Column: Live Testimonial Preview */}
          <section className="cms-editor-card">
            <h3>Pratinjau Kartu Publik</h3>
            <p className="field-hint">
              Representasi kartu testimoni sebagaimana dilihat oleh pengunjung website.
            </p>
            <TestimonialCardPreview testi={testi} />
          </section>
        </div>

        {/* Rejection reason modal */}
        <AdminConfirmDialog
          open={rejectPrompt}
          title="Tolak Testimoni"
          close={() => setRejectPrompt(false)}
          actions={
            <div className="table-action-buttons">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setRejectPrompt(false)}
              >
                Batal
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={handleRejectSubmit}
              >
                Tolak Testimoni
              </button>
            </div>
          }
        >
          <label>
            <span>Alasan Penolakan</span>
            <input
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Contoh: Belum ada izin tertulis / teks tidak relevan..."
            />
          </label>
        </AdminConfirmDialog>
      </main>
    </AdminShell>
  );
}

// =============================================================================
// SURFACE 4: ANNOUNCEMENT CMS
// =============================================================================

export function AnnouncementStudio() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const action = searchParams.get("action");
  const isEditing = Boolean(id || action === "new");

  if (isEditing) {
    return <AnnouncementEditor key={id ?? "new"} id={id} />;
  }

  return <AnnouncementHub />;
}

function AnnouncementHub() {
  const { store, update } = useWebsiteStore();
  const [query, setQuery] = useState("");
  const [audienceFilter, setAudienceFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);
  const [previewItem, setPreviewItem] = useState<Announcement | null>(null);

  const filtered = store.announcements.filter((a: Announcement) => {
    const matchesQ =
      !query ||
      a.title.toLowerCase().includes(query.toLowerCase()) ||
      a.content.toLowerCase().includes(query.toLowerCase());
    const matchesAud = !audienceFilter || a.audience === audienceFilter;
    const matchesPri = !priorityFilter || a.priority === priorityFilter;
    return matchesQ && matchesAud && matchesPri;
  });

  function handleDelete() {
    if (!deleteTarget) return;
    update((prev) => ({
      ...prev,
      announcements: prev.announcements.filter((a: Announcement) => a.id !== deleteTarget.id),
    }));
    setDeleteTarget(null);
  }

  return (
    <AdminShell current="/admin/pengumuman">
      <main className="admin-page website-studio-page">
        <AdminBreadcrumb
          items={[
            { label: "Admin", href: "/admin" },
            { label: "Pengumuman" },
          ]}
        />
        <AdminPageHeader
          eyebrow="ADMIN • CONTENT STUDIO"
          title="Pengumuman & Notifikasi"
          description="Atur informasi penting, pengumuman terjadwal, target penerima, dan tingkat prioritas tampilan."
          actions={
            <Link className="button button-primary" href="/admin/pengumuman?action=new">
              + Buat Pengumuman Baru
            </Link>
          }
        />

        <div className="program-pricing-filters">
          <label>
            <span>Cari Pengumuman</span>
            <input
              type="search"
              placeholder="Cari judul atau isi pesan..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label>
            <span>Target Sasaran</span>
            <select
              value={audienceFilter}
              onChange={(e) => setAudienceFilter(e.target.value)}
            >
              <option value="">Semua Sasaran</option>
              <option value="all">Semua Pengguna</option>
              <option value="free">Free Member</option>
              <option value="lms">Belajar Mandiri</option>
              <option value="sensei">Belajar dengan Sensei</option>
            </select>
          </label>
          <label>
            <span>Prioritas</span>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
            >
              <option value="">Semua Prioritas</option>
              <option value="normal">Normal</option>
              <option value="important">Penting</option>
              <option value="urgent">Mendesak</option>
            </select>
          </label>
          {(query || audienceFilter || priorityFilter) && (
            <button
              type="button"
              className="button button-secondary"
              onClick={() => {
                setQuery("");
                setAudienceFilter("");
                setPriorityFilter("");
              }}
            >
              Reset
            </button>
          )}
        </div>

        <AdminDataTable<Announcement>
          caption="Daftar Pengumuman"
          rows={filtered}
          rowKey={(row: Announcement) => row.id}
          empty="Belum ada pengumuman tersimpan."
          columns={[
            {
              key: "title",
              header: "Judul Pengumuman",
              cell: (row: Announcement) => (
                <div>
                  <strong>{row.title}</strong>
                  <div className="field-hint">{row.content.slice(0, 48)}…</div>
                </div>
              ),
            },
            {
              key: "audience",
              header: "Target Audiens",
              cell: (row: Announcement) => (
                <span className="type-pill">
                  {row.audience === "all"
                    ? "Semua Pengguna"
                    : row.audience === "free"
                    ? "Free Member"
                    : row.audience === "lms"
                    ? "Mandiri (LMS)"
                    : "Sensei Class"}
                </span>
              ),
            },
            {
              key: "priority",
              header: "Prioritas",
              cell: (row: Announcement) => (
                <span className={`cms-priority-badge priority-${row.priority}`}>
                  {row.priority.toUpperCase()}
                </span>
              ),
            },
            {
              key: "period",
              header: "Periode",
              cell: (row: Announcement) => (
                <small>
                  {row.startDate} s/d {row.endDate}
                </small>
              ),
            },
            {
              key: "status",
              header: "Status",
              cell: (row: Announcement) => <AdminStatusBadge status={row.status} />,
            },
          ]}
          actions={{
            header: "Tindakan",
            cell: (row: Announcement) => (
              <div className="table-action-buttons">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setPreviewItem(row)}
                >
                  Pratinjau
                </button>
                <Link
                  className="button button-secondary"
                  href={`/admin/pengumuman?id=${row.id}`}
                >
                  Ubah
                </Link>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setDeleteTarget(row)}
                >
                  Hapus
                </button>
              </div>
            ),
          }}
        />

        <AdminConfirmDialog
          open={Boolean(deleteTarget)}
          title="Hapus Pengumuman?"
          close={() => setDeleteTarget(null)}
          actions={
            <div className="table-action-buttons">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setDeleteTarget(null)}
              >
                Batal
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={handleDelete}
              >
                Hapus
              </button>
            </div>
          }
        >
          <p>
            Yakin ingin menghapus pengumuman <strong>{deleteTarget?.title}</strong>?
          </p>
        </AdminConfirmDialog>

        {/* Announcement preview dialog */}
        <AdminDialog
          open={Boolean(previewItem)}
          title="Pratinjau Pengumuman"
          close={() => setPreviewItem(null)}
        >
          {previewItem && <AnnouncementPreviewCard announcement={previewItem} />}
        </AdminDialog>
      </main>
    </AdminShell>
  );
}

function AnnouncementPreviewCard({ announcement }: { announcement: Announcement }) {
  return (
    <div className="announcement-preview-centered">
      <div className="announcement-preview-card-inner">
        <span className="announcement-preview-badge">
          PENGUMUMAN • {announcement.priority.toUpperCase()}
        </span>
        <h3 style={{ margin: "0 0 10px 0" }}>{announcement.title || "(Tanpa Judul)"}</h3>
        <p className="announcement-preview-body">
          {announcement.content || "(Isi pengumuman kosong)"}
        </p>
        {announcement.ctaText && (
          <div style={{ marginTop: 12 }}>
            <span className="button button-primary">{announcement.ctaText}</span>
          </div>
        )}
        <small className="field-hint" style={{ marginTop: 16 }}>
          Target: {announcement.audience} • Berlaku: {announcement.startDate} s/d{" "}
          {announcement.endDate}
        </small>
      </div>
    </div>
  );
}

function AnnouncementEditor({ id }: { id: string | null }) {
  const router = useRouter();
  const { store, update } = useWebsiteStore();

  const [item, setItem] = useState<Announcement>(() => {
    if (id) {
      const existing = store.announcements.find((a: Announcement) => a.id === id);
      if (existing) return existing;
    }
    return {
      id: `ann-${Date.now()}`,
      title: "",
      content: "",
      audience: "all",
      priority: "normal",
      startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      ctaText: "",
      ctaUrl: "",
      status: "Draft",
    };
  });

  const [errors, setErrors] = useState<string[]>([]);

  function patch(values: Partial<Announcement>) {
    setItem((prev) => ({ ...prev, ...values }));
  }

  function validate(): boolean {
    const errs: string[] = [];
    if (!item.title.trim()) errs.push("Judul pengumuman wajib diisi.");
    if (!item.content.trim()) errs.push("Isi pesan pengumuman wajib diisi.");
    if (item.startDate && item.endDate && item.endDate < item.startDate) {
      errs.push("Tanggal selesai tidak boleh lebih awal dari tanggal mulai.");
    }
    if (item.ctaText?.trim() && !item.ctaUrl?.trim()) {
      errs.push("Tautan URL CTA wajib diisi jika tombol memiliki teks label.");
    }
    if (!item.ctaText?.trim() && item.ctaUrl?.trim()) {
      errs.push("Teks label tombol CTA wajib diisi jika URL diisi.");
    }
    setErrors(errs);
    return errs.length === 0;
  }

  function handleSave(targetStatus: AnnouncementStatus) {
    const updated = { ...item, status: targetStatus };
    if (!validate()) return;

    update((prev) => {
      const exists = prev.announcements.some((a: Announcement) => a.id === updated.id);
      return {
        ...prev,
        announcements: exists
          ? prev.announcements.map((a: Announcement) => (a.id === updated.id ? updated : a))
          : [updated, ...prev.announcements],
      };
    });

    if (!id) {
      router.replace(`/admin/pengumuman?id=${updated.id}`);
    }
  }

  return (
    <AdminShell current="/admin/pengumuman">
      <main className="admin-page website-studio-page">
        <AdminBreadcrumb
          items={[
            { label: "Admin", href: "/admin" },
            { label: "Pengumuman", href: "/admin/pengumuman" },
            { label: item.title || "Pengumuman Baru" },
          ]}
        />

        <div className="editor-top-nav">
          <Link className="back-link" href="/admin/pengumuman">
            ← Kembali ke Hub Pengumuman
          </Link>
          <div className="publication-actions">
            <span className="cms-pill">Status: {item.status}</span>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => handleSave("Draft")}
            >
              Simpan Draf
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={() => handleSave("Published")}
            >
              Terbitkan
            </button>
          </div>
        </div>

        <ValidationAlert errors={errors} />

        <div className="cms-split-grid" style={{ marginTop: 20 }}>
          <section className="program-form-card">
            <h3>Konfigurasi Pengumuman</h3>

            <label>
              <span>Judul Pengumuman</span>
              <input
                type="text"
                value={item.title}
                onChange={(e) => patch({ title: e.target.value })}
                placeholder="Judul ringkas pengumuman..."
              />
            </label>

            <label>
              <span>Isi Pesan Pengumuman</span>
              <textarea
                rows={4}
                value={item.content}
                onChange={(e) => patch({ content: e.target.value })}
                placeholder="Pesan lengkap yang ingin disampaikan kepada siswa..."
              />
            </label>

            <div className="form-grid">
              <label>
                <span>Sasaran Penerima (Audience)</span>
                <select
                  value={item.audience}
                  onChange={(e) =>
                    patch({ audience: e.target.value as AnnouncementAudience })
                  }
                >
                  <option value="all">Semua Pengguna & Pengunjung</option>
                  <option value="free">Khusus Free Member</option>
                  <option value="lms">Khusus Belajar Mandiri (LMS)</option>
                  <option value="sensei">Khusus Belajar dengan Sensei</option>
                </select>
              </label>

              <label>
                <span>Tingkat Prioritas</span>
                <select
                  value={item.priority}
                  onChange={(e) =>
                    patch({ priority: e.target.value as AnnouncementPriority })
                  }
                >
                  <option value="normal">Normal</option>
                  <option value="important">Penting</option>
                  <option value="urgent">Mendesak</option>
                </select>
              </label>
            </div>

            <div className="form-grid">
              <label>
                <span>Tanggal Mulai Tayang</span>
                <input
                  type="date"
                  value={item.startDate}
                  onChange={(e) => patch({ startDate: e.target.value })}
                />
              </label>
              <label>
                <span>Tanggal Selesai Tayang</span>
                <input
                  type="date"
                  value={item.endDate}
                  onChange={(e) => patch({ endDate: e.target.value })}
                />
              </label>
            </div>

            <div className="form-grid">
              <label>
                <span>Teks Tombol CTA (Opsional)</span>
                <input
                  type="text"
                  value={item.ctaText ?? ""}
                  onChange={(e) => patch({ ctaText: e.target.value })}
                  placeholder="Contoh: Lihat Jadwal"
                />
              </label>
              <label>
                <span>Tautan URL CTA (Opsional)</span>
                <input
                  type="text"
                  value={item.ctaUrl ?? ""}
                  onChange={(e) => patch({ ctaUrl: e.target.value })}
                  placeholder="Contoh: /schedule"
                />
              </label>
            </div>
          </section>

          <section className="cms-editor-card">
            <h3>Pratinjau Pengumuman</h3>
            <p className="field-hint">
              Simulasi tampilan pada dasbor siswa atau header pengumuman.
            </p>
            <AnnouncementPreviewCard announcement={item} />
          </section>
        </div>
      </main>
    </AdminShell>
  );
}
