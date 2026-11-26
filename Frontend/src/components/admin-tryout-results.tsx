"use client";

import { downloadReport, loadReport, loadReportAttempt, loadReportParticipants } from "@/lib/admin-tryout-results-api";
import { TryoutResultsDashboard } from "./tryout-results-dashboard";

const tryoutReports = { loadReport, loadReportParticipants, loadReportAttempt, downloadReport };
export type AdminResultsApi = Pick<typeof tryoutReports, "loadReport" | "loadReportParticipants" | "loadReportAttempt"> & { downloadReport?: typeof downloadReport };

type Props = { id: string; title: string; level: string; packages: { id: string; title: string; context: string }[]; onPackageChange: (id: string) => void; onClose: () => void; reportsApi?: AdminResultsApi; assessmentLabel?: string; showPassing?: boolean };

export function AdminTryoutResults(props: Props) {
  return <TryoutResultsDashboard {...props} showPassing={props.assessmentLabel === "Latihan Harian" ? false : props.showPassing} />;
}
