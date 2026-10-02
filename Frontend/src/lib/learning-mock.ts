import type { Membership } from "@/lib/dashboard-mock";
import { readPublishedCurriculum } from "@/lib/curriculum-store";
import { readAssessments, type AssessmentQuestion } from "@/lib/admin-assessment-store";

export type LearningActivityKey = "video" | "grammar" | "kanji" | "flashcards" | "audio" | "reading" | "checkpoint";
export type LearningActivityState = "completed" | "current" | "available" | "lockedByProgress" | "lockedByEntitlement";
export type LessonActivity = { key: LearningActivityKey; order: string; title: string; railTitle: string; description: string; icon: string; state: LearningActivityState; href?: string; statusLabel?: string };
export type FlashcardItem = { id: string; term: string; reading: string; meaning: string; example: { before: string; focus: string; focusReading: string; after: string; translation: string } };
export type LearningQuestion = { id: string; prompt: string; instruction?: string; answers: string[]; correctAnswer: number };

const audioQuestions: LearningQuestion[] = [
  { id: "audio-1", prompt: "Apa aktivitas yang dilakukan pembicara setiap pagi?", instruction: "Dengarkan audio sampai selesai sebelum memilih jawaban.", answers: ["Membaca koran", "Belajar Bahasa Jepang", "Berangkat ke stasiun", "Memasak sarapan"], correctAnswer: 1 },
  { id: "audio-2", prompt: "Pukul berapa pembicara mulai belajar?", answers: ["Pukul enam", "Pukul tujuh", "Pukul delapan", "Pukul sembilan"], correctAnswer: 1 },
  { id: "audio-3", prompt: "Berapa lama pembicara belajar bahasa Jepang?", answers: ["Lima belas menit", "Tiga puluh menit", "Satu jam", "Dua jam"], correctAnswer: 1 },
  { id: "audio-4", prompt: "Apa yang dilakukan setelah belajar?", answers: ["Pergi ke perusahaan", "Tidur kembali", "Membaca koran", "Memasak"], correctAnswer: 0 },
  { id: "audio-5", prompt: "Topik utama percakapan adalah...", answers: ["Rencana liburan", "Rutinitas pagi", "Belanja mingguan", "Hobi akhir pekan"], correctAnswer: 1 },
];
const readingQuestions: LearningQuestion[] = [
  { id: "reading-1", prompt: "Apa yang dilakukan Tanaka setelah sarapan?", answers: ["Pergi ke perusahaan", "Belajar Bahasa Jepang", "Tidur kembali", "Membaca buku"], correctAnswer: 1 },
  { id: "reading-2", prompt: "Pukul berapa Tanaka bangun?", answers: ["Pukul enam", "Pukul tujuh", "Pukul delapan", "Pukul sembilan"], correctAnswer: 1 },
  { id: "reading-3", prompt: "Berapa lama Tanaka belajar?", answers: ["Sepuluh menit", "Dua puluh menit", "Tiga puluh menit", "Satu jam"], correctAnswer: 2 },
  { id: "reading-4", prompt: "Ke mana Tanaka pergi setelah belajar?", answers: ["Sekolah", "Stasiun", "Perusahaan", "Perpustakaan"], correctAnswer: 2 },
  { id: "reading-5", prompt: "Urutan kegiatan Tanaka yang benar adalah...", answers: ["Belajar, bangun, sarapan", "Bangun, sarapan, belajar", "Sarapan, bekerja, bangun", "Bekerja, belajar, sarapan"], correctAnswer: 1 },
];

const flashcards: FlashcardItem[] = [
  { id: "learn", term: "学ぶ", reading: "まなぶ", meaning: "belajar / mempelajari", example: { before: "毎日、日本語を", focus: "学", focusReading: "まな", after: "んでいます。", translation: "Saya belajar bahasa Jepang setiap hari." } },
  { id: "continue", term: "続ける", reading: "つづける", meaning: "melanjutkan", example: { before: "少しずつ勉強を", focus: "続", focusReading: "つづ", after: "けます。", translation: "Saya melanjutkan belajar sedikit demi sedikit." } },
  { id: "understand", term: "分かる", reading: "わかる", meaning: "mengerti / memahami", example: { before: "例を見ると、意味が", focus: "分", focusReading: "わ", after: "かります。", translation: "Dengan melihat contoh, saya memahami artinya." } },
  { id: "review", term: "復習", reading: "ふくしゅう", meaning: "mengulang pelajaran", example: { before: "学んだ言葉を", focus: "復習", focusReading: "ふくしゅう", after: "します。", translation: "Saya mengulang kosakata yang sudah dipelajari." } },
];

export function getLearningData(membership: Membership, levelSlug: string, chapterSlug: string) {
  const level = levelSlug.toUpperCase();
  const chapterNumber = chapterSlug.replace("chapter-", "");
  const chapterNum = Number(chapterNumber) || 0;
  const fixture = levelSlug === "n4" && chapterSlug === "chapter-4";
  const chapterTitle = fixture ? "Pola Kalimat dan Kehidupan Sehari-hari" : `${level} | Chapter ${chapterNumber}`;
  const basePath = `/learn/${levelSlug}/${chapterSlug}`;
  const query = `?membership=${membership}`;

  const curriculum = readPublishedCurriculum();
  const publishedChapter = curriculum.chapters.find(
    (c) =>
      c.programCode.toLowerCase() === levelSlug.toLowerCase() &&
      (c.slug === chapterSlug || c.order === chapterNum)
  );

  let chapterCards: FlashcardItem[] = flashcards;
  let matchedDeck = publishedChapter?.flashcardDeckId
    ? curriculum.flashcardDecks.find((d) => d.id === publishedChapter.flashcardDeckId)
    : undefined;

  if (!matchedDeck && publishedChapter) {
    matchedDeck = curriculum.flashcardDecks.find((d) => d.chapterId === publishedChapter.id);
  }
  if (!matchedDeck) {
    matchedDeck = curriculum.flashcardDecks.find(
      (d) =>
        d.programCode.toLowerCase() === levelSlug.toLowerCase() &&
        d.cards &&
        d.cards.length > 0
    );
  }

  if (matchedDeck && matchedDeck.cards && matchedDeck.cards.length > 0) {
    chapterCards = matchedDeck.cards.map((c) => ({
      id: c.id,
      term: c.front,
      reading: c.reading,
      meaning: c.meaning || c.back,
      example: {
        before: c.example,
        focus: "",
        focusReading: "",
        after: "",
        translation: c.back || c.meaning,
      },
    }));
  }

  let checkpointQuestions: AssessmentQuestion[] | undefined;
  const allAssessments = readAssessments();
  let matchedAssessment = publishedChapter?.checkpointAssessmentId
    ? allAssessments.find((a) => a.id === publishedChapter.checkpointAssessmentId)
    : undefined;

  if (!matchedAssessment && publishedChapter) {
    matchedAssessment = allAssessments.find(
      (a) =>
        a.type === "checkpoint" &&
        a.level.toLowerCase() === levelSlug.toLowerCase() &&
        a.chapter === publishedChapter.order
    );
  }

  if (matchedAssessment && matchedAssessment.status === "Published" && matchedAssessment.questions?.length) {
    checkpointQuestions = matchedAssessment.questions;
  }

  const allActivities: LessonActivity[] = [
    { key: "video", order: "01", title: "Video Lesson", railTitle: "Video Lesson", description: "Tonton penjelasan utama chapter.", icon: "▶", state: "current", href: `${basePath}/video${query}`, statusLabel: "Belum Mulai" },
    { key: "grammar", order: "02", title: "Modul Tata Bahasa", railTitle: "Modul Tata Bahasa", description: "Baca dan tandai poin penting.", icon: "本", state: "available", href: `${basePath}/grammar${query}`, statusLabel: "Belum Mulai" },
    { key: "kanji", order: "03", title: "Modul Huruf Jepang & Kanji", railTitle: "Modul Huruf & Kanji", description: "Pelajari huruf dan kanji terkait.", icon: "文", state: "available", href: `${basePath}/kanji${query}`, statusLabel: "Belum Mulai" },
    { key: "flashcards", order: "04", title: "Flashcard", railTitle: "Flashcard", description: "Ulangi kosakata dan pola penting.", icon: "札", state: "available", href: `${basePath}/flashcards${query}`, statusLabel: "Belum Mulai" },
    { key: "audio", order: "05", title: "Audio Question", railTitle: "Audio", description: "Latih pemahaman listening.", icon: "音", state: "available", href: `${basePath}/audio${query}`, statusLabel: "Belum Mulai" },
    { key: "reading", order: "06", title: "Reading Question", railTitle: "Reading", description: "Baca teks dan jawab pertanyaan.", icon: "読", state: "available", href: `${basePath}/reading${query}`, statusLabel: "Belum Mulai" },
    { key: "checkpoint", order: "07", title: "Checkpoint", railTitle: "Checkpoint", description: "Status akan berubah otomatis setelah persyaratan chapter terpenuhi.", icon: "旗", state: membership !== "free" && fixture ? "available" : "lockedByProgress", href: membership !== "free" && fixture ? `${basePath}/checkpoint${query}` : undefined, statusLabel: membership !== "free" && fixture ? "Tersedia" : "Terkunci" },
  ];
  const activities = levelSlug === "ssw-pengolahan-makanan"
    ? allActivities.filter((activity) => ["video", "grammar", "flashcards", "checkpoint"].includes(activity.key)).map((activity) => activity.key === "grammar" ? { ...activity, title: "Modul", railTitle: "Modul" } : activity)
    : levelSlug === "interview"
      ? allActivities.filter((activity) => ["video", "grammar"].includes(activity.key)).map((activity) => activity.key === "grammar" ? { ...activity, title: "Modul", railTitle: "Modul" } : activity)
      : allActivities;
  return {
    membership,
    level,
    levelSlug,
    chapterSlug,
    chapterNumber,
    chapterTitle: publishedChapter?.title || chapterTitle,
    overviewDescription: fixture ? "Selesaikan setiap modul untuk membuka checkpoint dan melanjutkan journey." : "Selesaikan aktivitas chapter untuk melanjutkan journey.",
    videoTitle: fixture ? "Pola kalimat untuk aktivitas sehari-hari" : `Video ${chapterTitle}`,
    activities,
    cards: chapterCards,
    audioQuestions,
    readingQuestions,
    readingPassage: publishedChapter?.readingPassage || "毎朝、田中さんは七時に起きます。朝ご飯を食べてから、日本語を三十分勉強します。そのあと、八時に会社へ行きます。",
    checkpointQuestions,
  };
}

export type LearningData = ReturnType<typeof getLearningData>;
export type DocumentLessonKind = "grammar" | "kanji";

export function getDocumentLesson(data: LearningData, kind: DocumentLessonKind) {
  const grammar = kind === "grammar";
  const basePath = `/learn/${data.levelSlug}/${data.chapterSlug}`;
  const query = `?membership=${data.membership}`;
  return {
    kind,
    eyebrow: `${data.level} • CHAPTER ${data.chapterNumber} • ${grammar ? "MODUL TATA BAHASA" : "MODUL HURUF JEPANG & KANJI"}`,
    title: grammar ? "Modul Tata Bahasa — Pola Kalimat Sehari-hari" : `Modul Huruf Jepang & Kanji — Chapter ${data.chapterNumber}`,
    description: grammar ? "Baca materi, bookmark halaman penting, dan lanjutkan setelah memahami contoh utama." : "Pelajari huruf dan kanji chapter dengan contoh bacaan serta konteks penggunaan.",
    filename: grammar ? "N4-Chapter-04-Modul-Tata-Bahasa.pdf" : "N4-Chapter-04-Modul-Huruf-Jepang-Kanji.pdf",
    pageMarkers: grammar ? [["文", "Halaman 1"], ["型", "Halaman 2"], ["例", "Halaman 3"], ["練", "Halaman 4"], ["要", "Halaman 5"]] : [["字", "Halaman 1"], ["読", "Halaman 2"], ["書", "Halaman 3"], ["例", "Halaman 4"], ["復", "Halaman 5"]],
    pageKicker: grammar ? "HALAMAN 1 • PENGANTAR" : "HALAMAN 1 • KANJI UTAMA",
    pageTitle: grammar ? "Mengenal pola kalimat untuk rutinitas" : "Kanji untuk waktu dan aktivitas",
    pageDescription: grammar ? "Pola kalimat membantu menyusun informasi tentang waktu, kebiasaan, dan aktivitas secara runtut." : "Pelajari bentuk, bacaan, arti, dan contoh penggunaan setiap kanji dalam kalimat.",
    highlights: grammar ? [["時", "waktu"], ["毎", "setiap"], ["習", "kebiasaan"]] : [["時", "waktu / ji"], ["朝", "pagi / asa"], ["毎", "setiap / mai"]],
    detailTitle: grammar ? "Struktur dasar" : "Cara mempelajari kanji",
    detail: grammar ? "Mulai dari penanda waktu, subjek atau topik, lalu aktivitas. Perhatikan perubahan bentuk kata kerja sesuai konteks dan tingkat kesopanan." : "Amati komponen bentuk, hubungkan dengan arti, lalu ulangi melalui flashcard dan contoh kalimat. Gunakan Jepang Pemula bila teks profesional perlu disederhanakan.",
    exampleTitle: grammar ? "Contoh" : "Contoh bacaan",
    example: grammar ? "毎朝、日本語を勉強します。 • Saya belajar Bahasa Jepang setiap pagi." : "毎朝（まいあさ）• setiap pagi　時間（じかん）• waktu / durasi",
    notes: grammar ? [["★", "Pola utama", "Tandai struktur kalimat yang sering digunakan."], ["文", "Contoh", "Bandingkan beberapa konteks penggunaan."], ["練", "Latihan", "Coba tulis satu kalimat rutinitasmu."]] : [["字", "Bentuk", "Perhatikan komponen dan arah goresan."], ["読", "Bacaan", "Catat on-yomi dan kun-yomi yang relevan."], ["復", "Ulangi", "Lanjutkan ke flashcard setelah membaca."]],
    previous: { label: grammar ? "Kembali ke Video" : "Modul Tata Bahasa", href: `${basePath}/${grammar ? "video" : "grammar"}${query}` },
    next: grammar ? { label: "Modul Huruf & Kanji", href: `${basePath}/kanji${query}` } : data.membership === "free" ? { label: "Mulai Flashcard", href: `${basePath}/flashcards${query}` } : { label: "Buka Kumpulan Flashcard", href: `/flashcards${query}` },
  };
}
