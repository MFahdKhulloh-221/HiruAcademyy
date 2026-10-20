# Video testimoni: audit dan demo lokal

## Batas aman

Demo hanya untuk evaluasi client, bukan testimonial siswa. Kedua video menampilkan teks persis `Demo Video Testimoni — Preview` dan `Demo / Preview untuk Evaluasi Client`, ditambah `BUKAN SISWA - BUKAN TESTIMONI NYATA`. Tidak ada identitas/foto siswa atau klaim hasil belajar.

Asset `assets/demo-testimonials/hiru-demo-01.mp4` (H.264) dan `hiru-demo-02.webm` (VP9): 5 detik, 960×540, 24 fps, tanpa audio. FFmpeg native; regenerate dari root dengan `powershell -ExecutionPolicy Bypass -File assets/demo-testimonials/generate.ps1`. Script hanya menimpa asset demo dan dua file teks pendamping. Tidak menyentuh `assets/tamnel*.png`.

Command menolak tanpa `--confirm-local-demo`, APP_ENV selain `testing`, config cache, DB non-PostgreSQL/non-loopback/non-`hiru_academy_test`, metadata server tidak cocok, schema non-demo atau search_path tidak cocok, dan media disk selain `public` dengan driver `local`. Tidak mengubah `.env`, credentials, production DB, atau remote object storage. Writes terbatas schema demo dan file UUID di local public disk. Jangan gunakan tunnel/proxy menuju production.

## Demo manual persisten

1. Buka PowerShell di `C:\HiruAcademy\Backend`. Gunakan credentials PostgreSQL lokal yang sudah tersedia. Jangan salin credentials production. Set environment sesi saja:

   ```powershell
   $env:APP_ENV='testing'
   $env:DB_CONNECTION='pgsql'
   $env:DB_HOST='127.0.0.1'
   $env:DB_DATABASE='hiru_academy_test'
   $env:DB_URL=''
   $env:HIRU_TEST_SCHEMA='hiru_backend_test_testimonial_demo_20261013'
   $env:APP_URL='http://localhost:8001'
   $env:SESSION_DRIVER='file'
   $env:SESSION_SECURE_COOKIE='false'
   $env:SANCTUM_STATEFUL_DOMAINS='localhost:3020,localhost:8001'
   $env:CORS_ALLOWED_ORIGINS='http://localhost:3020'
   php tests/prepare-schema.php
   ```

   Stop jika preparation gagal. Guard memverifikasi actual DB sebelum CREATE SCHEMA/migrasi. Migrasi hanya schema bernama di atas.

2. Buat dua row melalui services existing, bukan SQL seed langsung:

   ```powershell
   php artisan hiru:testimonials:demo --confirm-local-demo
   php artisan hiru:testimonials:demo --confirm-local-demo
   ```

   Run kedua harus menampilkan ID dan path sama. Existing row tidak direset: perubahan admin tetap tersimpan. Missing/invalid media existing menyebabkan abort, bukan duplikasi. Nama `Demo / Preview untuk Evaluasi Client 01` dan `02`; context label persis; judul `Demo Video Testimoni — Preview`; quote eksplisit placeholder, bukan siswa. Default Published, approved, source admin, landing=false. Setelah redesign, record baru type=video dengan managed thumbnail; record demo lama dipertahankan dan dimigrasikan menjadi video tanpa memalsukan thumbnail. Gunakan migration baru hanya pada schema demo terisolasi yang sudah diverifikasi sebelum menjalankan kode redesign. Tidak membuat user siswa. Untuk menampilkan di landing, edit masing-masing melalui `/admin/testimoni`, pilih Landing `Ya`, simpan. Draft menyembunyikan row dari publik.

3. Buat admin lokal khusus menggunakan command existing, tetap di terminal/schema yang sama:

   ```powershell
   php artisan hiru:admin:create
   ```

   Masukkan identitas dummy dan password lokal sendiri pada prompt tersembunyi. Command ini tidak dipanggil otomatis. Pastikan terminal tetap memakai target yang telah diverifikasi pada langkah 1; jangan pakai admin/credentials production. Jika admin demo sudah ada, cukup login kembali.

4. Pastikan `Backend/public/storage` mengarah ke `Backend/storage/app/public`. Jika belum ada, jalankan `php artisan storage:link` lokal; jangan menimpa link/path existing. Jalankan `php artisan serve --host=localhost --port=8001` pada terminal Backend yang sama.

5. Buka terminal lain di `C:\HiruAcademy\Frontend`:

   ```powershell
   $env:NEXT_PUBLIC_API_URL='http://localhost:8001'
   npm run dev -- --hostname localhost --port 3020
   ```

   Buka `http://localhost:3020/login`, login admin demo, lalu `/admin/testimoni`. Dua row tersedia; Lihat menampilkan native video; klik tautan video membuka resolved URL, bukan path mentah `media/video/...`. Buka `/testimoni` untuk dua kartu/video. Schema dan rows tetap ada setelah server dimatikan. Jalankan setup environment sama untuk melanjutkan. Tidak perlu seed ulang.

6. Cleanup opsional lewat existing admin API/UI: hapus kedua testimonial lebih dahulu; hapus managed media melalui `DELETE /api/admin/media` hanya setelah references kosong. Jangan drop DB/schema secara otomatis. File schema/migrasi retained sesuai workflow testing existing.

## Audit

- Routes publik: `GET /api/testimonials`, filter `landing=true|false|1|0`; invalid value 422. Query wajib `published=true`, `moderation_status=approved`, `consent_public=true`; landing hanya subset.
- Admin CRUD `/api/admin/testimonials`; upload/delete `/api/admin/media` dilindungi Sanctum, active account, admin role. `PublicContentService` menolak metadata spoofing/unknown fields, wajib pasangan video URL/title. Student hanya dapat mengubah own text/consent; submit ulang reset moderation/publication. Admin student moderation tidak boleh mengubah identitas/video; payload student memakai identitas/avatar user dan tidak mengirim video.
- `MediaService` menerima YouTube ID valid, remote MP4/WebM, managed UUID dengan MIME/file existing. Upload memakai finfo MIME + extension, format allowlist, controller configurable size; credential URL, unsafe scheme, traversal ditolak. Storage deletion memakai reference lock, menolak file referenced termasuk assessment snapshot.
- Fix: tabel admin sebelumnya menautkan raw storage path relatif; sekarang `contentMedia` memakai resolved/signed URL seperti preview existing. YouTube dan remote MP4/WebM tetap dipertahankan.
- OPEN: production upload limits/storage visibility ditentukan konfigurasi deployment, bukan demo. MIME/extension validation bukan pemeriksaan codec/duration/antivirus; container rusak dengan header valid masih mungkin diterima. Tidak menambahkan FFmpeg dependency server atau claim scan selesai. Signed URL dapat kedaluwarsa; reload fetch resolver baru. Third-party YouTube playback butuh network/provider availability.

## Validasi nyata

Backend PowerShell pada environment isolated langkah 1:

```powershell
php artisan test --filter='TestimonialDemoTest|MediaUploadTest|PublicContentTest'
```

Hasil: 43 test lulus, 987 assertions pada audit awal. Setelah label final: TestimonialDemoTest 2 lulus, 24 assertions; command persisten dijalankan dua kali, menghasilkan ID 15/16 dan path sama. Test memakai Storage::fake dan transaksi rollback. Test playable command skip dengan alasan eksplisit jika suite memakai schema non-demo; guard tanpa confirmation tetap diuji.

Frontend, jangan jalankan bersamaan dengan Playwright lain di port/output sama:

```powershell
npx playwright test --config=playwright.laravel.config.ts tests/testimonial-demo.laravel-regression.spec.ts --output=C:\Users\Tulo\AppData\Local\Temp\opencode\testimonial-demo-results
```

Hasil: 1 lulus (26.9 s). Upload dua actual asset melalui admin API; assert dua row, resolved links, preview admin, native playback currentTime>0 di `/testimoni` dan `/`; cleanup via admin DELETE testimonial lalu media. Browser runner memanggil guarded `tests/prepare-schema.php` sebelum fixture, target `hiru_academy_test`, unique `hiru_browser_test_*`, reuseExistingServer=false. Runner tidak menarget production. Browser test memakai landing=true khusus untuk membuktikan kedua halaman; command manual tetap landing=false.

Regresi final berurutan: `tests/testimonials.laravel-regression.spec.ts` dan `tests/testimonial-demo.laravel-regression.spec.ts` menghasilkan 3 lulus (57.8 s), output di `C:\Users\Tulo\AppData\Local\Temp\opencode\hiru-final-video-results`. Locator avatar lama ambigu karena dua input file; kini memakai label input di region `Foto Profil`, tanpa mengubah assertion persistensi. Login, pending/approved moderation, upload video, playback, reload dan logout/login avatar lulus. Run awal bersamaan menyebabkan trace ENOENT; jangan berbagi port/output antar suite. Lint, typecheck dan production build juga lulus.
