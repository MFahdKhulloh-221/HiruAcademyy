import type { ReactNode } from "react";
import { AdminEditorNavigation } from "@/components/admin-editor-navigation";
import { AdminNavigation } from "@/components/admin-navigation";
import "@/app/admin/admin.css";

export function AdminShell({ children, current, hideTopbar = false }: { children: ReactNode; current: string; hideTopbar?: boolean }) {
  return (
    <AdminEditorNavigation><div className="admin-shell">
      <AdminNavigation current={current} />
      <div className="admin-main">
        {!hideTopbar && <header className="admin-topbar"><strong>Admin Console</strong><span>Pratinjau frontend</span></header>}
        {children}
      </div>
    </div></AdminEditorNavigation>
  );
}
