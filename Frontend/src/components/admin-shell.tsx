import type { ReactNode } from "react";
import { AdminNavigation } from "@/components/admin-navigation";
import "@/app/admin/admin.css";

export function AdminShell({ children, current }: { children: ReactNode; current: string }) {
  return (
    <div className="admin-shell">
      <AdminNavigation current={current} />
      <div className="admin-main">
        <header className="admin-topbar"><strong>Admin Console</strong><span>Pratinjau frontend</span></header>
        {children}
      </div>
    </div>
  );
}
