"use client";

import { useSyncExternalStore } from "react";

export const WEBSITE_STORAGE_KEY = "hiru-admin-website:v1";
export const WEBSITE_CHANGE_EVENT = "hiru:website-change";

export const LANDING_SECTION_ORDER = [
  "hero",
  "pricing",
  "flow",
  "showcase",
  "sensei",
  "testimonial",
  "article",
  "finalCta",
] as const;
export type LandingSectionKey = (typeof LANDING_SECTION_ORDER)[number];

export const campaignProgramCodes = [
  "DASAR",
  "N5",
  "N4",
  "N3",
  "N2",
  "SSW",
  "INTERVIEW",
] as const;
export type CampaignProgramCode = (typeof campaignProgramCodes)[number];

export const targetPlans = ["mandiri", "sensei", "both"] as const;
export type TargetPlan = (typeof targetPlans)[number];

export const discountTypes = ["fixed", "percentage"] as const;
export type DiscountType = (typeof discountTypes)[number];

export const campaignStatuses = ["Draft", "Published", "Inactive"] as const;
export type CampaignStatus = (typeof campaignStatuses)[number];

export const articleBlockTypes = [
  "paragraph",
  "h2",
  "h3",
  "bulleted-list",
  "numbered-list",
  "link",
  "image",
] as const;
export type ArticleBlockType = (typeof articleBlockTypes)[number];

export type ArticleBlock = {
  id: string;
  type: ArticleBlockType;
  text?: string;
  items?: string[];
  url?: string;
  alt?: string;
  caption?: string;
};

export const articleStatuses = ["Draft", "Published"] as const;
export type ArticleStatus = (typeof articleStatuses)[number];

export const testimonialConsents = ["Approved", "Pending", "Rejected"] as const;
export type TestimonialConsent = (typeof testimonialConsents)[number];

export const testimonialStatuses = ["Draft", "Published", "Rejected"] as const;
export type TestimonialStatus = (typeof testimonialStatuses)[number];

export const announcementPriorities = ["Normal", "Important"] as const;
export type AnnouncementPriority = (typeof announcementPriorities)[number];

export const announcementAudiences = ["all", "free", "lms", "sensei"] as const;
export type AnnouncementAudience = (typeof announcementAudiences)[number];

export const announcementStatuses = ["Draft", "Published"] as const;
export type AnnouncementStatus = (typeof announcementStatuses)[number];

export const landingStatuses = ["Draft", "Published"] as const;
export type LandingStatus = (typeof landingStatuses)[number];

export type LandingHeroSection = {
  eyebrow: string;
  heading: string;
  support: string;
  primaryCtaLabel: string;
  primaryCtaPath: string;
  secondaryCtaLabel: string;
  secondaryCtaPath: string;
};

export type LandingPricingSection = {
  title: string;
  support: string;
  visible: boolean;
};

export type LandingStandardSection = {
  heading: string;
  support: string;
  visible: boolean;
};

export type LandingFinalCtaSection = {
  heading: string;
  support: string;
  ctaLabel: string;
  ctaPath: string;
  visible: boolean;
};

export type LandingContent = {
  id: string;
  status: LandingStatus;
  hero: LandingHeroSection;
  pricing: LandingPricingSection;
  flow: LandingStandardSection;
  showcase: LandingStandardSection;
  sensei: LandingStandardSection;
  testimonial: LandingStandardSection;
  article: LandingStandardSection;
  finalCta: LandingFinalCtaSection;
  updatedAt: string;
  publishedAt?: string;
};

export type Campaign = {
  id: string;
  name: string;
  headline: string;
  description: string;
  targetProgramCodes: CampaignProgramCode[];
  targetPlan: TargetPlan;
  discountType: DiscountType;
  value: number;
  startAt?: string;
  endAt?: string;
  badgeText: string;
  ctaLabel?: string;
  status: CampaignStatus;
};

export type Article = {
  id: string;
  title: string;
  slug: string;
  summary: string;
  category: string;
  author: string;
  imageUrl: string;
  imageAlt: string;
  blocks: ArticleBlock[];
  seoTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  indexable: boolean;
  ogImage: string;
  ogTitle: string;
  ogDescription: string;
  status: ArticleStatus;
  updatedAt: string;
  publishedAt?: string;
};

export type Testimonial = {
  id: string;
  name: string;
  context: string;
  quote: string;
  photoUrl: string;
  videoUrl: string;
  consent: TestimonialConsent;
  featured: boolean;
  sortOrder: number;
  status: TestimonialStatus;
};

export type Announcement = {
  id: string;
  title: string;
  content: string;
  priority: AnnouncementPriority;
  audience: AnnouncementAudience;
  ctaLabel?: string;
  ctaPath?: string;
  startAt?: string;
  endAt?: string;
  status: AnnouncementStatus;
};

export type WebsiteStore = {
  version: 1;
  landing: LandingContent;
  campaigns: Campaign[];
  articles: Article[];
  blogs: Article[];
  testimonials: Testimonial[];
  announcements: Announcement[];
};

const generateId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export function isValidInternalPath(path: unknown): boolean {
  if (typeof path !== "string") return false;
  const trimmed = path.trim();
  if (!trimmed.startsWith("/") && !trimmed.startsWith("#")) return false;
  if (trimmed.startsWith("//")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return false;
  return true;
}

export function validateInternalPath(path: unknown, fallback = "/"): string {
  if (isValidInternalPath(path)) {
    return (path as string).trim();
  }
  return fallback;
}

export function suggestSlug(text: string): string {
  if (!text || typeof text !== "string") return "";
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function validateSlug(slug: string): boolean {
  if (!slug || typeof slug !== "string") return false;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

export function isDateWithinWindow(
  startAt?: string | null,
  endAt?: string | null,
  referenceDate: Date | string | number = Date.now()
): boolean {
  const now =
    typeof referenceDate === "number"
      ? referenceDate
      : referenceDate instanceof Date
        ? referenceDate.getTime()
        : new Date(referenceDate).getTime();

  if (Number.isNaN(now)) return false;

  if (startAt) {
    const start = new Date(startAt).getTime();
    if (!Number.isNaN(start) && now < start) return false;
  }

  if (endAt) {
    const end = new Date(endAt).getTime();
    if (!Number.isNaN(end) && now > end) return false;
  }

  return true;
}

export const initialLandingContent: LandingContent = {
  id: "landing-default",
  status: "Published",
  hero: {
    eyebrow: "LIVE CLASS + LMS DALAM SATU ALUR BELAJAR",
    heading: "Belajar Bahasa Jepang Terarah dari Dasar sampai Siap JLPT",
    support:
      "Placement test, pembelajaran, flashcard, latihan, try out, komunitas, dan kelas bersama Sensei tersedia dalam satu pengalaman belajar yang konsisten.",
    primaryCtaLabel: "Coba Gratis",
    primaryCtaPath: "/register",
    secondaryCtaLabel: "Lihat Program",
    secondaryCtaPath: "/program",
  },
  pricing: {
    title: "Pilih cara belajar yang paling sesuai",
    support:
      "Pilih cara belajar, lalu tentukan level N5–N1 secara bebas. Harga dan akses mengikuti konfigurasi sistem.",
    visible: true,
  },
  flow: {
    heading: "Belajar Terarah dari Menentukan Level hingga Mencapai Target",
    support:
      "Mulai dari mengetahui kemampuan awal, mempelajari materi secara bertahap, hingga mengukur kesiapan menghadapi JLPT—semuanya tersedia dalam satu alur belajar yang terstruktur.",
    visible: true,
  },
  showcase: {
    heading: "Bukan Hanya Belajar Saat Zoom",
    support:
      "Lanjutkan belajar melalui materi, rekaman, latihan, dan evaluasi yang tersimpan di LMS Hiru Academy.",
    visible: true,
  },
  sensei: {
    heading: "Belajar Bersama Sensei Berpengalaman",
    support: "Belajar langsung bersama Sensei bersertifikasi dan berpengalaman.",
    visible: true,
  },
  testimonial: {
    heading: "Cerita dari Pembelajar Hiru Academy",
    support: "Dengarkan pengalaman langsung dari alumni dan pembelajar Hiru Academy.",
    visible: true,
  },
  article: {
    heading: "Artikel & Panduan Belajar",
    support: "Tips, panduan JLPT, dan informasi seputar belajar bahasa Jepang.",
    visible: true,
  },
  finalCta: {
    heading: "Belum tahu harus mulai dari level mana?",
    support:
      "Belum yakin levelmu? Gunakan Placement Test. Sudah punya target? Coba Chapter 1 gratis pada level pilihanmu.",
    ctaLabel: "Mulai Sekarang",
    ctaPath: "/placement",
    visible: true,
  },
  updatedAt: "2026-09-01T00:00:00.000Z",
  publishedAt: "2026-09-01T00:00:00.000Z",
};

export const initialCampaigns: Campaign[] = [
  {
    id: "campaign-early-bird-n5",
    name: "Early Bird N5",
    headline: "Hemat 20% untuk Pendaftaran Batch Baru N5",
    description:
      "Dapatkan potongan langsung untuk program N5 Belajar Mandiri atau bersama Sensei.",
    targetProgramCodes: ["N5"],
    targetPlan: "both",
    discountType: "percentage",
    value: 20,
    startAt: "2026-01-01T00:00:00.000Z",
    endAt: "2026-12-31T23:59:59.999Z",
    badgeText: "PROMO TERBATAS",
    ctaLabel: "Daftar Sekarang",
    status: "Published",
  },
];

export const initialArticles: Article[] = [
  {
    id: "article-strategi-n4",
    title: "Strategi membangun rutinitas belajar N4 yang realistis",
    slug: "strategi-rutinitas-belajar-n4",
    summary:
      "Rutinitas yang baik bukan tentang belajar selama mungkin, tetapi menjaga urutan aktivitas yang konsisten dan mudah diulang.",
    category: "Tips Belajar",
    author: "Hiru Academy",
    imageUrl: "",
    imageAlt: "Panduan rutinitas belajar N4",
    blocks: [
      {
        id: "block-1",
        type: "paragraph",
        text: "Susun ritme belajar mingguan dengan video, modul, flashcard, latihan, dan checkpoint tanpa kehilangan fokus.",
      },
      {
        id: "block-2",
        type: "h2",
        text: "1. Mulai dari checkpoint kecil",
      },
      {
        id: "block-3",
        type: "paragraph",
        text: "Fokus pada konsistensi harian 20-30 menit daripada belajar maraton di akhir pekan.",
      },
    ],
    seoTitle: "Strategi Rutinitas Belajar N4 - Hiru Academy",
    metaDescription:
      "Tips dan panduan menyusun jadwal belajar JLPT N4 efektif bersama Hiru Academy.",
    canonicalUrl: "/artikel/strategi-rutinitas-belajar-n4",
    indexable: true,
    ogImage: "",
    ogTitle: "Strategi membangun rutinitas belajar N4",
    ogDescription: "Rutinitas belajar terstruktur dari Hiru Academy.",
    status: "Published",
    updatedAt: "2026-08-20T00:00:00.000Z",
    publishedAt: "2026-08-20T00:00:00.000Z",
  },
];

export const initialTestimonials: Testimonial[] = [
  {
    id: "testi-rina",
    name: "Rina",
    context: "Free Member",
    quote:
      "Journey membantu saya tahu apa yang harus dipelajari setelah menyelesaikan satu materi.",
    photoUrl: "/testimonials/remaja3.png",
    videoUrl: "",
    consent: "Approved",
    featured: true,
    sortOrder: 1,
    status: "Published",
  },
  {
    id: "testi-budi",
    name: "Budi T.",
    context: "Program SSW",
    quote:
      "Materi SSW sangat relevan dengan kebutuhan kerja di Jepang. Simulasi interviewnya membuat saya jauh lebih percaya diri saat wawancara dengan perusahaan Jepang.",
    photoUrl: "/testimonials/remaja1.png",
    videoUrl: "",
    consent: "Approved",
    featured: true,
    sortOrder: 2,
    status: "Published",
  },
  {
    id: "testi-ayu",
    name: "Ayu",
    context: "Belajar dengan Sensei",
    quote:
      "Jadwal, replay, dan learning journey terasa menyatu dalam satu alur belajar.",
    photoUrl: "/testimonials/remaja2.png",
    videoUrl: "",
    consent: "Approved",
    featured: true,
    sortOrder: 3,
    status: "Published",
  },
];

export const initialAnnouncements: Announcement[] = [
  {
    id: "announcement-welcome",
    title: "Selamat datang di Platform Hiru Academy",
    content:
      "Mulai perjalanan belajarmu dengan Placement Test untuk mengetahui level awalmu.",
    priority: "Important",
    audience: "all",
    ctaLabel: "Placement Test",
    ctaPath: "/placement",
    startAt: "2026-01-01T00:00:00.000Z",
    endAt: "2026-12-31T23:59:59.999Z",
    status: "Published",
  },
];

export function createInitialWebsiteStore(): WebsiteStore {
  return {
    version: 1,
    landing: initialLandingContent,
    campaigns: initialCampaigns,
    articles: initialArticles,
    blogs: initialArticles,
    testimonials: initialTestimonials,
    announcements: initialAnnouncements,
  };
}

function normalizeArticleBlock(val: unknown): ArticleBlock | null {
  if (!val || typeof val !== "object") return null;
  const raw = val as Record<string, unknown>;
  let rawType = typeof raw.type === "string" ? raw.type : "";
  if (rawType === "bulleted") rawType = "bulleted-list";
  if (rawType === "numbered") rawType = "numbered-list";
  if (!articleBlockTypes.includes(rawType as ArticleBlockType)) return null;
  const type = rawType as ArticleBlockType;
  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : generateId(),
    type,
    text:
      typeof raw.text === "string"
        ? raw.text
        : typeof raw.content === "string"
          ? raw.content
          : undefined,
    items: Array.isArray(raw.items)
      ? raw.items.filter((item): item is string => typeof item === "string")
      : undefined,
    url: typeof raw.url === "string" ? raw.url : undefined,
    alt: typeof raw.alt === "string" ? raw.alt : undefined,
    caption: typeof raw.caption === "string" ? raw.caption : undefined,
  };
}

function normalizeSectionsToLanding(sections: unknown[]): LandingContent {
  const list = sections.filter(
    (s): s is Record<string, unknown> => typeof s === "object" && s !== null
  );
  const heroSec = list.find((s) => s.id === "hero");
  const pricingSec = list.find((s) => s.id === "program");
  const flowSec = list.find((s) => s.id === "alur-belajar");
  const showcaseSec = list.find((s) => s.id === "lms");
  const senseiSec = list.find((s) => s.id === "sensei");
  const testimonialSec = list.find((s) => s.id === "testimoni");
  const articleSec = list.find((s) => s.id === "artikel");
  const finalCtaSec = list.find((s) => s.id === "placement-cta");

  return {
    id: "landing-published",
    status: "Published",
    hero: {
      eyebrow:
        typeof heroSec?.badge === "string"
          ? heroSec.badge
          : initialLandingContent.hero.eyebrow,
      heading:
        typeof heroSec?.headline === "string"
          ? heroSec.headline
          : initialLandingContent.hero.heading,
      support:
        typeof heroSec?.description === "string"
          ? heroSec.description.replace(/learning journey/gi, "pembelajaran")
          : initialLandingContent.hero.support,
      primaryCtaLabel:
        typeof heroSec?.primaryCtaText === "string"
          ? heroSec.primaryCtaText
          : initialLandingContent.hero.primaryCtaLabel,
      primaryCtaPath: validateInternalPath(
        heroSec?.primaryCtaUrl,
        initialLandingContent.hero.primaryCtaPath
      ),
      secondaryCtaLabel:
        typeof heroSec?.secondaryCtaText === "string"
          ? heroSec.secondaryCtaText
          : initialLandingContent.hero.secondaryCtaLabel,
      secondaryCtaPath: validateInternalPath(
        heroSec?.secondaryCtaUrl,
        initialLandingContent.hero.secondaryCtaPath
      ),
    },
    pricing: {
      title:
        typeof pricingSec?.headline === "string"
          ? pricingSec.headline
          : initialLandingContent.pricing.title,
      support:
        typeof pricingSec?.description === "string"
          ? pricingSec.description
          : initialLandingContent.pricing.support,
      visible: pricingSec?.isVisible !== false,
    },
    flow: {
      heading:
        typeof flowSec?.headline === "string"
          ? flowSec.headline
          : initialLandingContent.flow.heading,
      support:
        typeof flowSec?.description === "string"
          ? flowSec.description
          : initialLandingContent.flow.support,
      visible: flowSec?.isVisible !== false,
    },
    showcase: {
      heading:
        typeof showcaseSec?.headline === "string"
          ? showcaseSec.headline
          : initialLandingContent.showcase.heading,
      support:
        typeof showcaseSec?.description === "string"
          ? showcaseSec.description
          : initialLandingContent.showcase.support,
      visible: showcaseSec?.isVisible !== false,
    },
    sensei: {
      heading:
        typeof senseiSec?.headline === "string"
          ? senseiSec.headline
          : initialLandingContent.sensei.heading,
      support:
        typeof senseiSec?.description === "string"
          ? senseiSec.description
          : initialLandingContent.sensei.support,
      visible: senseiSec?.isVisible !== false,
    },
    testimonial: {
      heading:
        typeof testimonialSec?.headline === "string"
          ? testimonialSec.headline
          : initialLandingContent.testimonial.heading,
      support:
        typeof testimonialSec?.description === "string"
          ? testimonialSec.description
          : initialLandingContent.testimonial.support,
      visible: testimonialSec?.isVisible !== false,
    },
    article: {
      heading:
        typeof articleSec?.headline === "string"
          ? articleSec.headline
          : initialLandingContent.article.heading,
      support:
        typeof articleSec?.description === "string"
          ? articleSec.description
          : initialLandingContent.article.support,
      visible: articleSec?.isVisible !== false,
    },
    finalCta: {
      heading:
        typeof finalCtaSec?.headline === "string"
          ? finalCtaSec.headline
          : initialLandingContent.finalCta.heading,
      support:
        typeof finalCtaSec?.description === "string"
          ? finalCtaSec.description
          : initialLandingContent.finalCta.support,
      ctaLabel:
        typeof finalCtaSec?.primaryCtaText === "string"
          ? finalCtaSec.primaryCtaText
          : initialLandingContent.finalCta.ctaLabel,
      ctaPath: validateInternalPath(
        finalCtaSec?.primaryCtaUrl,
        initialLandingContent.finalCta.ctaPath
      ),
      visible: finalCtaSec?.isVisible !== false,
    },
    updatedAt: new Date().toISOString(),
    publishedAt: new Date().toISOString(),
  };
}

function normalizeLandingContent(val: unknown): LandingContent {
  if (!val || typeof val !== "object") return initialLandingContent;
  const raw = val as Record<string, unknown>;
  const rawHero = (raw.hero && typeof raw.hero === "object" ? raw.hero : {}) as Record<
    string,
    unknown
  >;
  const rawPricing = (raw.pricing && typeof raw.pricing === "object"
    ? raw.pricing
    : {}) as Record<string, unknown>;
  const rawFlow = (raw.flow && typeof raw.flow === "object" ? raw.flow : {}) as Record<
    string,
    unknown
  >;
  const rawShowcase = (raw.showcase && typeof raw.showcase === "object"
    ? raw.showcase
    : {}) as Record<string, unknown>;
  const rawSensei = (raw.sensei && typeof raw.sensei === "object"
    ? raw.sensei
    : {}) as Record<string, unknown>;
  const rawTestimonial = (raw.testimonial && typeof raw.testimonial === "object"
    ? raw.testimonial
    : {}) as Record<string, unknown>;
  const rawArticle = (raw.article && typeof raw.article === "object"
    ? raw.article
    : {}) as Record<string, unknown>;
  const rawFinalCta = (raw.finalCta && typeof raw.finalCta === "object"
    ? raw.finalCta
    : {}) as Record<string, unknown>;

  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : "landing-default",
    status: raw.status === "Draft" ? "Draft" : "Published",
    hero: {
      eyebrow:
        typeof rawHero.eyebrow === "string"
          ? rawHero.eyebrow
          : initialLandingContent.hero.eyebrow,
      heading:
        typeof rawHero.heading === "string"
          ? rawHero.heading
          : initialLandingContent.hero.heading,
      support:
        typeof rawHero.support === "string"
          ? rawHero.support.replace(/learning journey/gi, "pembelajaran")
          : initialLandingContent.hero.support,
      primaryCtaLabel:
        typeof rawHero.primaryCtaLabel === "string"
          ? rawHero.primaryCtaLabel
          : initialLandingContent.hero.primaryCtaLabel,
      primaryCtaPath: validateInternalPath(
        rawHero.primaryCtaPath,
        initialLandingContent.hero.primaryCtaPath
      ),
      secondaryCtaLabel:
        typeof rawHero.secondaryCtaLabel === "string"
          ? rawHero.secondaryCtaLabel
          : initialLandingContent.hero.secondaryCtaLabel,
      secondaryCtaPath: validateInternalPath(
        rawHero.secondaryCtaPath,
        initialLandingContent.hero.secondaryCtaPath
      ),
    },
    pricing: {
      title:
        typeof rawPricing.title === "string"
          ? rawPricing.title
          : initialLandingContent.pricing.title,
      support:
        typeof rawPricing.support === "string"
          ? rawPricing.support
          : initialLandingContent.pricing.support,
      visible: rawPricing.visible !== false,
    },
    flow: {
      heading:
        typeof rawFlow.heading === "string"
          ? rawFlow.heading
          : typeof rawFlow.title === "string"
            ? rawFlow.title
            : initialLandingContent.flow.heading,
      support:
        typeof rawFlow.support === "string"
          ? rawFlow.support
          : initialLandingContent.flow.support,
      visible: rawFlow.visible !== false,
    },
    showcase: {
      heading:
        typeof rawShowcase.heading === "string"
          ? rawShowcase.heading
          : typeof rawShowcase.title === "string"
            ? rawShowcase.title
            : initialLandingContent.showcase.heading,
      support:
        typeof rawShowcase.support === "string"
          ? rawShowcase.support
          : initialLandingContent.showcase.support,
      visible: rawShowcase.visible !== false,
    },
    sensei: {
      heading:
        typeof rawSensei.heading === "string"
          ? rawSensei.heading
          : typeof rawSensei.title === "string"
            ? rawSensei.title
            : initialLandingContent.sensei.heading,
      support:
        typeof rawSensei.support === "string"
          ? rawSensei.support
          : initialLandingContent.sensei.support,
      visible: rawSensei.visible !== false,
    },
    testimonial: {
      heading:
        typeof rawTestimonial.heading === "string"
          ? rawTestimonial.heading
          : typeof rawTestimonial.title === "string"
            ? rawTestimonial.title
            : initialLandingContent.testimonial.heading,
      support:
        typeof rawTestimonial.support === "string"
          ? rawTestimonial.support
          : initialLandingContent.testimonial.support,
      visible: rawTestimonial.visible !== false,
    },
    article: {
      heading:
        typeof rawArticle.heading === "string"
          ? rawArticle.heading
          : typeof rawArticle.title === "string"
            ? rawArticle.title
            : initialLandingContent.article.heading,
      support:
        typeof rawArticle.support === "string"
          ? rawArticle.support
          : initialLandingContent.article.support,
      visible: rawArticle.visible !== false,
    },
    finalCta: {
      heading:
        typeof rawFinalCta.heading === "string"
          ? rawFinalCta.heading
          : typeof rawFinalCta.title === "string"
            ? rawFinalCta.title
            : initialLandingContent.finalCta.heading,
      support:
        typeof rawFinalCta.support === "string"
          ? rawFinalCta.support
          : initialLandingContent.finalCta.support,
      ctaLabel:
        typeof rawFinalCta.ctaLabel === "string"
          ? rawFinalCta.ctaLabel
          : initialLandingContent.finalCta.ctaLabel,
      ctaPath: validateInternalPath(
        rawFinalCta.ctaPath,
        initialLandingContent.finalCta.ctaPath
      ),
      visible: rawFinalCta.visible !== false,
    },
    updatedAt:
      typeof raw.updatedAt === "string" ? raw.updatedAt : initialLandingContent.updatedAt,
    publishedAt: typeof raw.publishedAt === "string" ? raw.publishedAt : undefined,
  };
}

function normalizeCampaign(val: unknown): Campaign | null {
  if (!val || typeof val !== "object") return null;
  const raw = val as Record<string, unknown>;
  const rawCodes = Array.isArray(raw.targetProgramCodes)
    ? raw.targetProgramCodes
    : Array.isArray(raw.targetPrograms)
      ? raw.targetPrograms
      : [];
  const targetProgramCodes = rawCodes.filter((code): code is CampaignProgramCode =>
    campaignProgramCodes.includes(code as CampaignProgramCode)
  );
  let targetPlan: TargetPlan = "both";
  if (typeof raw.targetPlan === "string" && targetPlans.includes(raw.targetPlan as TargetPlan)) {
    targetPlan = raw.targetPlan as TargetPlan;
  } else if (Array.isArray(raw.targetPlans)) {
    const plans = raw.targetPlans as string[];
    if (plans.includes("self_study") && plans.includes("sensei")) targetPlan = "both";
    else if (plans.includes("self_study")) targetPlan = "mandiri";
    else if (plans.includes("sensei")) targetPlan = "sensei";
  }
  const rawDiscount = typeof raw.discountType === "string" ? raw.discountType : "";
  const discountType: DiscountType = discountTypes.includes(rawDiscount as DiscountType)
    ? (rawDiscount as DiscountType)
    : "percentage";
  const rawStatus = typeof raw.status === "string" ? raw.status : "";
  const status: CampaignStatus = campaignStatuses.includes(rawStatus as CampaignStatus)
    ? (rawStatus as CampaignStatus)
    : rawStatus === "Archived"
      ? "Inactive"
      : "Draft";

  const numVal =
    typeof raw.value === "number"
      ? raw.value
      : typeof raw.discountValue === "number"
        ? raw.discountValue
        : 0;
  const rawStart =
    typeof raw.startAt === "string"
      ? raw.startAt
      : typeof raw.startDate === "string"
        ? raw.startDate
        : undefined;
  const rawEnd =
    typeof raw.endAt === "string"
      ? raw.endAt
      : typeof raw.endDate === "string"
        ? raw.endDate
        : undefined;

  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : generateId(),
    name: typeof raw.name === "string" ? raw.name : "",
    headline:
      typeof raw.headline === "string"
        ? raw.headline
        : typeof raw.name === "string"
          ? raw.name
          : "",
    description:
      typeof raw.description === "string"
        ? raw.description
        : typeof raw.bannerText === "string"
          ? raw.bannerText
          : "",
    targetProgramCodes,
    targetPlan,
    discountType,
    value: Number.isFinite(numVal) && numVal >= 0 ? numVal : 0,
    startAt: rawStart && !Number.isNaN(new Date(rawStart).getTime()) ? rawStart : undefined,
    endAt: rawEnd && !Number.isNaN(new Date(rawEnd).getTime()) ? rawEnd : undefined,
    badgeText:
      typeof raw.badgeText === "string"
        ? raw.badgeText
        : typeof raw.bannerText === "string"
          ? raw.bannerText
          : "",
    ctaLabel:
      typeof raw.ctaLabel === "string" && raw.ctaLabel.trim()
        ? raw.ctaLabel.trim()
        : typeof raw.ctaText === "string" && raw.ctaText.trim()
          ? raw.ctaText.trim()
          : undefined,
    status,
  };
}

function normalizeArticle(val: unknown): Article | null {
  if (!val || typeof val !== "object") return null;
  const raw = val as Record<string, unknown>;
  const rawTitle = typeof raw.title === "string" ? raw.title : "";
  const rawSlug = typeof raw.slug === "string" ? raw.slug : "";
  const slug = validateSlug(rawSlug) ? rawSlug : suggestSlug(rawSlug || rawTitle) || generateId();
  const rawBlocks = Array.isArray(raw.blocks) ? raw.blocks : [];
  const blocks = rawBlocks
    .map(normalizeArticleBlock)
    .filter((b): b is ArticleBlock => b !== null);
  const rawStatus = typeof raw.status === "string" ? raw.status : "";
  const status: ArticleStatus = articleStatuses.includes(rawStatus as ArticleStatus)
    ? (rawStatus as ArticleStatus)
    : "Draft";

  const rawSeo =
    raw.seo && typeof raw.seo === "object" ? (raw.seo as Record<string, unknown>) : {};
  const rawSummary =
    typeof raw.summary === "string"
      ? raw.summary
      : typeof raw.excerpt === "string"
        ? raw.excerpt
        : "";
  const candidateImage =
    typeof raw.imageUrl === "string"
      ? raw.imageUrl
      : typeof raw.coverImage === "string"
        ? raw.coverImage
        : "";
  const rawImage = candidateImage === "/showcase/dashboard-showcase.png" ? "" : candidateImage;
  const rawImageAlt =
    typeof raw.imageAlt === "string"
      ? raw.imageAlt
      : typeof raw.coverImageAlt === "string"
        ? raw.coverImageAlt
        : "";

  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : generateId(),
    title: rawTitle,
    slug,
    summary: rawSummary,
    category: typeof raw.category === "string" ? raw.category : "",
    author: typeof raw.author === "string" ? raw.author : "",
    imageUrl: rawImage,
    imageAlt: rawImageAlt,
    blocks,
    seoTitle:
      typeof raw.seoTitle === "string"
        ? raw.seoTitle
        : typeof rawSeo.metaTitle === "string"
          ? rawSeo.metaTitle
          : "",
    metaDescription:
      typeof raw.metaDescription === "string"
        ? raw.metaDescription
        : typeof rawSeo.metaDescription === "string"
          ? rawSeo.metaDescription
          : "",
    canonicalUrl:
      typeof raw.canonicalUrl === "string"
        ? raw.canonicalUrl
        : typeof rawSeo.canonicalUrl === "string"
          ? rawSeo.canonicalUrl
          : "",
    indexable: raw.indexable !== false,
    ogImage:
      typeof raw.ogImage === "string"
        ? raw.ogImage
        : typeof rawSeo.ogImage === "string"
          ? rawSeo.ogImage
          : "",
    ogTitle: typeof raw.ogTitle === "string" ? raw.ogTitle : "",
    ogDescription: typeof raw.ogDescription === "string" ? raw.ogDescription : "",
    status,
    updatedAt:
      typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
    publishedAt:
      typeof raw.publishedAt === "string" && !Number.isNaN(new Date(raw.publishedAt).getTime())
        ? raw.publishedAt
        : undefined,
  };
}

function normalizeTestimonial(val: unknown): Testimonial | null {
  if (!val || typeof val !== "object") return null;
  const raw = val as Record<string, unknown>;
  const rawConsent =
    typeof raw.consent === "string"
      ? raw.consent
      : raw.hasConsent === true
        ? "Approved"
        : "";
  const consent: TestimonialConsent = testimonialConsents.includes(
    rawConsent as TestimonialConsent
  )
    ? (rawConsent as TestimonialConsent)
    : "Pending";
  const rawStatus = typeof raw.status === "string" ? raw.status : "";
  const status: TestimonialStatus = testimonialStatuses.includes(
    rawStatus as TestimonialStatus
  )
    ? (rawStatus as TestimonialStatus)
    : "Draft";

  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : generateId(),
    name: typeof raw.name === "string" ? raw.name : "",
    context:
      typeof raw.context === "string"
        ? raw.context
        : typeof raw.membership === "string"
          ? raw.membership
          : "",
    quote: typeof raw.quote === "string" ? raw.quote : "",
    photoUrl:
      typeof raw.photoUrl === "string"
        ? raw.photoUrl
        : typeof raw.avatarSrc === "string"
          ? raw.avatarSrc
          : "",
    videoUrl:
      typeof raw.videoUrl === "string"
        ? raw.videoUrl
        : typeof raw.videoSrc === "string"
          ? raw.videoSrc
          : "",
    consent,
    featured: raw.featured === true || raw.isFeatured === true,
    sortOrder:
      typeof raw.sortOrder === "number" && Number.isFinite(raw.sortOrder)
        ? raw.sortOrder
        : 0,
    status,
  };
}

function normalizeAnnouncement(val: unknown): Announcement | null {
  if (!val || typeof val !== "object") return null;
  const raw = val as Record<string, unknown>;
  const rawPriority = typeof raw.priority === "string" ? raw.priority.toLowerCase() : "";
  const priority: AnnouncementPriority =
    rawPriority === "important" || rawPriority === "urgent" || raw.priority === "Important"
      ? "Important"
      : "Normal";
  const rawAudience = typeof raw.audience === "string" ? raw.audience.toLowerCase() : "";
  const audience: AnnouncementAudience = announcementAudiences.includes(
    rawAudience as AnnouncementAudience
  )
    ? (rawAudience as AnnouncementAudience)
    : "all";
  const rawStatus = typeof raw.status === "string" ? raw.status : "";
  const status: AnnouncementStatus = announcementStatuses.includes(
    rawStatus as AnnouncementStatus
  )
    ? (rawStatus as AnnouncementStatus)
    : "Draft";

  const content =
    typeof raw.content === "string"
      ? raw.content
      : typeof raw.summary === "string"
        ? raw.summary
        : typeof raw.body === "string"
          ? raw.body
          : "";
  const rawStart =
    typeof raw.startAt === "string"
      ? raw.startAt
      : typeof raw.startDate === "string"
        ? raw.startDate
        : undefined;
  const rawEnd =
    typeof raw.endAt === "string"
      ? raw.endAt
      : typeof raw.endDate === "string"
        ? raw.endDate
        : undefined;
  const ctaLabel =
    typeof raw.ctaLabel === "string" && raw.ctaLabel.trim()
      ? raw.ctaLabel.trim()
      : typeof raw.ctaText === "string" && raw.ctaText.trim()
        ? raw.ctaText.trim()
        : undefined;
  const ctaPath =
    typeof raw.ctaPath === "string"
      ? validateInternalPath(raw.ctaPath)
      : typeof raw.ctaUrl === "string"
        ? validateInternalPath(raw.ctaUrl)
        : undefined;

  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : generateId(),
    title: typeof raw.title === "string" ? raw.title : "",
    content,
    priority,
    audience,
    ctaLabel,
    ctaPath,
    startAt: rawStart && !Number.isNaN(new Date(rawStart).getTime()) ? rawStart : undefined,
    endAt: rawEnd && !Number.isNaN(new Date(rawEnd).getTime()) ? rawEnd : undefined,
    status,
  };
}

export function normalizeWebsiteStore(raw: unknown): WebsiteStore {
  if (!raw || typeof raw !== "object") return createInitialWebsiteStore();
  const obj = raw as Record<string, unknown>;

  let landing: LandingContent;
  if (
    Array.isArray(obj.publishedLandingSections) &&
    obj.publishedLandingSections.length > 0
  ) {
    landing = normalizeSectionsToLanding(obj.publishedLandingSections);
  } else {
    landing = normalizeLandingContent(obj.landing);
  }

  const campaignIds = new Set<string>();
  const rawCampaigns = Array.isArray(obj.campaigns) ? obj.campaigns : [];
  const campaigns = rawCampaigns
    .map(normalizeCampaign)
    .filter((c): c is Campaign => c !== null)
    .map((c) => {
      const uniqueId = c.id && !campaignIds.has(c.id) ? c.id : generateId();
      campaignIds.add(uniqueId);
      return { ...c, id: uniqueId };
    });

  const articleIds = new Set<string>();
  const articleSlugs = new Set<string>();
  const rawArticles = Array.isArray(obj.articles)
    ? obj.articles
    : Array.isArray(obj.blogs)
      ? obj.blogs
      : [];
  const articles = rawArticles
    .map(normalizeArticle)
    .filter((a): a is Article => a !== null)
    .map((a) => {
      const uniqueId = a.id && !articleIds.has(a.id) ? a.id : generateId();
      articleIds.add(uniqueId);
      let uniqueSlug = a.slug;
      let counter = 2;
      while (articleSlugs.has(uniqueSlug)) {
        uniqueSlug = `${a.slug}-${counter}`;
        counter++;
      }
      articleSlugs.add(uniqueSlug);
      return { ...a, id: uniqueId, slug: uniqueSlug };
    });

  const testimonialIds = new Set<string>();
  const rawTestimonials = Array.isArray(obj.testimonials) ? obj.testimonials : [];
  const testimonials = rawTestimonials
    .map(normalizeTestimonial)
    .filter((t): t is Testimonial => t !== null)
    .map((t) => {
      const uniqueId = t.id && !testimonialIds.has(t.id) ? t.id : generateId();
      testimonialIds.add(uniqueId);
      return { ...t, id: uniqueId };
    });

  const announcementIds = new Set<string>();
  const rawAnnouncements = Array.isArray(obj.announcements) ? obj.announcements : [];
  const announcements = rawAnnouncements
    .map(normalizeAnnouncement)
    .filter((an): an is Announcement => an !== null)
    .map((an) => {
      const uniqueId = an.id && !announcementIds.has(an.id) ? an.id : generateId();
      announcementIds.add(uniqueId);
      return { ...an, id: uniqueId };
    });

  return {
    version: 1,
    landing,
    campaigns,
    articles,
    blogs: articles,
    testimonials,
    announcements,
  };
}

function announceWebsiteChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(WEBSITE_CHANGE_EVENT));
  }
}

export function readWebsiteStore(
  storage: Pick<Storage, "getItem"> | null = typeof window !== "undefined"
    ? window.localStorage
    : null
): WebsiteStore {
  if (!storage) return createInitialWebsiteStore();
  try {
    const raw = storage.getItem(WEBSITE_STORAGE_KEY);
    if (!raw) return createInitialWebsiteStore();
    return normalizeWebsiteStore(JSON.parse(raw));
  } catch {
    return createInitialWebsiteStore();
  }
}

export function saveWebsiteStore(
  store: WebsiteStore,
  storage: Pick<Storage, "setItem"> | null = typeof window !== "undefined"
    ? window.localStorage
    : null
): void {
  if (!storage) return;
  const normalized = normalizeWebsiteStore(store);
  storage.setItem(WEBSITE_STORAGE_KEY, JSON.stringify(normalized));
  announceWebsiteChange();
}

export function resetWebsiteStore(
  storage: Pick<Storage, "setItem"> | null = typeof window !== "undefined"
    ? window.localStorage
    : null
): WebsiteStore {
  const initial = createInitialWebsiteStore();
  if (storage) {
    storage.setItem(WEBSITE_STORAGE_KEY, JSON.stringify(initial));
    announceWebsiteChange();
  }
  return initial;
}

export function readLandingContent(
  storage?: Pick<Storage, "getItem"> | null
): LandingContent {
  return readWebsiteStore(storage).landing;
}

export function saveLandingContent(
  content: LandingContent,
  storage: Pick<Storage, "getItem" | "setItem"> | null = typeof window !== "undefined"
    ? window.localStorage
    : null
): LandingContent {
  const current = readWebsiteStore(storage);
  const updated: LandingContent = {
    ...content,
    updatedAt: new Date().toISOString(),
  };
  saveWebsiteStore({ ...current, landing: updated }, storage);
  return updated;
}

export function publishLandingContent(
  storage: Pick<Storage, "getItem" | "setItem"> | null = typeof window !== "undefined"
    ? window.localStorage
    : null
): LandingContent {
  const current = readWebsiteStore(storage);
  const now = new Date().toISOString();
  const updated: LandingContent = {
    ...current.landing,
    status: "Published",
    updatedAt: now,
    publishedAt: now,
  };
  saveWebsiteStore({ ...current, landing: updated }, storage);
  return updated;
}

export function readCampaigns(storage?: Pick<Storage, "getItem"> | null): Campaign[] {
  return readWebsiteStore(storage).campaigns;
}

export function readCampaign(
  id: string,
  storage?: Pick<Storage, "getItem"> | null
): Campaign | undefined {
  return readCampaigns(storage).find((c) => c.id === id);
}

export function saveCampaign(
  campaign: Campaign,
  storage: Pick<Storage, "getItem" | "setItem"> | null = typeof window !== "undefined"
    ? window.localStorage
    : null
): Campaign {
  const current = readWebsiteStore(storage);
  const existingIndex = current.campaigns.findIndex((c) => c.id === campaign.id);
  const next: Campaign = { ...campaign, id: campaign.id || generateId() };
  const updatedCampaigns =
    existingIndex >= 0
      ? current.campaigns.map((c, i) => (i === existingIndex ? next : c))
      : [next, ...current.campaigns];
  saveWebsiteStore({ ...current, campaigns: updatedCampaigns }, storage);
  return next;
}

export function deleteCampaign(
  id: string,
  storage: Pick<Storage, "getItem" | "setItem"> | null = typeof window !== "undefined"
    ? window.localStorage
    : null
): void {
  const current = readWebsiteStore(storage);
  saveWebsiteStore(
    { ...current, campaigns: current.campaigns.filter((c) => c.id !== id) },
    storage
  );
}

export function readArticles(storage?: Pick<Storage, "getItem"> | null): Article[] {
  return readWebsiteStore(storage).articles;
}

export function readArticle(
  id: string,
  storage?: Pick<Storage, "getItem"> | null
): Article | undefined {
  return readArticles(storage).find((a) => a.id === id);
}

export function readArticleBySlug(
  slug: string,
  storage?: Pick<Storage, "getItem"> | null
): Article | undefined {
  return readArticles(storage).find((a) => a.slug === slug);
}

export function saveArticle(
  article: Article,
  storage: Pick<Storage, "getItem" | "setItem"> | null = typeof window !== "undefined"
    ? window.localStorage
    : null
): Article {
  const current = readWebsiteStore(storage);
  const now = new Date().toISOString();
  const existingIndex = current.articles.findIndex((a) => a.id === article.id);
  const next: Article = {
    ...article,
    id: article.id || generateId(),
    slug: validateSlug(article.slug)
      ? article.slug
      : suggestSlug(article.slug || article.title) || generateId(),
    updatedAt: now,
    publishedAt:
      article.status === "Published"
        ? article.publishedAt || now
        : article.publishedAt,
  };
  const updatedArticles =
    existingIndex >= 0
      ? current.articles.map((a, i) => (i === existingIndex ? next : a))
      : [next, ...current.articles];
  saveWebsiteStore({ ...current, articles: updatedArticles }, storage);
  return next;
}

export function deleteArticle(
  id: string,
  storage: Pick<Storage, "getItem" | "setItem"> | null = typeof window !== "undefined"
    ? window.localStorage
    : null
): void {
  const current = readWebsiteStore(storage);
  saveWebsiteStore(
    { ...current, articles: current.articles.filter((a) => a.id !== id) },
    storage
  );
}

export function readTestimonials(storage?: Pick<Storage, "getItem"> | null): Testimonial[] {
  return readWebsiteStore(storage).testimonials;
}

export function readTestimonial(
  id: string,
  storage?: Pick<Storage, "getItem"> | null
): Testimonial | undefined {
  return readTestimonials(storage).find((t) => t.id === id);
}

export function saveTestimonial(
  testimonial: Testimonial,
  storage: Pick<Storage, "getItem" | "setItem"> | null = typeof window !== "undefined"
    ? window.localStorage
    : null
): Testimonial {
  const current = readWebsiteStore(storage);
  const existingIndex = current.testimonials.findIndex((t) => t.id === testimonial.id);
  const next: Testimonial = { ...testimonial, id: testimonial.id || generateId() };
  const updatedTestimonials =
    existingIndex >= 0
      ? current.testimonials.map((t, i) => (i === existingIndex ? next : t))
      : [next, ...current.testimonials];
  saveWebsiteStore({ ...current, testimonials: updatedTestimonials }, storage);
  return next;
}

export function deleteTestimonial(
  id: string,
  storage: Pick<Storage, "getItem" | "setItem"> | null = typeof window !== "undefined"
    ? window.localStorage
    : null
): void {
  const current = readWebsiteStore(storage);
  saveWebsiteStore(
    { ...current, testimonials: current.testimonials.filter((t) => t.id !== id) },
    storage
  );
}

export function readAnnouncements(storage?: Pick<Storage, "getItem"> | null): Announcement[] {
  return readWebsiteStore(storage).announcements;
}

export function readAnnouncement(
  id: string,
  storage?: Pick<Storage, "getItem"> | null
): Announcement | undefined {
  return readAnnouncements(storage).find((a) => a.id === id);
}

export function saveAnnouncement(
  announcement: Announcement,
  storage: Pick<Storage, "getItem" | "setItem"> | null = typeof window !== "undefined"
    ? window.localStorage
    : null
): Announcement {
  const current = readWebsiteStore(storage);
  const existingIndex = current.announcements.findIndex((a) => a.id === announcement.id);
  const next: Announcement = { ...announcement, id: announcement.id || generateId() };
  const updatedAnnouncements =
    existingIndex >= 0
      ? current.announcements.map((a, i) => (i === existingIndex ? next : a))
      : [next, ...current.announcements];
  saveWebsiteStore({ ...current, announcements: updatedAnnouncements }, storage);
  return next;
}

export function deleteAnnouncement(
  id: string,
  storage: Pick<Storage, "getItem" | "setItem"> | null = typeof window !== "undefined"
    ? window.localStorage
    : null
): void {
  const current = readWebsiteStore(storage);
  saveWebsiteStore(
    { ...current, announcements: current.announcements.filter((a) => a.id !== id) },
    storage
  );
}

let adminCachedRaw: string | null | undefined;
let adminCachedStore: WebsiteStore = createInitialWebsiteStore();
const serverStoreSnapshot: WebsiteStore = createInitialWebsiteStore();

function readAdminWebsiteClient(): WebsiteStore {
  if (typeof window === "undefined") {
    return serverStoreSnapshot;
  }
  const raw = localStorage.getItem(WEBSITE_STORAGE_KEY);
  if (raw !== adminCachedRaw) {
    adminCachedRaw = raw;
    adminCachedStore = readWebsiteStore();
  }
  return adminCachedStore;
}

function subscribeWebsiteStore(onStoreChange: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === WEBSITE_STORAGE_KEY) {
      adminCachedRaw = undefined;
      onStoreChange();
    }
  };
  const handleCustom = () => {
    adminCachedRaw = undefined;
    onStoreChange();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(WEBSITE_CHANGE_EVENT, handleCustom);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(WEBSITE_CHANGE_EVENT, handleCustom);
  };
}

export function useAdminWebsiteStore(): WebsiteStore {
  return useSyncExternalStore(
    subscribeWebsiteStore,
    readAdminWebsiteClient,
    () => serverStoreSnapshot
  );
}
