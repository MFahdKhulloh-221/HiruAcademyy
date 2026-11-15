import type { ReactNode } from "react";
import type { Membership } from "@/lib/dashboard-mock";
import { StudentHeaderActions } from "@/components/student-header-actions";
import styles from "./student-topbar.module.css";

export function StudentTopbar({ membership, children }: { membership: Membership; children?: ReactNode }) {
  return <header className={styles.topbar}>{children}<StudentHeaderActions membership={membership} /></header>;
}
