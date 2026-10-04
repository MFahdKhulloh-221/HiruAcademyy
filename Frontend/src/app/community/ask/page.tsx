import Link from "next/link";
import { StudentBreadcrumb } from "@/components/student-breadcrumb";
import { StudentNavigation } from "@/components/student-navigation";

export default async function AskSenseiPage({ searchParams }: { searchParams: Promise<{ membership?: string }> }) {
  const params = await searchParams;
  const membership = params.membership === "lms" || params.membership === "sensei" ? params.membership : "free";

  return (
    <div className="supporting-shell student-shell">
      <StudentNavigation membership={membership} />
      <main className="supporting-main">
        <StudentBreadcrumb items={[{ label: "Diskusi Member", href: `/community?membership=${membership}` }, { label: "Tanya Sensei" }]} />
        <header className="supporting-header">
          <p className="dash-kicker">TANYA SENSEI</p>
          <h1>Kirim pertanyaan yang terhubung ke materi, Chapter, replay, atau soal.</h1>
          <p>Pertanyaan dikirim ke antrean Sensei dan tim akademik sesuai konteks belajar.</p>
          <Link href={`/community?membership=${membership}`} className="button button-secondary">Buka Community</Link>
        </header>
        <form className="form-stack">
          <label><span>Konteks</span><select><option>Chapter 4  Video Lesson</option></select></label>
          <label><span>Jenis</span><select><option>Pertanyaan Materi</option></select></label>
          <label><span>Judul Pertanyaan</span><input placeholder="Ringkas pertanyaanmu" /></label>
          <label><span>Ringkasan</span><textarea placeholder="Tulis ringkasan" /></label>
          <div className="button-group">
            <button type="submit" className="button button-primary">Kirim Pertanyaan</button>
            <button type="button" className="button button-secondary">Simpan Draft</button>
            <button type="button" className="button button-secondary">Pilih Gambar</button>
          </div>
        </form>
      </main>
    </div>
  );
}

