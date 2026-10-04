import type { Membership } from "@/lib/dashboard-mock";

export type LevelAccess = "owned" | "notPurchased" | "freePreview";
export type CohortState = "active" | "none";
export type LevelProgression = "current" | "available";
export type ChapterState = "completed" | "current" | "available" | "progressionLocked" | "entitlementLocked" | "finalPreview";

export type JourneyLevel = {
  slug: string;
  code: string;
  title: string;
  description: string;
  access: LevelAccess;
  cohort: CohortState;
  progression: LevelProgression;
  statusLabel: string;
  actionLabel: string;
};

export type ProgressComponent = { label: string; weight: number; complete: boolean };

export type JourneyChapter = {
  key: string;
  orderLabel: string;
  title: string;
  description: string;
  state: ChapterState;
  statusLabel: string;
  progress: number;
  components: ProgressComponent[];
  checkpointUnlocked: boolean;
  href?: string;
};

const baseLevels = [
  ["dasar", "DASAR", "Dasar Bahasa Jepang", "Hiragana, Katakana, salam, dan pola dasar pemula."],
  ["n5", "N5", "JLPT N5", "Tata bahasa dasar, kanji pemula, dan percakapan harian."],
  ["n4", "N4", "JLPT N4", "Pola kalimat lanjutan, kanji esensial, dan percakapan kontekstual."],
  ["n3", "N3", "JLPT N3", "Tata bahasa menengah, teks umum, dan kemampuan komunikasi."],
  ["n2", "N2", "JLPT N2", "Tata bahasa kompleks, artikel opini, dan pemahaman profesional."],
  ["n1", "N1", "JLPT N1", "Nuansa bahasa tingkat tinggi, teks kompleks, dan strategi JLPT N1."],
  ["ssw-pengolahan-makanan", "SSW", "SSW Pengolahan Makanan", "SOP industri makanan Jepang, higienitas, dan instruksi lapangan."],
  ["interview", "INTERVIEW", "Persiapan Interview", "Etika wawancara kerja, motivasi, dan simulasi profesional."],
] as const;

export const jlptLevels = ["N5", "N4", "N3", "N2", "N1"] as const;

export function getDefaultPurchasedLevel(membership: Membership): string | undefined {
  void membership;
  return undefined;
}

export function hasFullLearningAccess(code: string, purchasedLevel?: string, standalonePrograms: readonly string[] = []): boolean {
  const normalized = code.toUpperCase();
  const purchased = purchasedLevel?.toUpperCase();
  if (normalized === "SSW" || normalized === "INTERVIEW") return standalonePrograms.includes(normalized);
  if (normalized === "DASAR") return Boolean(purchased && jlptLevels.includes(purchased as (typeof jlptLevels)[number]));
  const purchasedIndex = jlptLevels.indexOf(purchased as (typeof jlptLevels)[number]);
  const requestedIndex = jlptLevels.indexOf(normalized as (typeof jlptLevels)[number]);
  return purchasedIndex >= 0 && requestedIndex >= 0 && requestedIndex <= purchasedIndex;
}

export function getJourneyLevels(membership: Membership, purchasedLevel = getDefaultPurchasedLevel(membership), standalonePrograms: readonly string[] = []): JourneyLevel[] {
  return baseLevels.map(([slug, code, title, desc]) => {
    const previewEligible = code === "DASAR" || jlptLevels.includes(code as (typeof jlptLevels)[number]);
    const owned = membership !== "free" && hasFullLearningAccess(code, purchasedLevel, standalonePrograms);
    const access: LevelAccess = owned ? "owned" : previewEligible ? "freePreview" : "notPurchased";
    const progression: LevelProgression = purchasedLevel?.toUpperCase() === code ? "current" : "available";
    return {
      slug,
      code,
      title,
      description: access === "freePreview" ? "Chapter 1 tersedia sebagai akses preview pada level ini." : desc,
      access,
      cohort: membership === "sensei" && progression === "current" ? "active" : "none",
      progression,
      statusLabel: owned ? (progression === "current" ? "SEDANG DIPELAJARI" : "LEVEL DIMILIKI") : access === "freePreview" ? "CHAPTER 1 TERSEDIA" : "TERKUNCI",
      actionLabel: owned ? "Buka perjalanan" : access === "freePreview" ? "Buka Chapter 1" : "Upgrade Membership",
    };
  });
}

const dasarComponents = [["Video", 25], ["Modul PDF", 25], ["Flashcard", 25], ["Checkpoint", 25]] as const;
const standardComponents = [["Video", 20], ["Modul PDF", 5], ["Flashcard", 20], ["Audio", 20], ["Reading", 20], ["Checkpoint", 15]] as const;

function chapterComponents(levelSlug: string, number: number, state: ChapterState): ProgressComponent[] {
  const seeds = levelSlug === "dasar" || levelSlug === "ssw-pengolahan-makanan" ? dasarComponents : standardComponents;
  return seeds.map(([label, weight]) => ({ label, weight, complete: state === "completed" || (state === "current" && label !== "Checkpoint" && number === 1) }));
}

function chapterProgress(components: ProgressComponent[]) {
  return components.reduce((total, component) => total + (component.complete ? component.weight : 0), 0);
}

const senseiChapterSeeds = [
  ["chapter-1", "01", "Tata Bahasa Dasar N4", "completed", "Selesai"],
  ["chapter-2", "02", "Transportasi dan Arah", "completed", "Selesai"],
  ["chapter-3", "03", "Aktivitas Harian", "completed", "Selesai"],
  ["chapter-4", "04", "Pola Kalimat & Kehidupan", "current", "Lanjutkan"],
  ["chapter-5", "05", "Kesehatan dan Kondisi", "progressionLocked", "Terkunci"],
] as const;

export function getJourneyChapters(membership: Membership, level: JourneyLevel): JourneyChapter[] {
  if (level.access === "freePreview") {
    return [1, 2, 3, 4, 5].map((number) => {
      const state: ChapterState = number === 1 ? "current" : "entitlementLocked";
      return {
        key: `chapter-${number}`,
        orderLabel: String(number).padStart(2, "0"),
        title: `${level.code} | Chapter ${number}`,
        description: "Video | modul | flashcard | audio | reading | checkpoint",
        state,
        statusLabel: number === 1 ? "Buka Chapter 1" : "Terkunci • Upgrade",
        progress: 0,
        components: chapterComponents(level.slug, number, state),
        checkpointUnlocked: number === 1,
        href: number === 1 ? `/learn/${level.slug}/chapter-1?membership=${membership}` : undefined,
      };
    });
  }

  if (level.access === "notPurchased") {
    return [1, 2, 3, 4, 5].map((number) => ({
      key: `chapter-${number}`,
      orderLabel: String(number).padStart(2, "0"),
      title: `${level.code} • Chapter ${number}`,
      description: "Video | modul | flashcard | audio | reading | checkpoint",
      state: "entitlementLocked" as ChapterState,
      statusLabel: "Terkunci • Upgrade",
      progress: 0,
      components: chapterComponents(level.slug, number, "entitlementLocked"),
      checkpointUnlocked: false,
    }));
  }

  if (membership === "sensei" && level.cohort === "active") {
    return [
      ...senseiChapterSeeds.map(([key, orderLabel, title, state, statusLabel]) => ({
        key,
        orderLabel,
        title: level.slug === "n4" ? title : `${level.code} • ${title}`,
        description: "Video | modul | flashcard | audio | reading | checkpoint",
        state,
        statusLabel,
        progress: state === "completed" ? 100 : state === "current" ? 60 : 0,
        components: chapterComponents(level.slug, Number(orderLabel), state),
        checkpointUnlocked: state === "completed" || state === "current",
        href: state === "completed" ? `/learn/${level.slug}/${key}?membership=sensei` : state === "current" ? `/learn/${level.slug}/chapter-4?membership=sensei` : undefined,
      })),
      { key: "chapter-12", orderLabel: "12", title: "Chapter Terakhir — Penyelesaian Level", description: "Selesaikan seluruh aktivitas untuk membuka Feedback Akhir Level.", state: "finalPreview", statusLabel: "Simulasi Akhir", progress: 0, components: [], checkpointUnlocked: false },
    ];
  }

  return [1, 2, 3, 4, 5].map((number) => {
    const free = membership === "free";
    const state: ChapterState = free
      ? number === 1 ? "current" : "entitlementLocked"
      : number < 4 ? "completed" : number === 4 ? "current" : "progressionLocked";
    return {
      key: `chapter-${number}`,
      orderLabel: String(number).padStart(2, "0"),
      title: `${level.code} | Chapter ${number}`,
      description: "Video | modul | flashcard | audio | reading | checkpoint",
      state,
      statusLabel: state === "completed" ? "Selesai" : state === "current" ? "Lanjutkan" : state === "entitlementLocked" ? "Terkunci • Upgrade" : "Terkunci",
      progress: chapterProgress(chapterComponents(level.slug, number, state)),
      components: chapterComponents(level.slug, number, state),
      checkpointUnlocked: state === "completed" || state === "current",
      href: state === "completed" || state === "current" ? `/learn/${level.slug}/chapter-${number}?membership=${membership}` : undefined,
    };
  });
}

export function findJourneyLevel(membership: Membership, slug: string, purchasedLevel = getDefaultPurchasedLevel(membership), standalonePrograms: readonly string[] = []): JourneyLevel | undefined {
  return getJourneyLevels(membership, purchasedLevel, standalonePrograms).find((level) => level.slug === slug);
}

export function canAccessLearning(membership: Membership, levelSlug: string, chapterKey: string, purchasedLevel = getDefaultPurchasedLevel(membership), standalonePrograms: readonly string[] = []): boolean {
  const level = findJourneyLevel(membership, levelSlug, purchasedLevel, standalonePrograms);
  if (!level) return false;
  if (chapterKey === "chapter-1" && level.access !== "notPurchased") return true;
  if (level.access === "notPurchased") return false;
  if (level.access === "freePreview") return chapterKey === "chapter-1";
  return getJourneyChapters(membership, level).some((chapter) => chapter.key === chapterKey && (chapter.state === "completed" || chapter.state === "current" || chapter.state === "available"));
}
