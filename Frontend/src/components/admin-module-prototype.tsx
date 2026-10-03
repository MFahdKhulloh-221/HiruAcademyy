"use client";

import { AdminLearningMediaWorkspace, type LearningMedia } from "@/components/admin-learning-media-preview";

const approvedModules: LearningMedia[] = [{
  id: "module-n4-chapter-1-grammar",
  title: "Modul Tata Bahasa — Pola Kalimat Sehari-hari",
  description: "Baca materi, bookmark halaman penting, dan lanjutkan setelah memahami contoh utama.",
  context: "N4",
  chapter: "Chapter 1",
  type: "Tata Bahasa",
  file: null,
  filename: "N4-Chapter-04-Modul-Tata-Bahasa.pdf",
  url: "",
  duration: "",
  order: "2",
  status: "Published",
}, {
  id: "module-n4-chapter-1-kanji",
  title: "Modul Huruf Jepang & Kanji — Chapter 1",
  description: "Pelajari huruf dan kanji chapter dengan contoh bacaan serta konteks penggunaan.",
  context: "N4",
  chapter: "Chapter 1",
  type: "Huruf/Kanji",
  file: null,
  filename: "N4-Chapter-04-Modul-Huruf-Jepang-Kanji.pdf",
  url: "",
  duration: "",
  order: "3",
  status: "Published",
}];

export function AdminModulePrototype() {
  return <AdminLearningMediaWorkspace kind="Modul" initialRows={approvedModules} />;
}
