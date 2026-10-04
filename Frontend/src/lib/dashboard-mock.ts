export type Membership = "free" | "lms" | "sensei";
export type DashboardIcon =
  | "achievement"
  | "certificate"
  | "checkpoint"
  | "community"
  | "journey"
  | "library"
  | "practice"
  | "replay"
  | "sensei"
  | "tryout"
  | "affiliate";

export type StudentFeature = "journey" | "practice" | "flashcards" | "library" | "tryout" | "schedule" | "replay" | "mini-checkpoint" | "community" | "ask-sensei" | "progress" | "leaderboard" | "certificate" | "notifications" | "profile" | "membership" | "affiliate";
export type FeatureAccess = "available" | "limited" | "locked";

export type DashboardAction = {
  title: string;
  detail: string;
  icon: DashboardIcon;
  href: string;
  feature: StudentFeature;
  access: FeatureAccess;
};

export type LeaderboardEntry = {
  rank: number;
  name: string;
  xp: string;
  isCurrentUser?: boolean;
};

export type DashboardConfig = {
  greeting: string;
  subgreeting: string;
  level: string;
  target: string;
  continue: {
    label: string;
    title: string;
    description: string;
    primary: string;
    primaryHref: string;
    timeRemaining: string;
    progress: string;
    progressPercent: number;
    progressLabel: string;
    detail: string;
  };
  quickActions: DashboardAction[];
  leaderboard: LeaderboardEntry[];
  progressSummary: { label: string; value: string }[];
};

export type DashboardData = {
  membership: Membership;
  membershipLabel: string;
  user: {
    displayName: string;
    initials: string;
    level: string;
    target: string;
    joinDate: string;
  };
  config: DashboardConfig;
};

const defaultLeaderboard: LeaderboardEntry[] = [
  { rank: 1, name: "Siti Aisyah", xp: "Konsisten" },
  { rank: 2, name: "Hilmi (Kamu)", xp: "Level N4", isCurrentUser: true },
  { rank: 3, name: "Budi Santoso", xp: "Konsisten" },
  { rank: 4, name: "Rina Wati", xp: "Konsisten" },
  { rank: 5, name: "Dian Indra", xp: "Konsisten" },
];

export function getStudentFeatureAccess(membership: Membership, feature: StudentFeature): FeatureAccess {
  if (feature === "tryout" || feature === "schedule" || feature === "replay" || feature === "mini-checkpoint" || feature === "ask-sensei" || feature === "certificate") {
    if (feature === "tryout" || feature === "certificate") return membership === "free" ? "locked" : "available";
    return membership === "sensei" ? "available" : "locked";
  }
  if (feature === "journey" || feature === "practice" || feature === "flashcards" || feature === "library" || feature === "community") {
    return membership === "free" ? "limited" : "available";
  }
  return "available";
}

const action = (membership: Membership, feature: StudentFeature, title: string, detail: string, icon: DashboardIcon, path: string): DashboardAction => ({ title, detail, icon, feature, access: getStudentFeatureAccess(membership, feature), href: `${path}?membership=${membership}` });

const quickActionsFor = (membership: Membership): DashboardAction[] => membership === "sensei"
  ? [
      action(membership, "journey", "Journey", "Perjalanan Level", "journey", "/journey"),
      action(membership, "schedule", "Jadwal", "Sesi Kelas Zoom", "checkpoint", "/schedule"),
      action(membership, "replay", "Replay", "Rekaman Kelas", "replay", "/replay"),
      action(membership, "ask-sensei", "Tanya Sensei", "Konsultasi Materi", "sensei", "/ask-sensei"),
      action(membership, "community", "Komunitas", "Diskusi Pembelajar", "community", "/community"),
      action(membership, "affiliate", "Affiliate", "Ajak Teman & Diskon", "affiliate", "/affiliate"),
    ]
  : [
      action(membership, "journey", "Journey", "Perjalanan Level", "journey", "/journey"),
      action(membership, "library", "Perpustakaan", "Materi & Modul", "library", "/library"),
      action(membership, "practice", "Latihan", "Latihan Harian", "practice", "/practice"),
      action(membership, "tryout", "Try Out", "Simulasi Ujian", "tryout", "/tryout"),
      action(membership, "community", "Komunitas", "Diskusi Pembelajar", "community", "/community"),
      action(membership, "affiliate", "Affiliate", "Ajak Teman & Diskon", "affiliate", "/affiliate"),
    ];

const configs: Record<Membership, DashboardConfig> = {
  free: {
    greeting: "Halo, Hilmi",
    subgreeting: "Siap untuk melanjutkan perjalanan bahasa Jepangmu hari ini?",
    level: "Level N4",
    target: "Target JLPT: Des 2026",
    continue: {
      label: "TERAKHIR BELAJAR",
      title: "Chapter 1 — JLPT N4",
      description: "Pelajari tata bahasa dasar dan pola kalimat esensial untuk persiapan JLPT N4.",
      primary: "Lanjutkan Belajar",
      primaryHref: "/learn/n4/chapter-1?membership=free",
      timeRemaining: "Siap dipelajari",
      progress: "56%",
      progressPercent: 56,
      progressLabel: "Progres N4",
      detail: "14 dari 25 modul selesai",
    },
    quickActions: quickActionsFor("free"),
    leaderboard: defaultLeaderboard,
    progressSummary: [
      { label: "Progres Materi", value: "Level N4" },
      { label: "Konsistensi", value: "Aktif" },
      { label: "Modul Selesai", value: "14 modul" },
    ],
  },
  lms: {
    greeting: "Halo, Hilmi",
    subgreeting: "Siap untuk melanjutkan perjalanan bahasa Jepangmu hari ini?",
    level: "Level N4",
    target: "Target JLPT: Des 2026",
    continue: {
      label: "TERAKHIR BELAJAR",
      title: "Bunpou Bab 12: Kata Kerja Te-form",
      description: "Mari selesaikan latihan pola kalimat -te kudasai untuk meminta bantuan dengan sopan.",
      primary: "Lanjutkan Belajar",
      primaryHref: "/learn/n4/chapter-4?membership=lms",
      timeRemaining: "Siap dipelajari",
      progress: "65%",
      progressPercent: 65,
      progressLabel: "Progres N4",
      detail: "26 dari 40 modul selesai",
    },
    quickActions: quickActionsFor("lms"),
    leaderboard: defaultLeaderboard,
    progressSummary: [
      { label: "XP Mingguan", value: "9.120 XP" },
      { label: "Streak Belajar", value: "12 hari" },
      { label: "Modul Selesai", value: "26 modul" },
    ],
  },
  sensei: {
    greeting: "Halo, Hilmi",
    subgreeting: "Siap untuk melanjutkan perjalanan bahasa Jepangmu hari ini?",
    level: "Level N4",
    target: "Target JLPT: Des 2026",
    continue: {
      label: "TERAKHIR BELAJAR",
      title: "Bunpou Bab 12: Kata Kerja Te-form",
      description: "Mari selesaikan latihan pola kalimat -te kudasai untuk meminta bantuan dengan sopan.",
      primary: "Lanjutkan Belajar",
      primaryHref: "/learn/n4/chapter-4?membership=sensei",
      timeRemaining: "Siap dipelajari",
      progress: "65%",
      progressPercent: 65,
      progressLabel: "Progres N4",
      detail: "26 dari 40 modul selesai",
    },
    quickActions: quickActionsFor("sensei"),
    leaderboard: defaultLeaderboard,
    progressSummary: [
      { label: "Progres Materi", value: "Level N4" },
      { label: "Konsistensi", value: "Aktif" },
      { label: "Sesi Cohort", value: "Sesuai Jadwal" },
    ],
  },
};

const membershipLabels: Record<Membership, string> = {
  free: "Free Member",
  lms: "Belajar Mandiri",
  sensei: "Belajar dengan Sensei",
};

export function getDashboardData(membership: Membership): DashboardData {
  return {
    membership,
    membershipLabel: membershipLabels[membership],
    user: {
      displayName: "Hilmi",
      initials: "HI",
      level: "Level N4",
      target: "Des 2026",
      joinDate: "12 Januari 2026",
    },
    config: { ...configs[membership], level: "—", target: "—", continue: { ...configs[membership].continue, title: "Belum tersedia", description: "", primaryHref: "/journey", progress: "—", progressPercent: 0, detail: "—" }, leaderboard: [], progressSummary: [], quickActions: configs[membership].quickActions.map(item => ({ ...item, href: item.href.split("?")[0], access: "available" })) },
  };
}

export function parseMembership(value?: string): Membership {
  return value === "lms" || value === "sensei" ? value : "free";
}
