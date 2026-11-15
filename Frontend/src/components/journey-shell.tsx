import Link from "next/link";
import type { ReactNode } from "react";
import { StudentTopbar } from "@/components/student-topbar";
import { StudentBreadcrumb, type StudentBreadcrumbItem } from "@/components/student-breadcrumb";
import { StudentNavigation } from "@/components/student-navigation";
import type { Membership } from "@/lib/dashboard-mock";

export function JourneyShell({ membership, breadcrumbs, children }: { membership: Membership; breadcrumbs?: StudentBreadcrumbItem[]; children: ReactNode }) {
  const query = `?membership=${membership}`;
  return (
    <div className="journey-shell student-shell">
      <StudentNavigation membership={membership} />
      <div className="journey-main"><StudentTopbar membership={membership}><Link href={`/dashboard${query}`}>← Dashboard</Link></StudentTopbar><main className="journey-content">{breadcrumbs && <StudentBreadcrumb items={breadcrumbs} />}{children}</main></div>
    </div>
  );
}
