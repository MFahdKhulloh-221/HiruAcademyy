import { type ReactNode } from "react";
import { AdminOperationalProvider } from "@/components/admin-operational-state";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminOperationalProvider>{children}</AdminOperationalProvider>;
}
