"use client";

import Link from "next/link";
import { StudentBreadcrumb } from "@/components/student-breadcrumb";
import { StudentNavigation } from "@/components/student-navigation";

export function StudentCertificateCenter() {
  return (
    <section className="certificate-page">
      <header className="supporting-header">
        <p className="dash-kicker">CERTIFICATE CENTER</p>
        <h1>Sertifikat digital dari milestone yang tervalidasi</h1>
        <p>Kelulusan, penerbitan, unduh, dan status sertifikat resmi digital HIRU Academy.</p>
      </header>
      <section className="certificate-summary">
        <p className="dash-kicker">DIGITAL CREDENTIALS</p>
        <h2>Sertifikat belum tersedia</h2>
        <p>Sertifikat resmi digital diterbitkan secara bertahap setelah seluruh kriteria kelulusan program dan evaluasi akhir diverifikasi.</p>
        <div className="certificate-flow">
          <span>Selesaikan journey</span>
          <span>Penuhi evaluasi</span>
          <span>Verifikasi kelulusan</span>
          <span>Sertifikat terbit</span>
        </div>
      </section>
      <section className="library-empty" style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: "18px", padding: "32px", textAlign: "center", marginTop: "24px" }}>
        <h2>Belum ada sertifikat yang diterbitkan</h2>
        <p>Lanjutkan perjalanan belajar dan selesaikan seluruh aktivitas serta evaluasi untuk memperoleh sertifikat resmi.</p>
        <div style={{ marginTop: "16px" }}>
          <Link className="button button-primary" href="/journey">Lanjutkan Belajar</Link>
        </div>
      </section>
    </section>
  );
}

export function CertificateDetailScreen() {
  return (
    <div className="supporting-shell student-shell">
      <StudentNavigation membership="free" />
      <main className="supporting-main">
        <StudentBreadcrumb items={[{ label: "Sertifikat", href: "/certificate" }, { label: "N5" }]} />
        <StudentCertificateCenter />
      </main>
    </div>
  );
}
