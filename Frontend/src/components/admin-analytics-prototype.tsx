import { AdminPageHeader, AdminSection, AdminShell, AdminStatusBadge } from "@/components/admin-primitives";

export function AdminAnalyticsPrototype() {
  return <AdminShell current="/admin/analitik"><main className="admin-public-prototype">
    <AdminPageHeader title="Analitik" description="Pantau performa melalui layanan analitik resmi." />
    <AdminSection title="Google Analytics" description="Data analitik akan tampil setelah integrasi dikonfigurasi.">
      <AdminStatusBadge status="Belum Terhubung" />
      <div className="admin-page-actions"><a className="button" href="https://analytics.google.com/" target="_blank" rel="noopener noreferrer">Buka Google Analytics</a><a className="button" href="https://support.google.com/analytics/" target="_blank" rel="noopener noreferrer">Selengkapnya</a></div>
    </AdminSection>
    <AdminSection title="Meta Ads" description="Data kampanye akan tersedia setelah integrasi resmi.">
      <AdminStatusBadge status="Belum Terhubung" />
      <div className="admin-page-actions"><a className="button" href="https://adsmanager.facebook.com/" target="_blank" rel="noopener noreferrer">Buka Meta Ads Manager</a><a className="button" href="https://www.facebook.com/business/help" target="_blank" rel="noopener noreferrer">Selengkapnya</a></div>
    </AdminSection>
  </main></AdminShell>;
}
