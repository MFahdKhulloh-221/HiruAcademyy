"use client";

import Link from "next/link";
import { StudentBreadcrumb } from "@/components/student-breadcrumb";
import { StudentNavigation } from "@/components/student-navigation";

export function StudentCertificateCenter() {
  return <section className="certificate-detail-page"><header className="supporting-header"><p className="dash-kicker">DIGITAL CERTIFICATE</p><h1>Sertifikat</h1><p>Sertifikat resmi digital kelulusan program HIRU Academy.</p></header><section className="library-empty"><h2>Sertifikat belum dapat diterbitkan</h2><p>OPEN: aturan penerbitan sertifikat. Belum ada sertifikat resmi tersedia.</p><Link className="button button-secondary" href="/dashboard">Kembali Dashboard</Link></section></section>;
}

export function CertificateDetailScreen() {
  return <div className="supporting-shell student-shell"><StudentNavigation membership="free" /><main className="supporting-main"><StudentBreadcrumb items={[{ label: "Sertifikat", href: "/certificate" }, { label: "N5" }]} /><StudentCertificateCenter /></main></div>;
}
