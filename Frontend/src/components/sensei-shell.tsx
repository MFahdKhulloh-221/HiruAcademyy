import Link from "next/link";
import type { ReactNode } from "react";
import { StudentBreadcrumb, type StudentBreadcrumbItem } from "@/components/student-breadcrumb";
import { StudentNavigation } from "@/components/student-navigation";
import { StudentTopbar } from "@/components/student-topbar";
import type { Membership } from "@/lib/dashboard-mock";

export function SenseiShell({ membership, breadcrumbs, children }: { membership: Membership; breadcrumbs?: StudentBreadcrumbItem[]; children: ReactNode }) {
  return <div className="sensei-shell student-shell"><StudentNavigation membership={membership} /><div className="sensei-main"><StudentTopbar membership={membership}><Link href={`/dashboard?membership=${membership}`}>← Dashboard</Link></StudentTopbar><main className="sensei-content">{breadcrumbs && <StudentBreadcrumb items={breadcrumbs} />}{children}</main></div></div>;
}
