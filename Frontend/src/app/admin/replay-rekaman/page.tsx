import { AdminShell } from "@/components/admin-shell";
import { AdminPageHeader } from "@/components/admin-primitives";
import { ReplayTab } from "@/components/curriculum-builder";

export default function ReplayRekamanPage() {
  return <AdminShell current="/admin/replay-rekaman"><main className="admin-page curriculum-admin-page"><AdminPageHeader title="Replay Rekaman" description="Kelola rekaman kelas dan replay berdasarkan program." /><ReplayTab /></main></AdminShell>;
}
