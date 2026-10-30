export type MenuItem = { label: string; href: string; group: string };

export const adminMenu: readonly MenuItem[] = [
  { label: "Dashboard", href: "/admin", group: "DASHBOARD" },
  { label: "Harga & Promo", href: "/admin/program-harga", group: "LANDING & PUBLIC" },
  { label: "Showcase", href: "/admin/showcase", group: "LANDING & PUBLIC" },
  { label: "Sensei", href: "/admin/sensei", group: "LANDING & PUBLIC" },
  { label: "Testimoni", href: "/admin/testimoni", group: "LANDING & PUBLIC" },
  { label: "Placement Test", href: "/admin/placement-hasil", group: "LANDING & PUBLIC" },
  { label: "Blog", href: "/admin/blog-seo", group: "LANDING & PUBLIC" },
  { label: "Journey / Program", href: "/admin/kurikulum-materi?tab=Program", group: "PEMBELAJARAN" },
  { label: "Checkpoint", href: "/admin/checkpoint", group: "PEMBELAJARAN" },
  { label: "Try Out", href: "/admin/try-out", group: "PEMBELAJARAN" },
  { label: "Jadwal & Replay", href: "/admin/kelas-jadwal", group: "PEMBELAJARAN" },
  { label: "Replay Rekaman", href: "/admin/replay-rekaman", group: "PEMBELAJARAN" },
  { label: "Sertifikat", href: "/admin/sertifikat", group: "PEMBELAJARAN" },
  { label: "Notifikasi", href: "/admin/notifikasi", group: "PEMBELAJARAN" },
  { label: "Komunitas", href: "/admin/komunitas", group: "OPERASIONAL" },
  { label: "Pengguna & Akses", href: "/admin/pengguna-akses", group: "OPERASIONAL" },
  { label: "Invoice", href: "/admin/invoice", group: "OPERASIONAL" },
  { label: "Affiliate & Komisi", href: "/admin/affiliate-komisi", group: "OPERASIONAL" },
  { label: "Analitik", href: "/admin/analitik", group: "OPERASIONAL" },
];

const groupLabels = ["DASHBOARD", "LANDING & PUBLIC", "PEMBELAJARAN", "OPERASIONAL"] as const;

export const adminGroups = groupLabels.map((label) => ({ label, items: adminMenu.filter((item) => item.group === label) }));

export const adminPlaceholderPages: Record<string, { title: string; description: string }> = {
  showcase: { title: "Showcase", description: "Kelola data showcase yang tampil pada halaman publik." },
  "video-lesson": { title: "Video Lesson", description: "Kelola video pembelajaran berdasarkan program, level, dan chapter." },
  modul: { title: "Modul", description: "Kelola modul pembelajaran dan materi pendukung." },
  flashcard: { title: "Flashcard", description: "Kelola deck dan kartu belajar." },
  "audio-question": { title: "Audio Question", description: "Kelola materi audio dan pertanyaan terkait." },
  "reading-question": { title: "Reading Question", description: "Kelola bacaan dan pertanyaan pemahaman." },
  "mini-checkpoint": { title: "Mini Checkpoint", description: "Kelola konfigurasi Mini Checkpoint." },
  "try-out": { title: "Try Out", description: "Kelola simulasi Try Out dan pembagian sesi." },
  sertifikat: { title: "Sertifikat", description: "Kelola template dan kelayakan sertifikat." },
  notifikasi: { title: "Notifikasi", description: "Kelola notifikasi untuk siswa." },
};
