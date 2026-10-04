"use client";

import { contentMedia, useContent, type ArticleContent, type TestimonialContent } from "@/lib/public-content-api";
import {
  LANDING_SECTION_ORDER,
  type LandingSectionKey,
  type CampaignProgramCode,
  type TargetPlan,
  type DiscountType,
  type ArticleBlock,
  type AnnouncementPriority,
  type AnnouncementAudience,
  type LandingContent,
  type Campaign,
  type Article,
  type Testimonial,
  type Announcement,
  type WebsiteStore,
  createInitialWebsiteStore,
  initialLandingContent,
  isDateWithinWindow,
  readWebsiteStore,
} from "@/lib/admin-website-store";

export { LANDING_SECTION_ORDER, type LandingSectionKey };

export type PublishedLanding = {
  hero: {
    eyebrow: string;
    heading: string;
    support: string;
    primaryCtaLabel: string;
    primaryCtaPath: string;
    secondaryCtaLabel: string;
    secondaryCtaPath: string;
  };
  pricing: {
    title: string;
    support: string;
    visible: boolean;
  };
  flow: {
    heading: string;
    support: string;
    visible: boolean;
  };
  showcase: {
    heading: string;
    support: string;
    visible: boolean;
  };
  sensei: {
    heading: string;
    support: string;
    visible: boolean;
  };
  testimonial: {
    heading: string;
    support: string;
    visible: boolean;
  };
  article: {
    heading: string;
    support: string;
    visible: boolean;
  };
  finalCta: {
    heading: string;
    support: string;
    ctaLabel: string;
    ctaPath: string;
    visible: boolean;
  };
};

export type PublishedCampaign = {
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
};

export type PublishedArticle = {
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
  updatedAt: string;
  publishedAt?: string;
};

export type PublishedTestimonial = {
  id: string;
  name: string;
  context: string;
  quote: string;
  photoUrl: string;
  videoUrl: string;
  featured: boolean;
  sortOrder: number;
};

export type PublishedAnnouncement = {
  id: string;
  title: string;
  content: string;
  priority: AnnouncementPriority;
  audience: AnnouncementAudience;
  ctaLabel?: string;
  ctaPath?: string;
  startAt?: string;
  endAt?: string;
};

export type PublishedWebsite = {
  landing: PublishedLanding;
  campaigns: PublishedCampaign[];
  articles: PublishedArticle[];
  testimonials: PublishedTestimonial[];
  featuredTestimonials: PublishedTestimonial[];
  announcements: PublishedAnnouncement[];
};

export function toPublishedLanding(content: LandingContent): PublishedLanding {
  return {
    hero: { ...content.hero },
    pricing: { ...content.pricing },
    flow: { ...content.flow },
    showcase: { ...content.showcase },
    sensei: { ...content.sensei },
    testimonial: { ...content.testimonial },
    article: { ...content.article },
    finalCta: { ...content.finalCta },
  };
}

export function toPublishedCampaign(item: Campaign): PublishedCampaign {
  return {
    id: item.id,
    name: item.name,
    headline: item.headline,
    description: item.description,
    targetProgramCodes: [...item.targetProgramCodes],
    targetPlan: item.targetPlan,
    discountType: item.discountType,
    value: item.value,
    startAt: item.startAt,
    endAt: item.endAt,
    badgeText: item.badgeText,
    ctaLabel: item.ctaLabel,
  };
}

export function toPublishedArticle(item: Article): PublishedArticle {
  return {
    id: item.id,
    title: item.title,
    slug: item.slug,
    summary: item.summary,
    category: item.category,
    author: item.author,
    imageUrl: item.imageUrl,
    imageAlt: item.imageAlt,
    blocks: item.blocks.map((b) => ({ ...b })),
    seoTitle: item.seoTitle,
    metaDescription: item.metaDescription,
    canonicalUrl: item.canonicalUrl,
    indexable: item.indexable,
    ogImage: item.ogImage,
    ogTitle: item.ogTitle,
    ogDescription: item.ogDescription,
    updatedAt: item.updatedAt,
    publishedAt: item.publishedAt,
  };
}

export function toPublishedTestimonial(item: Testimonial): PublishedTestimonial {
  return {
    id: item.id,
    name: item.name,
    context: item.context,
    quote: item.quote,
    photoUrl: item.photoUrl,
    videoUrl: item.videoUrl,
    featured: item.featured,
    sortOrder: item.sortOrder,
  };
}

export function toPublishedAnnouncement(item: Announcement): PublishedAnnouncement {
  return {
    id: item.id,
    title: item.title,
    content: item.content,
    priority: item.priority,
    audience: item.audience,
    ctaLabel: item.ctaLabel,
    ctaPath: item.ctaPath,
    startAt: item.startAt,
    endAt: item.endAt,
  };
}

export function extractPublishedWebsite(
  store: WebsiteStore,
  now: Date | string | number = Date.now()
): PublishedWebsite {
  const landing = toPublishedLanding(initialLandingContent);

  const campaigns = store.campaigns
    .filter((c) => c.status === "Published" && isDateWithinWindow(c.startAt, c.endAt, now))
    .map(toPublishedCampaign);

  const articles = store.articles
    .filter((a) => a.status === "Published")
    .sort((a, b) => {
      const timeA = new Date(a.publishedAt || a.updatedAt).getTime();
      const timeB = new Date(b.publishedAt || b.updatedAt).getTime();
      return timeB - timeA;
    })
    .map(toPublishedArticle);

  const testimonials = store.testimonials
    .filter((t) => t.consent === "Approved" && t.status === "Published")
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(toPublishedTestimonial);

  const featuredTestimonials = testimonials.filter((t) => t.featured);

  const announcements = store.announcements
    .filter((an) => an.status === "Published" && isDateWithinWindow(an.startAt, an.endAt, now))
    .map(toPublishedAnnouncement);

  return {
    landing,
    campaigns,
    articles,
    testimonials,
    featuredTestimonials,
    announcements,
  };
}

export function readPublishedLanding(): PublishedLanding {
  if (typeof window === "undefined") {
    return toPublishedLanding(initialLandingContent);
  }
  return toPublishedLanding(initialLandingContent);
}

export function readActiveCampaigns(options?: {
  programCode?: CampaignProgramCode;
  plan?: TargetPlan;
  now?: Date | string | number;
}): PublishedCampaign[] {
  const now = options?.now ?? Date.now();
  const store = typeof window === "undefined" ? createInitialWebsiteStore() : readWebsiteStore();
  return store.campaigns
    .filter((c) => {
      if (c.status !== "Published") return false;
      if (!isDateWithinWindow(c.startAt, c.endAt, now)) return false;
      if (options?.programCode && !c.targetProgramCodes.includes(options.programCode)) {
        return false;
      }
      if (options?.plan && c.targetPlan !== "both" && c.targetPlan !== options.plan) {
        return false;
      }
      return true;
    })
    .map(toPublishedCampaign);
}

export function readPublishedArticles(category?: string): PublishedArticle[] {
  const store = typeof window === "undefined" ? createInitialWebsiteStore() : readWebsiteStore();
  return store.articles
    .filter((a) => {
      if (a.status !== "Published") return false;
      if (category && a.category !== category) return false;
      return true;
    })
    .sort((a, b) => {
      const timeA = new Date(a.publishedAt || a.updatedAt).getTime();
      const timeB = new Date(b.publishedAt || b.updatedAt).getTime();
      return timeB - timeA;
    })
    .map(toPublishedArticle);
}

export function readPublishedArticleBySlug(slug: string): PublishedArticle | undefined {
  const store = typeof window === "undefined" ? createInitialWebsiteStore() : readWebsiteStore();
  const found = store.articles.find((a) => a.slug === slug && a.status === "Published");
  return found ? toPublishedArticle(found) : undefined;
}

export function readPublishedTestimonials(options?: {
  featuredOnly?: boolean;
}): PublishedTestimonial[] {
  const store = typeof window === "undefined" ? createInitialWebsiteStore() : readWebsiteStore();
  return store.testimonials
    .filter((t) => {
      if (t.consent !== "Approved" || t.status !== "Published") return false;
      if (options?.featuredOnly && !t.featured) return false;
      return true;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(toPublishedTestimonial);
}

export function readFeaturedTestimonials(): PublishedTestimonial[] {
  return readPublishedTestimonials({ featuredOnly: true });
}

export function readAllPublishedTestimonials(): PublishedTestimonial[] {
  return readPublishedTestimonials();
}

export function readPublishedAnnouncements(
  membership?: AnnouncementAudience,
  now: Date | string | number = Date.now()
): PublishedAnnouncement[] {
  const store = typeof window === "undefined" ? createInitialWebsiteStore() : readWebsiteStore();
  return store.announcements
    .filter((an) => {
      if (an.status !== "Published") return false;
      if (!isDateWithinWindow(an.startAt, an.endAt, now)) return false;
      if (membership && membership !== "all") {
        if (an.audience !== "all" && an.audience !== membership) return false;
      }
      return true;
    })
    .map(toPublishedAnnouncement);
}

export function readPublishedWebsite(now?: Date | string | number): PublishedWebsite {
  const store = typeof window === "undefined" ? createInitialWebsiteStore() : readWebsiteStore();
  return extractPublishedWebsite(store, now);
}

export function usePublishedWebsite(): PublishedWebsite {
  return { landing: toPublishedLanding(initialLandingContent), campaigns: [], articles: usePublishedArticles(), testimonials: usePublishedTestimonials(), featuredTestimonials: usePublishedTestimonials({ featuredOnly: true }), announcements: [] };
}

export function usePublishedLanding(): PublishedLanding {
  return toPublishedLanding(initialLandingContent);
}

export function usePublishedCampaigns(options?: {
  programCode?: CampaignProgramCode;
  plan?: TargetPlan;
}): PublishedCampaign[] {
  const website = usePublishedWebsite();
  return website.campaigns.filter((c) => {
    if (options?.programCode && !c.targetProgramCodes.includes(options.programCode)) {
      return false;
    }
    if (options?.plan && c.targetPlan !== "both" && c.targetPlan !== options.plan) {
      return false;
    }
    return true;
  });
}

export function usePublishedTestimonials(options?: {
  featuredOnly?: boolean;
}): PublishedTestimonial[] {
  const content = useContent<TestimonialContent>(`/api/testimonials${options?.featuredOnly ? "?landing=true" : ""}`);
  return content.data.map(item => ({ id: String(item.id), name: item.name, context: item.context, quote: item.quote, photoUrl: contentMedia(item.image), videoUrl: item.video_url ?? "", featured: Boolean(options?.featuredOnly), sortOrder: 0 }));
}

export function usePublishedArticles(category?: string): PublishedArticle[] {
  const content = useContent<ArticleContent>("/api/blog");
  return content.data.filter(item => !category || category === "Semua" || item.category === category).map(item => ({ id: String(item.id), title: item.title, slug: item.slug, summary: item.excerpt ?? "", category: item.category, author: item.author, imageUrl: contentMedia(item.thumbnail), imageAlt: item.title, blocks: item.body.split(/\n\s*\n/).map((text, index) => ({ id: String(index), type: "paragraph" as const, text })), seoTitle: item.seo_title ?? "", metaDescription: item.meta_description ?? "", canonicalUrl: "", indexable: true, ogImage: "", ogTitle: "", ogDescription: "", updatedAt: "", publishedAt: item.published_at ?? undefined }));
}

export function usePublishedAnnouncements(
  membership?: AnnouncementAudience
): PublishedAnnouncement[] {
  const website = usePublishedWebsite();
  if (!membership || membership === "all") return website.announcements;
  return website.announcements.filter(
    (an) => an.audience === "all" || an.audience === membership
  );
}
