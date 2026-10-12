"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import { StudentAvatar } from "@/components/student-avatar";
import styles from "./profile-identity.module.css";

export function ProfileIdentity({ note, children }: { note?: string; children?: ReactNode }) {
  const { user } = useAuth();
  return <section className={`profile-identity ${styles.identity}`}>
    <StudentAvatar name={user?.name ?? ""} url={user?.avatar_resolved_url} className={`profile-avatar ${styles.avatar}`} />
    <div className={styles.details}>
      <h2>{user?.name ?? ""}</h2>
      <p>{user?.email ?? ""}</p>
      {note && <p className={styles.note}>{note}</p>}
      {children}
    </div>
  </section>;
}
