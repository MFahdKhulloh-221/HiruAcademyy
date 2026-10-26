export const plans = [
  { id: "free", badge: "GRATIS", title: "Coba Gratis", description: "Cocok untuk kamu yang ingin mencoba sistem belajar Hiru sebelum berlangganan.", points: ["Akses 1 chapter lengkap setiap level", "Progres belajar tersimpan", "Akses membaca komunitas"], price: "Rp0", period: "" },
  { id: "lms", badge: "BELAJAR FLEKSIBEL", title: "Belajar Mandiri", description: "Cocok untuk kamu yang ingin belajar menyesuaikan waktu dan kecepatan sendiri.", points: ["Alur belajar dan latihan lengkap", "Try Out dan pembahasan jawaban", "Akses komunitas serta sertifikat digital"], price: "Mulai Rp99k/6 bulan", period: "6 bulan" },
  { id: "sensei", badge: "POPULER", title: "Kelas bersama Sensei", description: "Cocok untuk kamu yang membutuhkan jadwal rutin, bimbingan dan evaluasi langsung.", points: ["Semua fasilitas Belajar Mandiri", "10x live Zoom ・ 90 menit/bulan", "Rekaman kelas dan evaluasi hasil belajar"], price: "Mulai Rp350k/bulan", period: "Bulanan" },
];
export const levelCatalog = [
  { code: "N5", name: "JLPT N5", title: "Dasar Bahasa Jepang", description: "Cocok untuk pemula yang ingin menguasai huruf Jepang, kosakata, dan pola kalimat dasar.", topics: ["Hiragana & Katakana", "Pola kalimat dasar"] },
  { code: "N4", name: "JLPT N4", title: "Pemula Lanjutan", description: "Cocok untuk kamu yang telah memahami materi N5 dan ingin menguasai pola kalimat, kanji, dokkai dan choukai level N4.", topics: ["Pola kalimat & Kanji", "Dokkai & Choukai"] },
  { code: "N3", name: "JLPT N3", title: "Tingkat Menengah", description: "Cocok untuk kamu yang sudah memiliki dasar N4 dan ingin memahami teks serta percakapan yang lebih kompleks.", topics: ["Dokkai & Pola kalimat", "Goi & Kanji"] },
  { code: "N2", name: "JLPT N2", title: "Tingkat Lanjut", description: "Cocok untuk kamu yang sudah memiliki pondasi N3 dan ingin meningkatkan kecepatan memahami teks, percakapan, dan pola kalimat yang lebih kompleks.", topics: ["Dokkai & Choukai", "Strategi JLPT"] },
  { code: "N1", name: "JLPT N1", title: "Tingkat Mahir", description: "Cocok untuk kamu yang memiliki dasar N2 dan ingin menguasai nuansa bahasa tingkat tinggi serta strategi menghadapi JLPT N1.", topics: ["Bahasa tingkat tinggi", "Strategi JLPT"] },
];
export const programFacilities = [
  { icon: "▶", title: "Video Penjelasan", description: "Penjelasan utama chapter dengan progres belajar yang tercatat." },
  { icon: "本", title: "Modul", description: "Modul Tata Bahasa serta Modul Huruf Jepang & Kanji." },
  { icon: "練", title: "Latihan", description: "Latihan audio, reading, dan penguatan materi harian." },
  { icon: "旗", title: "Checkpoint", description: "Evaluasi pemahaman di akhir chapter sebelum melanjutkan." },
  { icon: "札", title: "Flashcard", description: "Deck kosakata dan pola penting dengan sesi pengulangan." },
  { icon: "試", title: "Try Out JLPT", description: "Simulasi soal JLPT tahun sebelumnya, hasil, dan ulasan jawaban." },
];
export const programComparison = [
  { badge: "Free", title: "Free Member", description: "Chapter 1 gratis pada setiap N1–N5." },
  { badge: "LMS", title: "Belajar Mandiri", description: "Journey penuh, try out, review, dan sertifikat." },
  { badge: "LMS + Zoom", title: "Belajar dengan Sensei", description: "Semua LMS ditambah cohort, kelas langsung, Sensei, dan replay." },
];
export const supportingValues = [
  { glyph: "進", title: "Progress terlihat", description: "Pengguna memahami langkah yang sudah dan belum selesai." },
  { glyph: "続", title: "Belajar konsisten", description: "Aktivitas disusun agar mudah diteruskan." },
  { glyph: "選", title: "Akses transparan", description: "Free, LMS, dan LMS + Zoom dibedakan secara jelas." },
];
export const blogDetailSlug = "strategi-rutinitas-belajar-n4";
const blogPublisher = "Hiru Academy";
export const blogFeatured = {
  slug: blogDetailSlug,
  marker: "",
  label: "ARTIKEL UNGGULAN",
  category: "Tips Belajar",
  author: blogPublisher,
  publishedAt: "20 Agustus 2026",
  title: "Strategi membangun rutinitas belajar N4",
  description: "Susun ritme belajar mingguan dengan video, modul, flashcard, latihan, dan checkpoint tanpa kehilangan fokus.",
};
export const blogArticles = [
  { marker: "", category: "Grammar / Bunpou", author: blogPublisher, publishedAt: "18 Agustus 2026", title: "Cara memahami pola kalimat tanpa menghafal berlebihan", description: "Gunakan konteks, ilustrasi, dan latihan singkat untuk memperkuat pemahaman." },
  { marker: "", category: "Listening / Choukai", author: blogPublisher, publishedAt: "15 Agustus 2026", title: "Latihan listening yang efektif untuk pemula", description: "Bangun kebiasaan mendengar melalui audio pendek dan pengulangan terarah." },
  { marker: "", category: "JLPT", author: blogPublisher, publishedAt: "12 Agustus 2026", title: "Mempersiapkan try out pertama dengan tenang", description: "Kenali struktur soal, manajemen waktu, dan cara membaca hasil evaluasi." },
];
export const blogDetail = {
  ...blogFeatured,
  eyebrow: "BELAJAR EFEKTIF • 8 MENIT BACA",
  title: "Strategi membangun rutinitas belajar N4 yang realistis",
  description: "Rutinitas yang baik bukan tentang belajar selama mungkin, tetapi menjaga urutan aktivitas yang konsisten dan mudah diulang.",
};
export interface PlacementQuestion {
  number: number;
  area: "Bunpou" | "Moji・Goi" | "Dokkai" | "Choukai";
  prompt: string;
  answers: string[];
  correctAnswer: string;
}

export const placementQuestions: PlacementQuestion[] = [
  {
    number: 1,
    area: "Bunpou",
    prompt: "Pilihlah partikel yang tepat: わたしは 毎朝 コーヒー（　）飲みます。",
    answers: ["A. を", "B. に", "C. で", "D. が"],
    correctAnswer: "A. を",
  },
  {
    number: 2,
    area: "Bunpou",
    prompt: "Pilihlah bentuk kata kerja yang tepat: 明日、図書館へ 本を（　）に行きます。",
    answers: ["A. 借りて", "B. 借り", "C. 借りる", "D. 借ります"],
    correctAnswer: "B. 借り",
  },
  {
    number: 3,
    area: "Bunpou",
    prompt: "Pilihlah bentuk yang sesuai: ここで 写真を（　）はいけません。",
    answers: ["A. 撮る", "B. 撮り", "C. 撮って", "D. 撮った"],
    correctAnswer: "C. 撮って",
  },
  {
    number: 4,
    area: "Bunpou",
    prompt: "Pilihlah pola kalimat yang tepat: 日曜日、掃除を（　）洗濯をしたりしました。",
    answers: ["A. したり", "B. して", "C. すると", "D. する"],
    correctAnswer: "A. したり",
  },
  {
    number: 5,
    area: "Bunpou",
    prompt: "Pilihlah ungkapan yang paling tepat: 雨が 降って（　）、傘を 忘れました。",
    answers: ["A. いるから", "B. いたら", "C. いるなら", "D. いるのに"],
    correctAnswer: "D. いるのに",
  },
  {
    number: 6,
    area: "Moji・Goi",
    prompt: "Pilihlah cara baca kanji yang digarisbawahi: この「漢字」は 難しいです。",
    answers: ["A. かんじ", "B. かんち", "C. かんし", "D. がんじ"],
    correctAnswer: "A. かんじ",
  },
  {
    number: 7,
    area: "Moji・Goi",
    prompt: "Pilihlah kanji yang tepat untuk kata: まいにち 「ともだち」と 話します。",
    answers: ["A. 友連", "B. 友達", "C. 友手", "D. 友立"],
    correctAnswer: "B. 友達",
  },
  {
    number: 8,
    area: "Moji・Goi",
    prompt: "Pilihlah kata kerja yang sesuai: 部屋が 暗いので、電気を（　）ください。",
    answers: ["A. あけて", "B. けして", "C. つけて", "D. しめて"],
    correctAnswer: "C. つけて",
  },
  {
    number: 9,
    area: "Moji・Goi",
    prompt: "Pilihlah lawan kata dari: 「新しい」",
    answers: ["A. 古い", "B. 高い", "C. 遠い", "D. 安い"],
    correctAnswer: "A. 古い",
  },
  {
    number: 10,
    area: "Moji・Goi",
    prompt: "Pilihlah kata yang paling tepat: 喉が かわいたので、水が（　）です。",
    answers: ["A. すき", "B. おいしい", "C. からい", "D. ほしい"],
    correctAnswer: "D. ほしい",
  },
  {
    number: 11,
    area: "Dokkai",
    prompt: "Pilihlah simpulan yang tepat: 田中さんは 毎朝 6時に 起きて、散歩を します。そのあと 朝ごはんを 食べます。朝ごはんの 前に することは何ですか。",
    answers: ["A. 散歩をする", "B. 勉強をする", "C. 買い物に行く", "D. 掃除をする"],
    correctAnswer: "A. 散歩をする",
  },
  {
    number: 12,
    area: "Dokkai",
    prompt: "Pilihlah informasi yang sesuai: 明日の ミーティングは 10時から 11時半まで 3階の 会議室で 行われます。何分間 行われますか。",
    answers: ["A. 60分間", "B. 90分間", "C. 30分間", "D. 120分間"],
    correctAnswer: "B. 90分間",
  },
  {
    number: 13,
    area: "Dokkai",
    prompt: "Pilihlah isi jadwal yang benar: 日曜日は 図書館が 休みです。月曜日は 午後1時から 開きます。",
    answers: ["A. 日曜日の午後に開いている", "B. 月曜日は一日中休み", "C. 月曜日の午前は開いていない", "D. 毎日開いている"],
    correctAnswer: "C. 月曜日の午前は開いていない",
  },
  {
    number: 14,
    area: "Dokkai",
    prompt: "Pilihlah pesan utama pengumuman: 雨天の場合、イベントは 来週の 土曜日に 延期します。",
    answers: ["A. 雨が降ったら日程が延期される", "B. 雨でもそのまま実施する", "C. 日曜日に変更される", "D. イベントは中止される"],
    correctAnswer: "A. 雨が降ったら日程が延期される",
  },
  {
    number: 15,
    area: "Dokkai",
    prompt: "Pilihlah petunjuk yang benar: この薬は 食事の あとで、1回に 2錠 飲んでください。",
    answers: ["A. 食前に2錠飲む", "B. 食後に1錠飲む", "C. いつでも飲んでよい", "D. 食後に2錠飲む"],
    correctAnswer: "D. 食後に2錠飲む",
  },
  {
    number: 16,
    area: "Choukai",
    prompt: "Simak dialog singkat: 男の人「駅まで どのくらい かかりますか。」 女の人「歩いて 15分くらいです。」 男の人は 駅まで 何分かかりますか。",
    answers: ["A. 約5分", "B. 約15分", "C. 約30分", "D. 約50分"],
    correctAnswer: "B. 約15分",
  },
  {
    number: 17,
    area: "Choukai",
    prompt: "Simak instruksi arah: 「田中先生の 部屋は 2階の 右側です。」 どこに行きますか。",
    answers: ["A. 2階の右側", "B. 1階の右側", "C. 2階の左側", "D. 1階の左側"],
    correctAnswer: "A. 2階の右側",
  },
  {
    number: 18,
    area: "Choukai",
    prompt: "Simak pilihan minuman: 女の人「コーヒーと お茶、どちらが いいですか。」 男の人「お茶を お願いします。」 男の人は 何を飲みますか。",
    answers: ["A. コーヒー", "B. 水", "C. お茶", "D. ジュース"],
    correctAnswer: "C. お茶",
  },
  {
    number: 19,
    area: "Choukai",
    prompt: "Simak janji temu: 男の人「明日 何時に 会いましょうか。」 女の人「9時半は どうですか。」 男の人「わかりました。」 二人は 何時に会いますか。",
    answers: ["A. 9時30分", "B. 9時00分", "C. 10時00分", "D. 10時30分"],
    correctAnswer: "A. 9時30分",
  },
  {
    number: 20,
    area: "Choukai",
    prompt: "Simak pengiriman paket: 女の人「この荷物を 送りたいのですが。」 受付「航空便と 船便が あります。」 女の人「急いでいるので 早いほうで。」 どちらを選びましたか。",
    answers: ["A. 船便", "B. 航空便", "C. 窓口受取", "D. 電車便"],
    correctAnswer: "B. 航空便",
  },
];

export interface PlacementResultArea {
  name: "Bunpou" | "Moji・Goi" | "Dokkai" | "Choukai";
  score: number;
}

export interface PlacementResultData {
  level: string;
  areas: PlacementResultArea[];
}

export const placementResult: PlacementResultData = {
  level: "N4",
  areas: [
    { name: "Bunpou", score: 78 },
    { name: "Moji・Goi", score: 72 },
    { name: "Dokkai", score: 68 },
    { name: "Choukai", score: 64 },
  ],
};

export function calculatePlacementResult(answers: Record<number, string>): PlacementResultData {
  const areaOrder: PlacementResultArea["name"][] = ["Bunpou", "Moji・Goi", "Dokkai", "Choukai"];
  const scores: Record<PlacementResultArea["name"], number> = {
    Bunpou: 0,
    "Moji・Goi": 0,
    Dokkai: 0,
    Choukai: 0,
  };

  placementQuestions.forEach((q) => {
    if (answers[q.number] === q.correctAnswer) {
      scores[q.area] += 20;
    }
  });

  const areas = areaOrder.map((name) => ({ name, score: scores[name] }));
  const average = areas.reduce((sum, a) => sum + a.score, 0) / 4;

  let level = "N5";
  if (average >= 90) level = "N1";
  else if (average >= 75) level = "N2";
  else if (average >= 60) level = "N3";
  else if (average >= 40) level = "N4";
  else level = "N5";

  return { level, areas };
}

export const placementRecommendations = [
  { badge: "POPULER", title: "Kelas bersama Sensei", description: "Cocok untuk kamu yang membutuhkan jadwal rutin, bimbingan dan evaluasi langsung.", action: "Pilih Kelas bersama Sensei →", href: "/register?plan=sensei" },
  { badge: "BELAJAR FLEKSIBEL", title: "Belajar Mandiri", description: "Cocok untuk kamu yang ingin belajar menyesuaikan waktu dan kecepatan sendiri.", action: "Pilih Belajar Mandiri →", href: "/register?plan=lms" },
  { badge: "GRATIS", title: "Coba Gratis", description: "Cocok untuk kamu yang ingin mencoba sistem belajar Hiru sebelum berlangganan.", action: "Mulai Coba Gratis →", href: "/register?plan=free" },
];
