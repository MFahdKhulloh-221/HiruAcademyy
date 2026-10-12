import Link from "next/link";
import type { ReactNode } from "react";
import { StudentBreadcrumb, type StudentBreadcrumbItem } from "@/components/student-breadcrumb";
import { StudentNavigation } from "@/components/student-navigation";
import { StudentHeaderActions } from "@/components/student-header-actions";
import type { Membership } from "@/lib/dashboard-mock";

export function SenseiShell({ membership, breadcrumbs, children }: { membership: Membership; breadcrumbs?: StudentBreadcrumbItem[]; children: ReactNode }) {
  return <div className="sensei-shell student-shell"><StudentNavigation membership={membership} /><div className="sensei-main"><header className="sensei-topbar"><Link href={`/dashboard?membership=${membership}`}>← Dashboard</Link><StudentHeaderActions membership={membership} /></header><main className="sensei-content">{breadcrumbs && <StudentBreadcrumb items={breadcrumbs} />}{children}</main></div></div>;
}
