# Testimoni text/video — kontrak dan deployment

## Arsitektur

Satu tabel `testimonials`, satu service konten dan sistem media existing. Siswa memiliki maksimal satu record per `(user_id, type)`; admin dapat memiliki banyak record manual dengan user_id NULL. Avatar akun terpisah dari video_thumbnail. `title` menjadi judul utama, `video_title` tetap alias kompatibilitas.

Public wajib approved, consent_public, published. `/api/testimonials` memilih show_on_testimonials; `?landing=true` memilih landing secara independen. Frontend memisahkan text/video, tanpa hardcoded testimonial. Player bersama menggunakan parser allowlist provider; iframe/native dibuat setelah klik. Instagram tidak di-embed. Drive selalu menyediakan tautan resmi karena browser tidak dapat memastikan akses file cross-origin.

## Endpoint dan penggunaan

Endpoint existing tetap dipakai:
- `GET /api/student/testimonial?type=text|video`: record sendiri; tanpa type tetap text.
- `PUT /api/student/testimonial`: text memakai context/quote/consent_public; video menambah title/video_url/video_thumbnail dan deskripsi quote opsional. Approved tetap 409 jika diedit. Pending/rejected dapat dikirim ulang, reset menjadi pending dengan semua visibility false.
- `GET|POST /api/admin/testimonials`, `PATCH|DELETE /api/admin/testimonials/{id}`: Admin existing. Student PATCH terbatas moderation_status/moderation_note/published/landing/show_on_testimonials/sort_order.
- `GET /api/testimonials` dan `GET /api/testimonials?landing=true`: kanal terpisah dengan gates publik sama.
- `/api/admin/media`: upload existing hanya Admin; siswa tidak memakai endpoint ini.

Siswa memilih tab Testimoni Tertulis atau Testimoni Video, mengisi form, preview, dan consent. Admin memilih Testimoni Biasa/Video, filter status/sumber, Lihat, Setujui atau Tolak dengan catatan. Persetujuan pertama mengaktifkan global dan kedua kanal; setelah itu Admin mengontrol setiap kanal serta global secara eksplisit. Repeat approval tidak mengubah pilihan kanal/nonaktif. Delete memiliki dialog nama dan jenis dan hanya menghapus record tersebut.

## Migration

`Backend/database/migrations/2026_10_13_000001_add_testimonial_types_and_channels.php` forward-only. Record lama tanpa video menjadi text; record dengan video menjadi video dan quote tetap disimpan sebagai deskripsi. Tidak menggandakan atau menghapus record/consent/ownership/moderation. Thumbnail legacy boleh NULL; avatar tidak disalin menjadi thumbnail. Kanal halaman testimoni dibackfill mengikuti published lama. Penanda first approval mencegah approval berulang mengaktifkan ulang konten lama.

Unique user_id diganti unique(user_id,type). Check quote tetap mewajibkan tulisan untuk text; video boleh deskripsi kosong. Check type membatasi text/video. PostgreSQL mengizinkan banyak user_id NULL untuk admin. Hard delete hanya record testimonial; user, avatar dan media tidak dihapus otomatis. Media deletion existing tetap menolak referenced files.

## Provider

- YouTube: HTTPS watch, short link, shorts, embed; ID tepat 11 karakter; privacy-enhanced embed.
- Instagram: HTTPS hostname resmi dan path post/reel/tv; thumbnail serta Tonton di Instagram. Tidak scraper/download.
- Google Drive: HTTPS file link atau open?id; preview resmi dan Buka di Google Drive. File harus dapat diakses oleh orang yang memiliki tautan; tidak melewati login/private permissions.
- Admin native: upload MP4/WebM existing; managed path atau HTTPS URL. HTTP hanya loopback development.
- Siswa: tautan provider dan thumbnail HTTPS, tanpa endpoint upload Admin.

URL bercredential, scheme unsafe, hostname tiruan dan path malformed ditolak. Tidak raw HTML embed atau server-side arbitrary fetch. External playback/thumbnail tetap bergantung akses provider; valid URL bukan jaminan availability/izin konten.

## Deployment aman setelah persetujuan

1. Backup PostgreSQL dan media volume, uji restore, catat release sebelumnya. Jangan ubah APP_KEY/env atau hapus volume.
2. Jalankan migration rehearsal pada salinan database yang sudah dianonimkan dan terisolasi; periksa jumlah record, quote, URL, consent, owner dan moderation sebelum/sesudah.
3. Jadwalkan maintenance singkat: schema dan kode baru harus dirilis sebagai pasangan. Build image aplikasi dengan konfigurasi existing; jangan jalankan demo/seeder production.
4. Jalankan migration forward-only sekali melalui proses release existing pada target yang telah diverifikasi. Batch ini tidak menjalankan migration di production atau database development utama.
5. Jalankan smoke test Student submit text/video, Admin approve, kanal independen, global disable, delete salah satu, dan existing learning/auth.
6. Jika gagal, hentikan writes. Jangan `migrate:rollback`: down sengaja menolak karena user mungkin sudah memiliki dua record. Gunakan corrective forward migration/release; restore backup hanya sebagai prosedur recovery yang disetujui, karena dapat membuang writes setelah backup. Jangan jalankan kode lama yang menganggap satu record/user setelah writes baru terjadi.

## Validasi lokal

- Laravel feature/security/migration/race tests: 49 lulus, 1134 assertions; PostgreSQL test lokal dan schema dedicated guarded.
- Native frontend contracts/provider/UI plus regresi counter/blog: 13 lulus.
- Playwright provider publik: 3 lulus pada 390/768/1440, lazy media, keyboard, fallback, dan kedua halaman.
- Playwright QA footer/counter/blog/empty/error: 8 lulus.
- Lint, typecheck, dan production build Next.js 16.3.0 lulus.
- Full Laravel browser lifecycle: hasil final dicatat pada laporan pekerjaan; provider eksternal diblokir/mocked dalam browser agar test tidak bergantung YouTube/Instagram/Drive nyata. API lokal tetap asli.

Docker Compose dan storage existing tidak diubah. Migration menambah field/constraint tanpa reset tabel tetapi mengambil lock PostgreSQL; durasi maintenance harus diukur pada rehearsal, bukan ditebak.
