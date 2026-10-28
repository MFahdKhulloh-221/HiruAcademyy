# PostgreSQL disposable — prosedur, BELUM dijalankan

Jangan jalankan perintah tulis berikut sebelum izin testing diberikan. Jangan gunakan DB/role/password existing. Tidak perlu mengubah `.env`.

1. Setelah izin, gunakan host Linux disposable tanpa akses/credential production. Buat container PostgreSQL 16 terpisah, tanpa mount/volume existing: nama `hiru-disposable-test`, database `hiru_academy_test`, tmpfs pada PGDATA. Gunakan `--network host` dengan PostgreSQL `-c listen_addresses=127.0.0.1 -c port=55432`; jangan gunakan port mapping atau port 5432 existing. PHP runner berjalan pada host Linux disposable yang sama. Gunakan password baru via environment shell privat, bukan command history/repo.
2. Di container tersebut saja, buat role `hiru_test_runner` dengan `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`. Jadikan role pemilik `hiru_academy_test`; cabut CONNECT ke database lain untuk role/PUBLIC. Gunakan pg_hba.conf yang mengizinkan koneksi TCP role ini hanya ke `hiru_academy_test` dari loopback dengan `scram-sha-256`, lalu menolak koneksi role ini ke database lain. Admin container hanya untuk provisioning, bukan runner. Jangan gunakan credential lokal/production.
3. Pasang marker: `COMMENT ON DATABASE hiru_academy_test IS 'hiru-disposable-test-only'`. Dedicated container tidak memiliki database aplikasi lain. Buat schema `hiru_backend_test_gamification_final_20261008` milik runner; nama ini masih diwajibkan TryOutAssessmentTest.
4. Sebelum setiap perintah, set environment proses: `APP_ENV=testing`, `DB_CONNECTION=pgsql`, `DB_HOST=127.0.0.1`, `DB_PORT=55432`, `DB_DATABASE=hiru_academy_test`, `DB_USERNAME=hiru_test_runner`, password baru, `DB_URL=` dan `HIRU_TEST_SCHEMA=hiru_backend_test_gamification_final_20261008`. Jangan gunakan config cache. Jangan gunakan koneksi read/write tambahan.
5. Jalankan guard di bawah menggunakan psql **dengan role runner dan environment koneksi yang sama**. Petakan DB_HOST/PORT/DATABASE/USERNAME/PASSWORD ke PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD; set `PGOPTIONS=-c search_path=hiru_backend_test_gamification_final_20261008`. Hasil harus `t`, tanpa error; wrapper/operator wajib membatalkan perintah berikutnya jika hasil bukan tepat `t` atau psql exit nonzero. Verifikasi `docker inspect hiru-disposable-test`: tmpfs PGDATA, network host, tidak ada mount existing. Periksa PostgreSQL mendengar hanya pada loopback port 55432. DatabaseSafety dan Tests\\TestCase juga memverifikasi nama DB serta alamat loopback sebelum setUp/seeder. Jika ada perbedaan, STOP.

```sql
SELECT current_database() = 'hiru_academy_test'
 AND current_user = 'hiru_test_runner'
 AND host(inet_server_addr()) IN ('127.0.0.1', '::1')
 AND current_schema() = 'hiru_backend_test_gamification_final_20261008'
 AND shobj_description(d.oid, 'pg_database') = 'hiru-disposable-test-only'
 AND NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole
 AND NOT r.rolreplication
FROM pg_database d JOIN pg_roles r ON r.rolname = current_user
WHERE d.datname = current_database();
```

Catatan Docker: inet_server_addr() dapat berupa IP bridge container. DatabaseSafety existing hanya menerima loopback. Gunakan `--network host` di host Linux disposable, atau jalankan PHP dan PostgreSQL pada namespace jaringan container yang sama sehingga PHP memakai loopback. Jangan melemahkan DatabaseSafety untuk menerima IP bridge. Pada Windows tanpa runtime container/namespace yang sesuai, testing tetap BLOCKED.

6. Setelah guard PASS dan izin tulis aktif, jalankan migration hanya di lingkungan disposable tersebut: `php artisan migrate --env=testing --no-interaction`. Lalu dari Backend: `php ./vendor/bin/phpunit --filter 'IdentityTest|InvoiceTest|DashboardContractTest|TryOutAssessmentTest'`. Suite memanggil seeder internal; izin harus mencakupnya. Jangan menjalankan db:seed terpisah atau migration pada DB existing. Role runner tidak mempunyai akses ke database lokal/production; namespace terisolasi tidak boleh memiliki rute/credential production.
7. Simpan hasil tes saja. Hentikan container disposable setelah selesai; jangan hapus/reset volume existing. Jangan memakai `docker compose down -v`.

OPEN: runtime Docker lokal belum tersedia; provisioning/guard/tes belum dieksekusi. Prosedur ini bukan bukti suite kritis PASS.
