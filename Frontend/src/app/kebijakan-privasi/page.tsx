import { PublicPage } from "@/components/public-shell";

export default function PrivacyPage() {
  return (
    <PublicPage active="Kebijakan Privasi">
      <main className="public-main privacy-page">
        <article>
          <p className="kicker">KEBIJAKAN PRIVASI</p>
          <h1>Kebijakan Privasi Hiru Academy</h1>
          <p>
            Terakhir diperbarui: Oktober 2026
          </p>
          <p>
            Hiru Academy (&quot;kami&quot;) menghargai dan berkomitmen melindungi
            privasi serta data pribadi setiap pengguna (&quot;kamu&quot;) yang
            mengakses situs web dan layanan kami di{" "}
            <strong>hiruacademy.com</strong>. Kebijakan Privasi ini menjelaskan
            data apa saja yang kami kumpulkan, untuk tujuan apa, bagaimana kami
            menyimpan dan melindunginya, serta hak-hak yang kamu miliki atas
            data tersebut.
          </p>
          <p>
            Kebijakan ini disusun mengacu pada{" "}
            <strong>
              Undang-Undang Republik Indonesia Nomor 27 Tahun 2022 tentang
              Pelindungan Data Pribadi (UU PDP)
            </strong>{" "}
            beserta peraturan turunannya.
          </p>

          <section>
            <h2>1. Cakupan Kebijakan</h2>
            <p>
              Kebijakan ini berlaku untuk seluruh layanan Hiru Academy,
              termasuk:
            </p>
            <ul>
              <li>Situs web dan aplikasi pembelajaran Hiru Academy</li>
              <li>Pendaftaran akun dan pengelolaan profil</li>
              <li>Placement Test dan asesmen pembelajaran (Checkpoint, Try Out, Mini Checkpoint)</li>
              <li>Pembelian program dan pembuatan invoice</li>
              <li>Konten pembelajaran: video, flashcard, latihan, dan rekaman kelas</li>
              <li>Komunikasi melalui WhatsApp dan email</li>
            </ul>
          </section>

          <section>
            <h2>2. Data yang Kami Kumpulkan</h2>

            <h3>2.1 Data yang kamu berikan langsung</h3>
            <ul>
              <li>
                <strong>Pendaftaran akun:</strong> nama lengkap, alamat email,
                nomor WhatsApp, kata sandi (disimpan terenkripsi), dan target
                ujian JLPT (N5–N1).
              </li>
              <li>
                <strong>Profil:</strong> foto avatar, negara/lokasi, dan
                perubahan data profil lainnya.
              </li>
              <li>
                <strong>Placement Test:</strong> nama, nomor WhatsApp, target
                ujian, jawaban tes, dan pilihan persetujuan.
              </li>
              <li>
                <strong>Asesmen pembelajaran:</strong> jawaban Checkpoint, Try
                Out, dan Mini Checkpoint, skor, waktu pengerjaan, dan riwayat
                percobaan.
              </li>
              <li>
                <strong>Pembelian program:</strong> pilihan level JLPT, paket
                pembelajaran, kode referral (jika ada), dan data invoice.
              </li>
              <li>
                <strong>Komunikasi:</strong> pesan yang kamu kirim melalui
                WhatsApp atau formulir kontak.
              </li>
            </ul>

            <h3>2.2 Data yang dikumpulkan secara otomatis</h3>
            <ul>
              <li>
                <strong>Cookie dan sesi:</strong> kami menggunakan cookie untuk
                autentikasi sesi (session cookie) dan perlindungan CSRF. Cookie
                ini diperlukan agar layanan berfungsi dengan baik dan tidak
                digunakan untuk melacak aktivitasmu di situs lain.
              </li>
              <li>
                <strong>Data penggunaan:</strong> progres belajar, chapter yang
                diakses, kartu flashcard yang dipelajari, dan riwayat latihan.
              </li>
              <li>
                <strong>Analitik (jika diaktifkan):</strong> kami dapat
                menggunakan Google Analytics 4 (GA4) dan/atau Meta Pixel untuk
                memahami pola penggunaan situs secara agregat. Penggunaan
                analitik pihak ketiga ini tunduk pada kebijakan privasi
                masing-masing penyedia. Kamu dapat menolak cookie analitik
                jika fitur persetujuan cookie tersedia.
              </li>
              <li>
                <strong>Penyimpanan lokal (localStorage):</strong> beberapa data
                preferensi dan sesi disimpan secara lokal di perangkatmu untuk
                meningkatkan pengalaman penggunaan. Data ini tidak dikirim ke
                server kami.
              </li>
            </ul>

            <h3>2.3 Data yang tidak kami kumpulkan</h3>
            <p>
              Kami <strong>tidak</strong> mengumpulkan informasi kartu
              kredit, rekening bank, atau data pembayaran digital secara
              langsung. Verifikasi pembayaran dilakukan oleh Admin melalui
              konfirmasi manual.
            </p>
          </section>

          <section>
            <h2>3. Dasar Hukum dan Tujuan Pemrosesan</h2>
            <p>
              Sesuai Pasal 20 dan Pasal 21 UU PDP, kami memproses data pribadi
              kamu berdasarkan:
            </p>
            <ul>
              <li>
                <strong>Persetujuan (consent):</strong> saat kamu mendaftar akun,
                mengikuti Placement Test, atau memberikan persetujuan untuk
                menerima informasi melalui WhatsApp.
              </li>
              <li>
                <strong>Pelaksanaan perjanjian:</strong> untuk menyediakan
                layanan pembelajaran yang kamu pilih, mengaktifkan akses program
                setelah pembayaran, dan mencatat progres belajar.
              </li>
              <li>
                <strong>Kepentingan sah (legitimate interest):</strong> untuk
                menjaga keamanan akun, mencegah penyalahgunaan, dan meningkatkan
                kualitas layanan.
              </li>
            </ul>

            <p>Secara spesifik, data pribadimu kami gunakan untuk:</p>
            <ol>
              <li>Membuat dan mengelola akun pembelajaran</li>
              <li>Menjalankan asesmen dan menampilkan hasil serta rekomendasi level</li>
              <li>Menyimpan dan menampilkan progres belajar</li>
              <li>Memproses pembelian program dan mengaktifkan akses</li>
              <li>Mengirim informasi terkait program dan hasil belajar melalui WhatsApp (hanya dengan persetujuanmu)</li>
              <li>Menjaga keamanan akun dan mencegah akses tidak sah</li>
              <li>Menganalisis penggunaan layanan secara agregat untuk peningkatan kualitas</li>
            </ol>
          </section>

          <section>
            <h2>4. Penyimpanan dan Keamanan Data</h2>
            <ul>
              <li>
                Kata sandi disimpan dalam bentuk <strong>hash terenkripsi</strong>{" "}
                dan tidak pernah disimpan dalam bentuk teks biasa. Tidak ada
                pihak, termasuk tim kami, yang dapat membaca kata sandimu.
              </li>
              <li>
                Komunikasi antara perangkatmu dan server kami dilindungi dengan
                enkripsi <strong>HTTPS/TLS</strong>.
              </li>
              <li>
                Sesi autentikasi dilindungi dengan mekanisme{" "}
                <strong>CSRF token</strong> untuk mencegah serangan pemalsuan
                permintaan.
              </li>
              <li>
                Akses ke data pengguna dibatasi hanya untuk personel yang
                memerlukan sesuai perannya (prinsip <em>least privilege</em>).
              </li>
              <li>
                Data disimpan di server yang berlokasi sesuai kebutuhan
                operasional. Jika terjadi transfer data ke luar wilayah Indonesia,
                kami memastikan tingkat perlindungan yang setara atau lebih tinggi
                sesuai ketentuan UU PDP.
              </li>
            </ul>
          </section>

          <section>
            <h2>5. Retensi Data</h2>
            <p>
              Kami menyimpan data pribadimu selama akunmu aktif dan selama
              diperlukan untuk tujuan yang telah disebutkan. Secara spesifik:
            </p>
            <ul>
              <li>
                <strong>Data akun dan profil:</strong> disimpan selama akun aktif.
                Jika kamu menghapus akun, data akan dihapus atau dianonimkan
                dalam waktu paling lambat 30 hari kerja.
              </li>
              <li>
                <strong>Data asesmen dan progres:</strong> disimpan selama akun
                aktif untuk menampilkan riwayat dan hasil belajar.
              </li>
              <li>
                <strong>Data invoice:</strong> disimpan sesuai kewajiban
                pencatatan keuangan yang berlaku.
              </li>
              <li>
                <strong>Cookie sesi:</strong> berakhir saat sesi browser ditutup
                atau sesuai durasi sesi yang ditetapkan.
              </li>
            </ul>
          </section>

          <section>
            <h2>6. Hak-Hak Kamu sebagai Pemilik Data</h2>
            <p>
              Sesuai Pasal 5 sampai Pasal 16 UU PDP, kamu memiliki hak berikut:
            </p>
            <ol>
              <li>
                <strong>Hak akses</strong> — mengetahui data pribadi apa saja
                yang kami simpan tentang kamu.
              </li>
              <li>
                <strong>Hak koreksi</strong> — meminta perbaikan data yang tidak
                akurat atau tidak lengkap. Kamu dapat memperbarui nama, email,
                nomor WhatsApp, dan informasi profil lainnya melalui halaman
                pengaturan akun.
              </li>
              <li>
                <strong>Hak hapus</strong> — meminta penghapusan data pribadi
                jika data tidak lagi diperlukan untuk tujuan pemrosesan.
              </li>
              <li>
                <strong>Hak tarik persetujuan</strong> — menarik persetujuan
                yang sebelumnya telah diberikan, termasuk persetujuan menerima
                informasi melalui WhatsApp, tanpa memengaruhi hak akses
                layanan utama.
              </li>
              <li>
                <strong>Hak portabilitas</strong> — meminta salinan data
                pribadimu dalam format yang umum dan dapat dibaca mesin.
              </li>
              <li>
                <strong>Hak keberatan</strong> — mengajukan keberatan atas
                pemrosesan data dalam kondisi tertentu sesuai ketentuan UU PDP.
              </li>
            </ol>
            <p>
              Untuk menjalankan hak-hak di atas, hubungi kami melalui kontak yang
              tercantum di bagian bawah kebijakan ini.
            </p>
          </section>

          <section>
            <h2>7. Pilihan Persetujuan</h2>
            <ul>
              <li>
                Persetujuan menerima penjelasan hasil dan informasi program
                melalui WhatsApp bersifat <strong>opsional</strong> dan tidak
                menjadi syarat untuk mengikuti Placement Test atau menggunakan
                layanan lainnya.
              </li>
              <li>
                Kamu dapat menarik persetujuan WhatsApp kapan saja dengan
                menghubungi kami.
              </li>
              <li>
                Persetujuan terhadap Kebijakan Privasi ini diperlukan saat
                mendaftar akun dan sebelum mengikuti Placement Test.
              </li>
            </ul>
          </section>

          <section>
            <h2>8. Berbagi Data dengan Pihak Ketiga</h2>
            <p>
              Kami <strong>tidak menjual</strong> data pribadimu kepada pihak
              ketiga mana pun. Kami hanya dapat membagikan data dalam keadaan
              berikut:
            </p>
            <ul>
              <li>
                <strong>Penyedia layanan teknis:</strong> server hosting,
                layanan email, dan layanan penyimpanan yang membantu
                mengoperasikan platform kami. Penyedia ini terikat kontrak
                kerahasiaan dan hanya memproses data sesuai instruksi kami.
              </li>
              <li>
                <strong>Analitik pihak ketiga:</strong> Google Analytics dan
                Meta Pixel (jika diaktifkan) menerima data penggunaan secara
                anonim/agregat.
              </li>
              <li>
                <strong>Kewajiban hukum:</strong> jika diwajibkan oleh hukum,
                regulasi, atau proses hukum yang berlaku di Indonesia.
              </li>
            </ul>
          </section>

          <section>
            <h2>9. Perlindungan Data Anak</h2>
            <p>
              Layanan Hiru Academy ditujukan untuk pengguna yang berusia
              minimal 13 tahun. Jika kamu berusia di bawah 17 tahun, kami
              menyarankan pendampingan orang tua atau wali saat mendaftar dan
              menggunakan layanan. Jika kami mengetahui bahwa kami telah
              mengumpulkan data dari anak di bawah 13 tahun tanpa persetujuan
              orang tua, kami akan segera menghapus data tersebut.
            </p>
          </section>

          <section>
            <h2>10. Insiden Keamanan Data</h2>
            <p>
              Jika terjadi kebocoran atau pelanggaran keamanan data pribadi,
              kami akan:
            </p>
            <ol>
              <li>
                Memberitahukan kepada kamu dan kepada lembaga berwenang paling
                lambat <strong>3×24 jam</strong> sejak insiden diketahui, sesuai
                ketentuan UU PDP.
              </li>
              <li>
                Mengambil langkah-langkah penanggulangan segera untuk
                meminimalkan dampak.
              </li>
              <li>
                Menyampaikan informasi mengenai data yang terdampak dan
                langkah-langkah yang dapat kamu ambil untuk melindungi diri.
              </li>
            </ol>
          </section>

          <section>
            <h2>11. Perubahan Kebijakan Privasi</h2>
            <p>
              Kami dapat memperbarui Kebijakan Privasi ini dari waktu ke waktu
              untuk mencerminkan perubahan layanan, teknologi, atau regulasi.
              Perubahan material akan diinformasikan melalui situs web atau email.
              Tanggal &quot;Terakhir diperbarui&quot; di bagian atas menunjukkan
              versi terkini. Dengan terus menggunakan layanan setelah perubahan
              berlaku, kamu dianggap menyetujui Kebijakan Privasi yang
              diperbarui.
            </p>
          </section>

          <section>
            <h2>12. Hubungi Kami</h2>
            <p>
              Jika kamu memiliki pertanyaan, permintaan, atau keluhan terkait
              data pribadimu atau Kebijakan Privasi ini, silakan hubungi kami
              melalui:
            </p>
            <ul>
              <li>
                <strong>WhatsApp:</strong> melalui tautan resmi di halaman
                situs kami
              </li>
              <li>
                <strong>Email:</strong> alamat email resmi yang tercantum di
                situs Hiru Academy
              </li>
            </ul>
            <p>
              Kami akan merespons permintaan terkait hak data pribadi dalam
              waktu paling lambat <strong>3×24 jam</strong> sejak permintaan
              diterima.
            </p>
          </section>
        </article>
      </main>
    </PublicPage>
  );
}
