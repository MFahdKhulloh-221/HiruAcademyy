# Hiru Academy — deploy pada VPS Ubuntu Sumopod

Kit ini dibuat berdasarkan struktur yang **terlihat** di GitHub branch `netlify-ui-baseline` pada 12 Oktober 2026: Frontend Next.js 16, Backend Laravel 12 (Dockerfile + `render-start.sh`), PostgreSQL, Laravel Sanctum. Tidak pernah menyimpan password/kunci apa pun.

## Syarat penting sebelum deployment

- Periksa URL `git remote -v` pada laptop secara privat, dan pastikan `94bce6e` sudah ada **di branch yang benar**. Ketika diperiksa, repo `MFahdKhulloh-221/HiruAcademyy` pada branch `netlify-ui-baseline` masih menunjukkan `8226fa3`. Jangan pasang kode usang.
- Pastikan VPS benar-benar Ubuntu dan ada akses SSH/Web Console yang berfungsi. Cek port 22 pada provider.
- Siapkan domain asli (tanpa `https://`) dan akses panel DNS domain. Tambahkan record `A` untuk host `@` ke `43.173.8.150`. Buka inbound TCP 80/443 pada Sumopod *dan* UFW jika diaktifkan; TCP 22 hanya dari IP admin. Port PostgreSQL 5432, Next 3000, dan PHP 10000 **jangan** diekspos ke internet.
- Jika sudah ada database produksi di Render/Supabase/lokal, **backup dahulu dan lakukan import**. Volume PostgreSQL baru di kit ini awalnya kosong. Jangan menghapus volume DB sembarangan.
- Cabut token GitHub yang pernah terekspos; jangan menaruh GitHub PAT/password atau kunci VPS di repository, URL remote, atau chat.

## Tahap A — siapkan repository pada PC

1. Ekstrak isi ZIP sehingga folder `deploy-vps` berada **sejajar** dengan folder `Frontend` dan `Backend` pada repo.
2. Setelah memastikan branch sesuai dan commit `94bce6e` sudah benar-benar tersedia: `git add deploy-vps && git commit -m "chore(deploy): add vps docker compose setup" && git push origin netlify-ui-baseline`.
3. **Jangan** commit `deploy-vps/.env`, `deploy-vps/backend.env` atau password lainnya. `.gitignore` di dalam folder ini sudah melindungi kedua file.

## Tahap B — masuk VPS dan pasang Docker

Dari PowerShell Windows: `ssh ubuntu@43.173.8.150` (atau gunakan Web Console Sumopod jika SSH belum bisa). Jangan kirim password ke chat.

Di VPS:

```bash
sudo apt-get update
sudo apt-get install -y git
# Ganti URL dengan repo yang benar setelah verifikasi origin di PC.
git clone --branch netlify-ui-baseline https://github.com/MFahdKhulloh-221/HiruAcademyy.git hiruacademy
cd ~/hiruacademy
bash deploy-vps/setup-ubuntu.sh
```

Script `setup-ubuntu.sh` memakai repository APT resmi Docker, bukan script `curl | bash`. Untuk repo **private**, gunakan SSH deploy key GitHub read-only milik VPS; jangan tempel PAT ke URL Git.

## Tahap C — domain, konfigurasi rahasia, dan jalankan

```bash
cd ~/hiruacademy
bash deploy-vps/prepare-env.sh
nano deploy-vps/.env
```

Ganti `DOMAIN=domain-anda.com` dengan **domain yang dimiliki**, misalnya `domainmiliksaya.id` (contoh, jangan memakai domain orang lain). Jangan ubah password acak di `.env` setelah DB pertama dibuat, kecuali melalui rotasi password PostgreSQL yang benar.

Lalu:

```bash
bash deploy-vps/deploy.sh
```

Script mencegah deployment jika commit `94bce6e` tidak ditemukan di riwayat git checkout. Perubahan source pada VPS tidak ditarik otomatis; setelah push baru, jalankan `git pull --ff-only origin netlify-ui-baseline` lalu `bash deploy-vps/deploy.sh`.

## Tahap D — verifikasi

```bash
cd ~/hiruacademy/deploy-vps
sudo docker compose ps
sudo docker compose logs --tail=80 backend
sudo docker compose logs --tail=80 frontend
sudo docker compose logs --tail=80 caddy
curl -I "https://DOMAIN_ANDA/"
curl -i "https://DOMAIN_ANDA/up"
```

Uji melalui browser: halaman utama, registrasi, login/logout, kunjungan dashboard, CSRF, admin, media upload, serta halaman yang membutuhkan DB. `/up` hanya menguji health route Laravel, bukan keseluruhan fungsional. Hanya sebut situs *online* setelah uji berhasil.

Jika SSL belum terbit, pastikan DNS menunjuk IP yang benar, port 80/443 terbuka, nameserver domain sesuai, dan tidak ada proses lain menempati port. HTTPS otomatis dikelola Caddy untuk domain valid.

## Catatan operasional penting

- DB, media upload public, dan media privat memakai Docker **named volumes**. Buat backup PostgreSQL dan media secara berkala, **di luar VPS**, sebelum perubahan besar. Jangan pernah jalankan `docker compose down -v` tanpa memahami akibatnya (menghapus data volume).
- `MAIL_MAILER=log` adalah placeholder yang tidak mengirim email nyata. Konfigurasi SMTP production pada `deploy-vps/backend.env` agar reset password via email berfungsi. Jangan masukkan SMTP password ke repository.
- Frontend mengikat `NEXT_PUBLIC_API_URL=https://DOMAIN` saat build. Jika domain berubah, build ulang frontend.
- Build Next.js memakai `next/font/google` sehingga perlu akses outbound ke Google Fonts selama build; kalau jaringan VPS memblokirnya, build akan gagal sebelum masalah ini diatasi.
- Docker Compose pada kit menjalankan PostgreSQL lokal. Jika database sudah ada di Supabase/host lain, **jangan migrasi ke database kosong tanpa mengamankan data**, dan ubah konfigurasi DB (serta backup) terlebih dahulu.
- Jika memakai `www`, tambahkan DNS dan virtual host Caddy kedua untuk redirect `www` ke domain utama setelah domain utama berhasil.
- `SESSION_SECURE_COOKIE=true` sengaja memerlukan HTTPS. Jangan mematikannya hanya agar login HTTP bisa berjalan.
- `TRUSTED_PROXIES=*` hanya aman karena backend tidak dipublikasikan langsung dan permintaan melewati Caddy pada jaringan Docker privat.
- Spesifikasi VPS belum diketahui. Next.js saat build bisa membutuhkan memori signifikan; VPS RAM kecil dapat gagal build.

## Diagram jalur HTTP

`Browser -> HTTPS Caddy (:443) -> /api/* dan /sanctum/* ke Laravel (:10000 internal); semua lainnya ke Next.js (:3000 internal). Laravel -> PostgreSQL (:5432 internal) + storage volume.`
