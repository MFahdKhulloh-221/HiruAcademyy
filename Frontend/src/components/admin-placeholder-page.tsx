import { AdminPageHeader, AdminSection } from "@/components/admin-primitives";
import { AdminShell } from "@/components/admin-shell";

export function AdminPlaceholderPage({ current, title, description }: { current: string; title: string; description?: string }) {

  return (
    <AdminShell current={current}>
      <main className="admin-page">
        <AdminPageHeader title={title} description={description} />
        <AdminSection>
          <p>Builder akan dikonfigurasi pada batch berikutnya.</p>
        </AdminSection>
      </main>
    </AdminShell>
  );
}
