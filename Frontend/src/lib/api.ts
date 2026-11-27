export const AUTH_EXPIRED_EVENT = "hiru:auth-expired";

export class ApiError extends Error {
  constructor(public status: number, public errors: Record<string, string[]> = {}, message?: string) {
    super(message ?? (status === 422 ? "Periksa kembali data yang dimasukkan." : status === 401 || status === 419 ? "Sesi berakhir. Silakan masuk kembali." : status === 429 ? "Terlalu banyak percobaan. Silakan coba lagi nanti." : "Permintaan belum berhasil. Silakan coba lagi."));
    this.name = "ApiError";
  }
}

const fieldMessages: Record<string, string> = {
  identity: "Periksa email atau nomor WhatsApp dan kata sandi.",
  name: "Periksa nama lengkap.",
  email: "Periksa alamat email.",
  whatsapp: "Periksa nomor WhatsApp.",
  password: "Periksa kata sandi dan konfirmasinya.",
  password_confirmation: "Konfirmasi kata sandi harus sesuai.",
  country: "Periksa negara.",
  target_jlpt: "Periksa target JLPT.",
  referral_code: "Kode referral tidak valid atau tidak aktif. Periksa kode atau kosongkan untuk mendaftar tanpa referral.",
  token: "Tautan reset tidak valid atau kedaluwarsa.",
};

const learningMessages: Record<string, string> = {
  "Program memiliki relasi atau histori. Gunakan Nonaktifkan.": "Program tidak dapat dihapus karena masih memiliki paket, materi, transaksi, atau riwayat terkait. Ubah status menjadi Nonaktif untuk menghentikan penggunaannya.",
  "Chapter has Checkpoint questions and cannot be deleted.": "Chapter tidak dapat dihapus karena masih terhubung dengan soal Checkpoint. Periksa soal terkait terlebih dahulu.",
  "Chapter has retained learning attempts and cannot be deleted.": "Chapter memiliki riwayat pengerjaan siswa. Penghapusan permanen memerlukan konfirmasi tambahan.",
  "Chapter number already exists in this program.": "Nomor chapter sudah digunakan pada program ini. Pilih nomor lain.",
  "Only one video is allowed per chapter.": "Chapter ini sudah memiliki video. Edit video yang tersedia atau pilih chapter lain.",
  "Position is outside this program.": "Urutan chapter berada di luar jumlah chapter program. Pilih urutan yang tersedia.",
  "Set both Mini Checkpoint settings together.": "Isi durasi dan nilai kelulusan Mini Checkpoint secara bersamaan.",
  "Published Mini Checkpoint questions require chapter settings.": "Atur durasi dan nilai kelulusan sebelum menerbitkan soal Mini Checkpoint.",
  "Mini Checkpoint requires an N5–N2 program.": "Mini Checkpoint hanya tersedia untuk program JLPT N5–N2.",
  "Content is not allowed in this program family.": "Jenis materi ini belum didukung program yang dipilih.",
  "Existing content is not allowed in the target program family.": "Chapter tidak dapat dipindahkan karena memuat materi yang tidak didukung program tujuan.",
  "Text must not be empty.": "Teks materi tidak boleh kosong.",
  "Alternative text is required for an image.": "Isi deskripsi gambar untuk membantu siswa pengguna pembaca layar.",
  "Audio questions require an audio URL before publishing.": "Tambahkan audio sebelum menerbitkan soal audio.",
  "Reading questions require a passage before publishing.": "Tambahkan teks bacaan sebelum menerbitkan soal reading.",
};
const learningFields: Record<string, string> = {
  name: "Isi nama program yang valid dan belum digunakan.", slug: "Alamat program tidak valid atau sudah digunakan.", program: "Periksa hubungan dan riwayat program.",
  plan_code: "Pilih paket pembelajaran yang tersedia.", duration_months: "Isi durasi paket dalam bulan.", base_price: "Isi harga paket yang valid.",
  chapter: "Periksa chapter yang dipilih.", chapter_id: "Pilih chapter yang sesuai dengan program.", program_id: "Pilih program yang tersedia.",
  chapter_number: "Nomor chapter harus bilangan bulat positif dan belum digunakan.", sort_order: "Periksa urutan materi.",
  title: "Isi judul materi yang valid.", description: "Periksa deskripsi materi.", status: "Pilih status Draft atau Published.",
  japanese: "Isi teks Jepang pada bagian depan kartu.", reading: "Periksa bacaan kartu.", meaning: "Isi arti pada bagian belakang kartu.",
  question: "Isi pertanyaan yang valid.", options: "Lengkapi pilihan jawaban.", correct_option: "Pilih kunci jawaban yang sesuai.",
  audio_url: "Pilih audio yang valid.", video_url: "Pilih video yang valid.", file_url: "Pilih berkas materi yang valid.",
  reading_passage_id: "Pilih teks bacaan yang tersedia.", image_alt: "Isi deskripsi gambar.",
  mini_checkpoint_duration_minutes: "Isi durasi Mini Checkpoint yang valid.", mini_checkpoint_passing_score: "Isi nilai kelulusan antara 0 dan 100.",
};

const referralMessages: Record<string, string> = {
  "Program referral sedang tidak aktif.": "Program referral sedang tidak aktif. Kredit yang sudah dimiliki tetap mengikuti ketentuan penggunaan.",
  "Kode referral tidak ditemukan.": "Kode referral tidak ditemukan. Periksa kembali kode yang dimasukkan.",
  "Kode referral tidak aktif.": "Kode referral sedang tidak aktif. Gunakan kode aktif atau lanjutkan tanpa kode.",
  "Kode referral tidak ditemukan atau tidak aktif.": "Kode referral tidak ditemukan atau sedang tidak aktif. Periksa kode yang dimasukkan.",
  "Kode referral sendiri tidak dapat digunakan.": "Kode referral sendiri tidak dapat digunakan. Gunakan kode teman.",
  "Akun sudah terhubung dengan kode referral lain.": "Akunmu sudah terhubung dengan kode referral lain. Gunakan kode yang sudah tercatat.",
  "Kredit tidak mencukupi. Muat ulang tagihan.": "Saldo kredit berubah. Muat ulang ringkasan pesanan sebelum melanjutkan.",
  "Invoice ditahan atau dibatalkan oleh Admin.": "Invoice ditahan atau dibatalkan oleh Admin. Hubungi Admin untuk bantuan.",
  "Pembelian pertama telah berubah. Tahan invoice dan buat tagihan baru.": "Status pembelian pertama berubah. Hubungi Admin untuk memeriksa invoice sebelum membuat tagihan baru.",
  "Kredit sumber ditahan. Hubungi Admin.": "Kredit sedang ditahan. Hubungi Admin sebelum melanjutkan pembayaran.",
  "Invoice yang dibatalkan tidak dapat diubah.": "Invoice yang sudah dibatalkan tidak dapat diubah.",
  "Invoice dibayar tidak boleh dibatalkan melalui kontrol kredit. Gunakan penahanan dan rekonsiliasi.": "Invoice sudah dibayar. Gunakan penahanan dan rekonsiliasi, bukan pembatalan kredit.",
  "Kredit telah digunakan. Tahan dan rekonsiliasi; saldo tidak dikurangi otomatis.": "Kredit sudah digunakan. Tahan transaksi dan lakukan rekonsiliasi; saldo tidak dikurangi otomatis.",
};
const referralFields: Record<string, string> = {
  code: "Masukkan kode referral yang valid, maksimal 255 karakter.",
  referral_code: "Periksa kode referral yang dimasukkan.",
  credit: "Kredit belum dapat digunakan. Muat ulang tagihan atau hubungi Admin.",
  status: "Pilih status kode aktif atau nonaktif.",
  action: "Pilih tindakan tahan, batalkan kredit, atau batalkan invoice.",
  enabled: "Periksa status program referral.",
  inviter_reward: "Kredit untuk pengundang harus bilangan bulat antara 0 dan 1.000.000.000.",
  friend_discount: "Diskon teman harus bilangan bulat antara 0 dan 1.000.000.000.",
  minimum_purchase: "Minimum pembelian harus bilangan bulat antara 0 dan 1.000.000.000.",
  credit_limit: "Pilih sesuai jumlah tagihan atau tetapkan batas kredit Rp1 hingga Rp1.000.000.000.",
  expiry_days: "Pilih tidak kedaluwarsa atau tetapkan masa berlaku 1 hingga 36.500 hari.",
  combine_promo: "Periksa pilihan gabungan promo.",
  program_ids: "Pilih program yang valid tanpa duplikasi.",
  reason: "Isi alasan perubahan, maksimal 2.000 karakter.",
  confirmed: "Konfirmasi perubahan terlebih dahulu.",
};

let authenticated = false;
let sessionVersion = 0;
let csrfRequest: Promise<void> | null = null;
type PendingRead = { controller: AbortController; task: Promise<unknown>; subscribers: number };
const pendingReads = new Map<string, PendingRead>();

export function setApiAuthenticated(value: boolean, invalidateSession = true) {
  if (!invalidateSession && authenticated === value) return;
  authenticated = value;
  sessionVersion += 1;
  csrfRequest = null;
  for (const read of pendingReads.values()) read.controller.abort();
  pendingReads.clear();
}

function apiUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "");
  if (!base || !path.startsWith("/") || path.startsWith("//") || path.includes("\\") || path.split(/[?#]/)[0].split("/").some(segment => segment === "." || segment === ".." || segment.includes("%"))) throw new ApiError(0);
  try {
    const url = new URL(base + path);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error();
    return url.href;
  } catch {
    throw new ApiError(0);
  }
}

async function request(path: string, options: RequestInit): Promise<Response> {
  const version = sessionVersion;
  let response: Response;
  try {
    options.signal?.throwIfAborted();
    response = await fetch(apiUrl(path), { ...options, credentials: "include", cache: "no-store", redirect: "error" });
  } catch (error) {
    options.signal?.throwIfAborted();
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0);
  }
  options.signal?.throwIfAborted();
  if (!response.ok) {
    if ((response.status === 401 || response.status === 419) && authenticated && version === sessionVersion && typeof window !== "undefined") {
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    const errors: Record<string, string[]> = {};
    const referralRequest = /^\/api\/(?:student\/(?:affiliate\/validate|referral-quote|invoices(?:\/\d+(?:\/(?:submit|mark-paid))?)?)|admin\/referral-program(?:\/(?:invoices\/\d+\/control|codes\/\d+))?)$/.test(path);
    const studentTryOut = /^\/api\/student\/try-outs\/\d+\/attempts\/\d+(?:\/(?:answers|submit|next-session))?$/.test(path);
    const dailyPractice = /^\/api\/(?:admin|student)\/daily-practices(?:\/|\?|$)/.test(path);
    const placement = /^\/api\/(?:admin\/placement-(?:configs|questions|previews)(?:\/.*)?|placement(?:\/.*)?)$/.test(path);
    const miniBatch = path === "/api/admin/mini-checkpoint-questions/batch";
    const learningRequest = miniBatch || /^\/api\/admin\/(?:programs|chapters|flashcards|video-lessons|modules|reading-passages|reading-questions|audio-questions|mini-checkpoint-questions)(?:\/\d+)?$/.test(path);
    const body = response.status === 422 || studentTryOut ? await response.json().catch(() => null) : null;
    if (response.status === 422) {
      if (body?.errors && typeof body.errors === "object") {
        for (const key of Object.keys(body.errors)) {
          const field = key === "email_normalized" ? "email" : key === "whatsapp_normalized" ? "whatsapp" : key === "identifier" ? "identity" : key;
          if (learningRequest && Object.keys(errors).length < 20 && Array.isArray(body.errors[key])) {
            const safe = body.errors[key].filter((message: unknown): message is string => typeof message === "string" && Object.hasOwn(learningMessages, message)).map((message: string) => learningMessages[message]);
            const parts = field.split(".");
            const label = learningFields[miniBatch && parts[0] === "questions" ? parts[2] : parts[0]] ?? "Periksa isian materi dan ketentuan publikasinya.";
            errors[field] = safe.length ? safe.slice(0, 3) : [miniBatch && parts[0] === "questions" && /^\d+$/.test(parts[1]) ? `Soal ${Number(parts[1]) + 1}: ${label}` : label];
          } else if (referralRequest && Object.keys(errors).length < 20 && Array.isArray(body.errors[key]) && Object.hasOwn(referralFields, field.split(".")[0])) {
            const safe = body.errors[key].filter((message: unknown): message is string => typeof message === "string" && Object.hasOwn(referralMessages, message)).map((message: string) => referralMessages[message]).slice(0, 3);
            const safeField = field.split(".")[0];
            errors[safeField] = safe.length ? safe : [referralFields[safeField]];
          } else if (studentTryOut && Object.keys(errors).length < 10 && /^(?:answers(?:\.\d+)?|revision|finish_session)$/.test(field) && field.length <= 80 && Array.isArray(body.errors[key])) {
            errors[field] = [field.startsWith("answers") ? "Periksa jawaban: ID soal dan pilihan A–D harus valid." : field === "revision" ? "Revisi jawaban tidak valid. Sinkronkan kembali sebelum mengumpulkan." : "Status penyelesaian sesi tidak valid."];
          } else if (path === "/api/auth/register" && field === "whatsapp" && Array.isArray(body.errors[key]) && body.errors[key].includes("Nomor WhatsApp sudah digunakan. Silakan gunakan nomor lain.")) errors[field] = ["Nomor WhatsApp sudah digunakan. Silakan gunakan nomor lain."];
          else if (path === "/api/auth/register" && field === "email" && Array.isArray(body.errors[key]) && body.errors[key].includes("Email ini sudah terdaftar. Silakan masuk dengan akun tersebut atau gunakan email lain.")) errors[field] = ["Email ini sudah terdaftar. Silakan masuk dengan akun tersebut atau gunakan email lain."];
          else if (Object.hasOwn(fieldMessages, field)) errors[field] = [fieldMessages[field]];
          else if (path === "/api/student/testimonial" && ["type", "title", "video_title", "video_url", "video_thumbnail", "quote", "consent_public", "file"].includes(key) && Array.isArray(body.errors[key])) errors[key] = body.errors[key].filter((message: unknown): message is string => typeof message === "string").slice(0, 3);
          else if (/^\/api\/admin\/invoices\/\d+(?:\/cancel)?$/.test(path) && ["invoice", "status", "reason", "confirmation"].includes(field) && Array.isArray(body.errors[key])) errors[field] = body.errors[key].filter((message: unknown): message is string => typeof message === "string").slice(0, 3);
          else if (path === "/api/admin/certificate-issuer" && ["signature", "signature_position", "remove_signature"].includes(field) && Array.isArray(body.errors[key])) errors[field] = body.errors[key].filter((message: unknown): message is string => typeof message === "string").slice(0, 3);
          else if (placement && Object.keys(errors).length < 25 && Array.isArray(body.errors[key])) errors[field] = body.errors[key].filter((message: unknown): message is string => typeof message === "string").slice(0, 3);
          else if ((path.startsWith("/api/admin/mini-checkpoint-questions") || path.startsWith("/api/admin/try-outs") || path.startsWith("/api/admin/daily-practices")) && Array.isArray(body.errors[key])) errors[field] = body.errors[key].filter((message: unknown): message is string => typeof message === "string");
        }
      }
      if (path === "/api/auth/login" && !Object.keys(errors).length) errors.identity = [fieldMessages.identity];
    }
    if (learningRequest && response.status === 422) throw new ApiError(response.status, errors, Object.values(errors).flat().slice(0, 3).join(" ") || "Perubahan materi ditolak. Periksa isian dan hubungan materi terkait.");
    if (referralRequest && response.status === 422) throw new ApiError(response.status, errors, Object.values(errors).flat().slice(0, 3).join(" ") || undefined);
    if (studentTryOut) {
      const statusMessage = response.status === 401 || response.status === 419 ? "Sesi berakhir. Silakan masuk kembali." : response.status === 403 ? "Akses Try Out ditolak. Periksa hak akses akun." : response.status === 409 ? body?.message === "Stale answer revision." ? "Revisi jawaban berubah. Muat ulang untuk mengambil revisi terbaru sebelum mengumpulkan." : "Status attempt berubah. Muat ulang untuk memeriksa jawaban atau hasil." : response.status === 422 ? "Data Try Out tidak valid." : response.status === 429 ? "Terlalu banyak permintaan. Tunggu sebelum mencoba kembali." : response.status >= 500 ? "Permintaan belum berhasil karena gangguan server. Status pengumpulan belum dapat dipastikan; coba kembali untuk memeriksa dan melanjutkan attempt yang sama." : "Permintaan Try Out belum berhasil. Periksa kembali attempt.";
      throw new ApiError(response.status, errors, `Try Out (HTTP ${response.status}): ${statusMessage}${Object.values(errors).length ? ` ${Object.values(errors).flat().slice(0, 3).join(" ")}` : ""}`);
    }
    if (dailyPractice && response.status === 409) throw new ApiError(409, errors, "Data latihan berubah. Muat ulang untuk memeriksa jawaban atau hasil yang tersimpan sebelum mencoba kembali.");
    if (placement) {
      const detail = Object.values(errors).flat().slice(0, 5).join(" ");
      throw new ApiError(response.status, errors, response.status === 403 && path === "/api/placement/attempts" && options.method === "POST" ? "Kamu sedang masuk sebagai Admin. Silakan keluar dari akun Admin terlebih dahulu untuk mengikuti Placement Test." : response.status === 409 ? "Jawaban atau sesi berubah. Muat ulang halaman untuk melanjutkan data yang tersimpan." : detail || undefined);
    }
    throw new ApiError(response.status, errors, path === "/api/auth/register" && response.status >= 500 ? "Pendaftaran belum berhasil karena gangguan sistem. Silakan coba lagi nanti." : undefined);
  }
  return response;
}

export async function apiDownload(path: string, signal?: AbortSignal): Promise<Blob> {
  const version = sessionVersion;
  const response = await request(path, { method: "GET", headers: { Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }, signal });
  const blob = await response.blob();
  signal?.throwIfAborted();
  if (version !== sessionVersion) throw new ApiError(419);
  return blob;
}

function csrfToken() {
  try {
    const token = typeof document === "undefined" ? undefined : document.cookie.split(";").map(cookie => cookie.trim()).find(cookie => cookie.startsWith("XSRF-TOKEN="))?.slice("XSRF-TOKEN=".length);
    return token ? decodeURIComponent(token) : undefined;
  } catch {
    throw new ApiError(419);
  }
}

async function readResponse<T>(path: string, options: RequestInit): Promise<T> {
  const response = await request(path, options);
  if (response.status === 204 || options.method === "HEAD") return undefined as T;
  try {
    const data = await response.json() as T;
    options.signal?.throwIfAborted();
    return data;
  } catch {
    if (options.signal?.aborted) options.signal.throwIfAborted();
    throw new ApiError(response.status);
  }
}

function sharedRead<T>(key: string, path: string, options: RequestInit): Promise<T> {
  const signal = options.signal;
  signal?.throwIfAborted();
  let read = pendingReads.get(key);
  if (read?.controller.signal.aborted) {
    pendingReads.delete(key);
    read = undefined;
  }
  if (!read) {
    const controller = new AbortController();
    read = { controller, subscribers: 0, task: readResponse(path, { ...options, signal: controller.signal }) };
    pendingReads.set(key, read);
    const current = read;
    const remove = () => { if (pendingReads.get(key) === current) pendingReads.delete(key); };
    void read.task.then(remove, remove);
  }
  const current = read;
  current.subscribers += 1;
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    function release() {
      settled = true;
      signal?.removeEventListener("abort", abort);
      current.subscribers -= 1;
      if (!current.subscribers) {
        if (pendingReads.get(key) === current) pendingReads.delete(key);
        current.controller.abort();
      }
    }
    function abort() {
      if (settled) return;
      release();
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    }
    signal?.addEventListener("abort", abort, { once: true });
    current.task.then(data => {
      if (settled) return;
      release();
      try { resolve(structuredClone(data) as T); } catch (error) { reject(error); }
    }, error => {
      if (settled) return;
      release();
      reject(error);
    });
  });
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  options.signal?.throwIfAborted();
  const version = sessionVersion;
  const method = (options.method ?? "GET").toUpperCase();
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    let token = csrfToken();
    if (!token) {
      if (!csrfRequest) {
        const task = request("/sanctum/csrf-cookie", { headers: { Accept: "application/json" } }).then(() => undefined).finally(() => { if (csrfRequest === task) csrfRequest = null; });
        csrfRequest = task;
      }
      await csrfRequest;
      token = csrfToken();
    }
    options.signal?.throwIfAborted();
    if (version !== sessionVersion || !token) throw new ApiError(419);
    headers.set("X-XSRF-TOKEN", token);
  }
  if (typeof options.body === "string" && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const init = { ...options, method, headers };
  if (typeof window !== "undefined" && method === "GET" && Object.keys(options).every(key => ["method", "headers", "signal"].includes(key))) {
    const key = JSON.stringify([sessionVersion, apiUrl(path), Array.from(headers.entries()).sort()]);
    return sharedRead<T>(key, path, init);
  }
  return readResponse<T>(path, init);
}
