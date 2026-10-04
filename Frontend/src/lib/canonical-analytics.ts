import { commercialData } from "@/lib/commercial-api";
import { type AnalyticsData, type AnalyticsPeriod, type Distribution } from "@/lib/admin-analytics";

type Row = { id: number; status?: string; published?: boolean; account_status?: string; program_id?: number; module_type?: string; created_at?: string; scheduled_at?: string; total_price?: number; amount?: number };
export async function loadCanonicalAnalytics(period: AnalyticsPeriod) {
  const resources = ["users", "invoices", "commissions", "payouts", "programs", "chapters", "try-outs", "mini-checkpoint-questions", "flashcards", "modules", "replay-videos", "class-schedules", "affiliates", "blog-articles", "testimonials"];
  const responses = await Promise.all(resources.map(resource => commercialData<Row[]>(`/api/admin/${resource}`)));
  const rows = Object.fromEntries(resources.map((resource, index) => [resource, responses[index]]));
  const currentMetric = { value: 0, scope: "current" as const, dateFiltered: false as const };
  const periodMetric = { value: 0, scope: period, dateFiltered: true as const };
  const data: AnalyticsData = { period, generatedAt: new Date().toISOString(), tabs: {
    summary: { totalUsers: { ...currentMetric }, activeMemberships: { ...currentMetric }, invoicesAwaitingAction: { ...currentMetric }, verifiedAndActiveInvoices: { ...currentMetric }, placementLeads: { ...periodMetric }, publishedContent: { ...currentMetric }, upcomingSessions: { ...currentMetric }, externalAnalytics: { configured: false, status: "disconnected", source: "settings", label: "Belum terhubung" } },
    acquisition: { placementRecommendations: [], placementTargets: [], leadStatuses: [], referralAttributedInvoices: [], affiliateSnapshot: { scope: "current", dateFiltered: false, affiliates: 0, activeAffiliates: 0, clicks: 0, registrations: 0, purchases: 0 } },
    learning: { publishedPrograms: { ...currentMetric }, publishedChapters: { ...currentMetric }, publishedAssessments: { ...currentMetric }, publishedDecks: { ...currentMetric }, publishedMaterials: { ...currentMetric }, publishedReplays: { ...currentMetric }, upcomingSessions: { ...currentMetric }, programsByCode: [], chaptersByProgram: [], assessmentsByType: [], decksByProgram: [], materialsByType: [], replaysByProgram: [] },
    transactions: { invoicesByStatus: [], verifiedAndActiveValue: { ...periodMetric }, commissionsByStatus: [], availableCommission: { ...periodMetric }, paidCommission: { ...periodMetric }, payoutsByStatus: [], payoutValueByStatus: [] },
  } };
  const now = Date.now();
  const start = period === "all" ? 0 : now - (period === "7d" ? 7 : 30) * 86400000;
  const current = (value: number) => ({ value, scope: "current" as const, dateFiltered: false as const });
  const filtered = (items: Row[]) => items.filter(row => row.created_at && Date.parse(row.created_at) >= start && Date.parse(row.created_at) <= now);
  const published = (items: Row[]) => items.filter(row => row.status === "published" || row.published === true);
  const distribution = (items: Row[], key: (row: Row) => string, amount = false): Distribution[] => [...new Set(items.map(key))].map(label => ({ label, count: items.filter(row => key(row) === label).length, ...(amount ? { value: items.filter(row => key(row) === label).reduce((sum, row) => sum + Number(row.amount ?? row.total_price ?? 0), 0) } : {}) }));
  const invoices = filtered(rows.invoices);
  const commissions = filtered(rows.commissions);
  const payouts = filtered(rows.payouts);
  data.tabs.summary.totalUsers = current(rows.users.length);
  const access = await Promise.all(rows.users.map(user => commercialData<{ source_grants: unknown[] }>(`/api/admin/users/${user.id}/effective-access`)));
  data.tabs.summary.activeMemberships = current(access.filter(item => item.source_grants.length > 0).length);
  data.tabs.summary.invoicesAwaitingAction = current(rows.invoices.filter(row => row.status === "paid").length);
  data.tabs.summary.verifiedAndActiveInvoices = current(rows.invoices.filter(row => ["verified", "active"].includes(row.status ?? "")).length);
  const learning = data.tabs.learning;
  learning.publishedPrograms = current(rows.programs.filter(row => row.status !== "inactive").length);
  learning.publishedChapters = current(published(rows.chapters).length);
  learning.publishedAssessments = current(published(rows["try-outs"]).length + published(rows["mini-checkpoint-questions"]).length);
  learning.publishedDecks = current(published(rows.flashcards).length);
  learning.publishedMaterials = current(published(rows.modules).length);
  learning.publishedReplays = current(published(rows["replay-videos"]).length);
  learning.upcomingSessions = current(rows["class-schedules"].filter(row => row.status === "published" && Date.parse(row.scheduled_at ?? "") >= now).length);
  data.tabs.summary.upcomingSessions = learning.upcomingSessions;
  data.tabs.summary.publishedContent = current(learning.publishedChapters.value + learning.publishedAssessments.value + learning.publishedDecks.value + learning.publishedMaterials.value + learning.publishedReplays.value + published(rows["blog-articles"]).length + published(rows.testimonials).length);
  learning.chaptersByProgram = distribution(published(rows.chapters), row => String(row.program_id));
  learning.materialsByType = distribution(published(rows.modules), row => row.module_type ?? "general");
  learning.replaysByProgram = distribution(published(rows["replay-videos"]), row => String(row.program_id ?? "—"));
  const transactions = data.tabs.transactions;
  transactions.invoicesByStatus = distribution(invoices, row => row.status ?? "draft", true);
  transactions.commissionsByStatus = distribution(commissions, row => row.status ?? "pending", true);
  transactions.payoutsByStatus = distribution(payouts, () => "Sudah Dicairkan");
  transactions.payoutValueByStatus = distribution(payouts, () => "Sudah Dicairkan", true);
  transactions.verifiedAndActiveValue.value = invoices.filter(row => ["verified", "active"].includes(row.status ?? "")).reduce((sum, row) => sum + Number(row.total_price ?? 0), 0);
  transactions.availableCommission.value = commissions.filter(row => row.status === "approved").reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  transactions.paidCommission.value = commissions.filter(row => row.status === "paid").reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  data.tabs.acquisition.affiliateSnapshot.affiliates = rows.affiliates.length;
  data.tabs.acquisition.affiliateSnapshot.activeAffiliates = rows.affiliates.filter(row => row.status === "active").length;
  return data;
}
