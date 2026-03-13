/**
 * useEconomyDashboard
 * 
 * Composable hook that sits on top of useEconomyOverviewData and provides
 * all computed/derived data needed by the Economy Overview dashboard.
 * 
 * All heavy computation is memoized. The hook returns:
 * - rawProjects: original data from useEconomyOverviewData
 * - projectInsights: enriched per-project views
 * - dashboardSummary: aggregated KPIs
 * - invoicingQueue: projects needing invoicing action
 * - completedProjects: post-event projects
 * - riskProjects: projects requiring attention
 * - upcomingProjects: future events
 * - ongoingProjects: active projects
 * - readyForInvoicingProjects: explicitly ready to invoice
 * - forecasts: 30/60/90 day forecast buckets
 * - byStatus: projects grouped by economy status
 */

import { useMemo } from 'react';
import { useEconomyOverviewData, type ProjectWithEconomy } from '@/hooks/useEconomyOverviewData';
import type {
  EconomyProjectStatus,
  EconomyProjectInsight,
  EconomyDashboardSummary,
  EconomyForecastBucket,
  EconomyRiskItem,
} from '@/types/economyOverview';
import {
  toProjectInsight,
  getDashboardSummary,
  getInvoicingQueue,
  getCompletedProjectsInsights,
  getRiskProjects,
  getUpcomingProjects,
  getOngoingProjects,
  getReadyForInvoicingProjects,
  getAllForecasts,
  getForecastDrivers,
  getLeadershipMetrics,
  type ForecastDrivers,
  type LeadershipMetrics,
} from '@/lib/economy/economyOverviewSelectors';

export interface UseEconomyDashboardResult {
  // Loading state
  isLoading: boolean;
  error: Error | null;

  // Raw data
  rawProjects: ProjectWithEconomy[] | undefined;

  // Enriched data
  projectInsights: EconomyProjectInsight[];
  dashboardSummary: EconomyDashboardSummary;

  // Filtered lists
  invoicingQueue: {
    readyForInvoicing: EconomyProjectInsight[];
    partiallyInvoiced: EconomyProjectInsight[];
    overdue: EconomyProjectInsight[];
  };
  completedProjects: EconomyProjectInsight[];
  riskProjects: EconomyRiskItem[];
  upcomingProjects: EconomyProjectInsight[];
  ongoingProjects: EconomyProjectInsight[];
  readyForInvoicingProjects: EconomyProjectInsight[];

  forecasts: EconomyForecastBucket[];
  forecastDrivers: ForecastDrivers;
  leadershipMetrics: LeadershipMetrics;

  // Grouped by status
  byStatus: Record<EconomyProjectStatus, EconomyProjectInsight[]>;

  // Legacy compat (used by existing UI components)
  /** @deprecated Use projectInsights instead */
  enriched: EconomyProjectInsight[];
  /** @deprecated Use dashboardSummary instead */
  kpis: {
    invoicedThisMonth: number;
    readyToInvoice: number;
    forecast30: number;
    forecast90: number;
    totalCostsThisMonth: number;
    projectedMarginPercent: number;
    completedNotFullyInvoiced: number;
    riskProjectCount: number;
  };
  /** @deprecated Use riskProjects instead */
  risks: EconomyRiskItem[];
}

const EMPTY_SUMMARY: EconomyDashboardSummary = {
  totalProjects: 0, ongoingCount: 0, upcomingCount: 0, completedCount: 0,
  readyForInvoicingCount: 0, partiallyInvoicedCount: 0, fullyInvoicedCount: 0,
  economyClosedCount: 0, riskCount: 0, missingDataCount: 0,
  invoicedThisMonth: 0, readyToInvoiceAmount: 0, totalCostsThisMonth: 0,
  projectedRevenue30: 0, projectedRevenue60: 0, projectedRevenue90: 0,
  projectedCost30: 0, projectedCost60: 0, projectedCost90: 0,
  projectedMargin30: 0, projectedMargin60: 0, projectedMargin90: 0,
  totalExpectedRevenue: 0, totalActualCost: 0, projectedMarginPercent: 0,
  completedNotFullyInvoicedCount: 0, riskProjectCount: 0,
};

export function useEconomyDashboard(
  externalProjects?: ProjectWithEconomy[],
): UseEconomyDashboardResult {
  // If external projects are provided (legacy), use them; otherwise fetch our own
  const query = useEconomyOverviewData();
  const rawProjects = externalProjects ?? query.data;
  const isLoading = externalProjects ? false : query.isLoading;
  const error = externalProjects ? null : (query.error as Error | null);

  // 1. Enrich all projects
  const projectInsights = useMemo(
    () => (rawProjects ?? []).map(toProjectInsight),
    [rawProjects],
  );

  // 2. Dashboard summary (all KPIs)
  const dashboardSummary = useMemo(
    () => projectInsights.length > 0 ? getDashboardSummary(projectInsights) : EMPTY_SUMMARY,
    [projectInsights],
  );

  // 3. Forecasts
  const forecasts = useMemo(
    () => getAllForecasts(projectInsights),
    [projectInsights],
  );

  // 4. Invoicing queue
  const invoicingQueue = useMemo(
    () => getInvoicingQueue(projectInsights),
    [projectInsights],
  );

  // 5. Completed projects
  const completedProjects = useMemo(
    () => getCompletedProjectsInsights(projectInsights),
    [projectInsights],
  );

  // 6. Risk projects
  const riskProjects = useMemo(
    () => getRiskProjects(projectInsights),
    [projectInsights],
  );

  // 7. Upcoming projects
  const upcomingProjects = useMemo(
    () => getUpcomingProjects(projectInsights),
    [projectInsights],
  );

  // 8. Ongoing projects
  const ongoingProjects = useMemo(
    () => getOngoingProjects(projectInsights),
    [projectInsights],
  );

  // 9. Ready for invoicing
  const readyForInvoicingProjects = useMemo(
    () => getReadyForInvoicingProjects(projectInsights),
    [projectInsights],
  );

  // 10. Group by status
  const byStatus = useMemo(() => {
    const map: Record<EconomyProjectStatus, EconomyProjectInsight[]> = {
      'upcoming': [],
      'ongoing': [],
      'event-completed': [],
      'ready-for-invoicing': [],
      'partially-invoiced': [],
      'fully-invoiced': [],
      'economy-closed': [],
      'risk': [],
      'missing-data': [],
    };
    projectInsights.forEach(p => map[p.economyStatus].push(p));
    return map;
  }, [projectInsights]);

  // Legacy compat: map new summary to old KPI shape
  const kpis = useMemo(() => ({
    invoicedThisMonth: dashboardSummary.invoicedThisMonth,
    readyToInvoice: dashboardSummary.readyToInvoiceAmount,
    forecast30: dashboardSummary.projectedRevenue30,
    forecast90: dashboardSummary.projectedRevenue90,
    totalCostsThisMonth: dashboardSummary.totalCostsThisMonth,
    projectedMarginPercent: dashboardSummary.projectedMarginPercent,
    completedNotFullyInvoiced: dashboardSummary.completedNotFullyInvoicedCount,
    riskProjectCount: dashboardSummary.riskProjectCount,
  }), [dashboardSummary]);

  return {
    isLoading,
    error,
    rawProjects,
    projectInsights,
    dashboardSummary,
    invoicingQueue,
    completedProjects,
    riskProjects,
    upcomingProjects,
    ongoingProjects,
    readyForInvoicingProjects,
    forecasts,
    byStatus,

    // Legacy compat
    enriched: projectInsights,
    kpis,
    risks: riskProjects,
  };
}

// Re-export types for convenience
export type {
  EconomyProjectStatus,
  EconomyProjectInsight,
  EconomyDashboardSummary,
  EconomyForecastBucket,
  EconomyRiskItem,
} from '@/types/economyOverview';
