"use client";

import { Suspense } from "react";
import { StudentCommunityScreen } from "@/components/student-community-screen";
import styles from "./community.module.css";
import { AdminShell } from "@/components/admin-shell";

export default function CommunityPage() {
  return <AdminShell current="/admin/komunitas"><main className={`admin-page ${styles.page}`}>
    <Suspense fallback={<p role="status">Memuat percakapan…</p>}><StudentCommunityScreen membership="sensei" /></Suspense>
  </main></AdminShell>;
}
