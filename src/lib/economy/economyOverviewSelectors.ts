/**
 * Economy Overview Selectors
 * 
 * Pure functions that transform raw ProjectWithEconomy[] data into
 * normalized insights, dashboard summaries, and filtered lists.
 * 
 * These are the "business logic" layer between the data hook
 * (useEconomyOverviewData) and the UI components.
 */

import { parseISO, isBefore, addDays, startOfDay, startOfMonth, endOfMonth } from 'date-fns';
import type { ProjectWithEconomy } from '@/hooks/useEconomyOverviewData';
import type { EconomySummary } from '@/types/projectEconomy';
import type {
  EconomyProjectStatus,
  EconomyProjectInsight,
  EconomyDashboardSummary,
  EconomyForecastBucket,
  EconomyRiskItem,
  MissingDataFlag,
} from '@/types/economyOverview';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Safe date parse — returns null if invalid */
function safeParse(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  try {
    const d = parseISO(dateStr);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/**
 * Best guess at expected revenue for a project.
 * Uses product revenue (what the customer pays) from the booking system.
 */
function getExpectedRevenue(s: EconomySummary): number {
  return s.productRevenue;
}

// ─── Status Computation ─────────────────────────────────────────────────────

/**
 * Determines the derived economy status for a project.
 * Evaluated in priority order — first matching condition wins.
 * 
 * Priority:
 * 1. economy-closed (completed + all supplier invoices final-linked)
 * 2. missing-data (≥3 missing critical data points)
 * 3. risk (over budget >10% or negative margin with data)
 * 4. fully-invoiced (invoiced ≥ 95% of expected)
 * 5. partially-invoiced (some invoiced, < 95%)
 * 6. ready-for-invoicing (project status = completed)
 * 7. event-completed (event date has passed)
 * 8. upcoming (event date in the future)
 * 9. ongoing (fallback)
 */
export function getEconomyStatus(p: ProjectWithEconomy): EconomyProjectStatus {
  const s = p.summary;
  const today = startOfDay(new Date());

  // 1. Economy closed
  if (p.economyClosed && p.status === 'completed') return 'economy-closed';

  // 2. Missing data (severely incomplete)
  const missing = getEconomyMissingDataFlags(p);
  if (missing.length >= 3) return 'missing-data';

  // 3. Risk: significantly over budget
  if (s.totalBudget > 0 && s.totalDeviationPercent < -10) return 'risk';

  // 4. Fully invoiced (≥95% of expected revenue)
  const expectedRevenue = getExpectedRevenue(s);
  if (expectedRevenue > 0 && s.invoicesTotal >= expectedRevenue * 0.95) return 'fully-invoiced';

  // 5. Partially invoiced
  if (s.invoicesTotal > 0 && expectedRevenue > 0 && s.invoicesTotal < expectedRevenue * 0.95) {
    return 'partially-invoiced';
  }

  // 6. Ready for invoicing (project explicitly completed)
  if (p.status === 'completed' || p.economyClosed) return 'ready-for-invoicing';

  // 7–8. Date-based statuses
  const eventDate = safeParse(p.eventdate);
  if (eventDate) {
    if (isBefore(eventDate, today)) return 'event-completed';
    return 'upcoming';
  }

  // 9. Fallback
  return 'ongoing';
}

// ─── Missing Data Flags ─────────────────────────────────────────────────────

/**
 * Returns granular flags for what economic data a project is missing.
 * More specific than the old version — uses standardized flag strings.
 */
export function getEconomyMissingDataFlags(p: ProjectWithEconomy): MissingDataFlag[] {
  const flags: MissingDataFlag[] = [];
  const s = p.summary;

  if (!p.booking_id) flags.push('missing-booking');
  if (!p.eventdate) flags.push('missing-eventdate');
  if (s.totalBudget === 0 && s.budgetedHours === 0) flags.push('missing-budget');
  if (s.productCostBudget === 0 && s.invoicesTotal === 0) flags.push('missing-quote');
  if (s.invoicesTotal === 0) flags.push('missing-invoice');
  if (p.timeReports.length === 0 && s.actualHours === 0) flags.push('missing-time-reports');
  if (s.supplierInvoicesTotal === 0 && s.purchasesTotal === 0) flags.push('missing-supplier-invoices');

  return flags;
}

// ─── Project Insight (Enrichment) ───────────────────────────────────────────

/**
 * Enriches a raw project with all computed economy fields.
 * This is the core transformation that all dashboard views consume.
 */
export function toProjectInsight(p: ProjectWithEconomy): EconomyProjectInsight {
  const s = p.summary;
  const economyStatus = getEconomyStatus(p);
  const missingDataFlags = getEconomyMissingDataFlags(p);

  // Revenue
  const quotedAmount = getExpectedRevenue(s);
  const invoicedAmount = s.invoicesTotal;
  const remainingToInvoice = Math.max(0, quotedAmount - invoicedAmount);

  // Costs
  const actualCost = s.staffActual + s.purchasesTotal + s.supplierInvoicesTotal;
  // Forecast cost: if project isn't done and has a budget, use budget as ceiling estimate;
  // otherwise use actual as best available data
  const forecastCost = (
    !['economy-closed', 'fully-invoiced'].includes(economyStatus) && s.totalBudget > 0
  ) ? Math.max(actualCost, s.totalBudget) : actualCost;

  // Revenue forecast: use quoted amount if we have economic data
  const forecastRevenue = quotedAmount;

  // Margin
  const forecastMargin = forecastRevenue - forecastCost;
  const forecastMarginPercent = forecastRevenue > 0
    ? (forecastMargin / forecastRevenue) * 100
    : 0;

  // Boolean flags
  const isReadyForInvoicing = ['ready-for-invoicing', 'event-completed'].includes(economyStatus);
  const isPartiallyInvoiced = economyStatus === 'partially-invoiced';
  const isFullyInvoiced = economyStatus === 'fully-invoiced';
  const isEconomyClosed = economyStatus === 'economy-closed';
  const isRiskProject = economyStatus === 'risk' || forecastMarginPercent < 0;

  return {
    id: p.id,
    name: p.name,
    projectSize: p.projectSize,
    status: p.status,
    booking_id: p.booking_id,
    eventdate: p.eventdate,
    bookingCreatedAt: p.bookingCreatedAt,
    navigateTo: p.navigateTo,

    economyStatus,
    summary: s,
    timeReports: p.timeReports,
    economyClosed: p.economyClosed,

    quotedAmount,
    invoicedAmount,
    remainingToInvoice,

    actualCost,
    forecastCost,
    forecastRevenue,
    forecastMargin,
    forecastMarginPercent,

    isReadyForInvoicing,
    isPartiallyInvoiced,
    isFullyInvoiced,
    isEconomyClosed,
    isRiskProject,

    missingDataFlags,
  };
}

// ─── Forecast ───────────────────────────────────────────────────────────────

/**
 * Computes revenue/cost forecast for a single project at a given horizon.
 * 
 * Logic:
 * - "Safe" = already invoiced, or completed/ready projects
 * - "Likely" = safe + active projects with strong data (quote + ≤1 missing flag)  
 * - "Pipeline" = likely + upcoming/weak-data projects with some economic value
 */
export function getEconomyForecast(
  projects: EconomyProjectInsight[],
  days: number,
  label: string,
): EconomyForecastBucket {
  const cutoff = addDays(new Date(), days);

  let safeRevenue = 0;
  let likelyRevenue = 0;
  let pipelineRevenue = 0;
  let actualInvoiced = 0;
  let actualCost = 0;
  let forecastCost = 0;

  projects.forEach(p => {
    // Check if project falls within this time horizon
    const eventDate = safeParse(p.eventdate);
    const inRange = !eventDate || eventDate <= cutoff;
    if (!inRange) return;

    // Always accumulate actuals
    actualInvoiced += p.invoicedAmount;
    actualCost += p.actualCost;
    forecastCost += p.forecastCost;

    // Revenue tiering
    const remaining = p.remainingToInvoice;

    if (p.isFullyInvoiced || p.isEconomyClosed) {
      // Already done — safe
      safeRevenue += p.invoicedAmount;
    } else if (p.isReadyForInvoicing || p.isPartiallyInvoiced) {
      // Ready to invoice: invoiced part is safe, remaining is likely
      safeRevenue += p.invoicedAmount;
      likelyRevenue += remaining;
    } else if (['event-completed', 'ongoing'].includes(p.economyStatus)) {
      // Active/completed: depends on data quality
      if (p.quotedAmount > 0 && p.missingDataFlags.length <= 1) {
        likelyRevenue += p.quotedAmount - p.invoicedAmount;
      } else if (p.quotedAmount > 0) {
        pipelineRevenue += p.quotedAmount - p.invoicedAmount;
      }
    } else if (p.economyStatus === 'upcoming') {
      // Upcoming: always pipeline
      pipelineRevenue += p.quotedAmount;
    }
  });

  // Cumulative totals for the "likely" line
  const totalLikely = safeRevenue + likelyRevenue;
  const forecastMargin = totalLikely - forecastCost;
  const forecastMarginPercent = totalLikely > 0 ? (forecastMargin / totalLikely) * 100 : 0;

  return {
    label,
    days,
    safeRevenue,
    likelyRevenue,
    pipelineRevenue,
    actualInvoiced,
    actualCost,
    forecastCost,
    forecastMargin,
    forecastMarginPercent,
  };
}

// ─── Dashboard Summary ──────────────────────────────────────────────────────

/**
 * Aggregates all project insights into a single KPI summary object.
 * This is the data source for the top KPI card row.
 */
export function getDashboardSummary(projects: EconomyProjectInsight[]): EconomyDashboardSummary {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  // Status counts
  let ongoingCount = 0;
  let upcomingCount = 0;
  let completedCount = 0;
  let readyForInvoicingCount = 0;
  let partiallyInvoicedCount = 0;
  let fullyInvoicedCount = 0;
  let economyClosedCount = 0;
  let riskCount = 0;
  let missingDataCount = 0;

  // Financial accumulators
  let invoicedThisMonth = 0;
  let readyToInvoiceAmount = 0;
  let totalCostsThisMonth = 0;
  let totalExpectedRevenue = 0;
  let totalActualCost = 0;
  let completedNotFullyInvoicedCount = 0;

  projects.forEach(p => {
    // Count by status
    switch (p.economyStatus) {
      case 'ongoing': ongoingCount++; break;
      case 'upcoming': upcomingCount++; break;
      case 'event-completed': completedCount++; break;
      case 'ready-for-invoicing': readyForInvoicingCount++; completedCount++; break;
      case 'partially-invoiced': partiallyInvoicedCount++; completedCount++; break;
      case 'fully-invoiced': fullyInvoicedCount++; completedCount++; break;
      case 'economy-closed': economyClosedCount++; completedCount++; break;
      case 'risk': riskCount++; break;
      case 'missing-data': missingDataCount++; break;
    }

    // Risk count (broader: includes negative margin projects too)
    if (p.isRiskProject) riskCount = Math.max(riskCount, riskCount); // avoid double-counting, handled below

    // This month: approximate by eventdate
    const eventDate = safeParse(p.eventdate);
    if (eventDate && eventDate >= monthStart && eventDate <= monthEnd) {
      invoicedThisMonth += p.invoicedAmount;
      totalCostsThisMonth += p.actualCost;
    }

    // Ready to invoice
    if (p.isReadyForInvoicing) {
      readyToInvoiceAmount += p.remainingToInvoice;
    }

    // Completed but not fully invoiced
    if (
      ['ready-for-invoicing', 'event-completed', 'partially-invoiced'].includes(p.economyStatus) &&
      p.remainingToInvoice > 0
    ) {
      completedNotFullyInvoicedCount++;
    }

    totalExpectedRevenue += p.quotedAmount;
    totalActualCost += p.actualCost;
  });

  // Risk: count unique risk projects
  const riskProjectCount = projects.filter(p => p.isRiskProject).length;

  // Compute forecasts for 30/60/90
  const f30 = getEconomyForecast(projects, 30, '30 dagar');
  const f60 = getEconomyForecast(projects, 60, '60 dagar');
  const f90 = getEconomyForecast(projects, 90, '90 dagar');

  const projectedMarginPercent = totalExpectedRevenue > 0
    ? ((totalExpectedRevenue - totalActualCost) / totalExpectedRevenue) * 100
    : 0;

  return {
    totalProjects: projects.length,
    ongoingCount,
    upcomingCount,
    completedCount,
    readyForInvoicingCount,
    partiallyInvoicedCount,
    fullyInvoicedCount,
    economyClosedCount,
    riskCount: riskProjectCount,
    missingDataCount,

    invoicedThisMonth,
    readyToInvoiceAmount,
    totalCostsThisMonth,

    projectedRevenue30: f30.safeRevenue + f30.likelyRevenue,
    projectedRevenue60: f60.safeRevenue + f60.likelyRevenue,
    projectedRevenue90: f90.safeRevenue + f90.likelyRevenue,

    projectedCost30: f30.forecastCost,
    projectedCost60: f60.forecastCost,
    projectedCost90: f90.forecastCost,

    projectedMargin30: f30.forecastMargin,
    projectedMargin60: f60.forecastMargin,
    projectedMargin90: f90.forecastMargin,

    totalExpectedRevenue,
    totalActualCost,
    projectedMarginPercent,

    completedNotFullyInvoicedCount,
    riskProjectCount,
  };
}

// ─── Invoicing Queue ────────────────────────────────────────────────────────

/**
 * Returns projects that need invoicing attention, split into categories.
 */
export function getInvoicingQueue(projects: EconomyProjectInsight[]) {
  // Ready for invoicing: event completed or explicitly ready, with remaining amount
  const readyForInvoicing = projects
    .filter(p => p.isReadyForInvoicing && p.remainingToInvoice > 0)
    .sort((a, b) => b.remainingToInvoice - a.remainingToInvoice);

  // Partially invoiced: some invoiced but not fully
  const partiallyInvoiced = projects
    .filter(p => p.isPartiallyInvoiced)
    .sort((a, b) => b.remainingToInvoice - a.remainingToInvoice);

  // Overdue: completed/event-completed with remaining, sorted oldest first
  const overdue = projects
    .filter(p =>
      ['ready-for-invoicing', 'event-completed', 'partially-invoiced'].includes(p.economyStatus) &&
      p.remainingToInvoice > 0
    )
    .sort((a, b) => {
      const da = safeParse(a.eventdate)?.getTime() ?? 0;
      const db = safeParse(b.eventdate)?.getTime() ?? 0;
      return da - db; // oldest first = most overdue
    });

  return { readyForInvoicing, partiallyInvoiced, overdue };
}

// ─── Completed Projects ─────────────────────────────────────────────────────

/**
 * Returns projects considered "completed" (various post-event statuses),
 * sorted by eventdate descending (most recent first).
 */
export function getCompletedProjectsInsights(projects: EconomyProjectInsight[]): EconomyProjectInsight[] {
  const completedStatuses: EconomyProjectStatus[] = [
    'event-completed',
    'ready-for-invoicing',
    'partially-invoiced',
    'fully-invoiced',
    'economy-closed',
  ];

  return projects
    .filter(p => completedStatuses.includes(p.economyStatus) || p.status === 'completed')
    .sort((a, b) => {
      const da = safeParse(a.eventdate)?.getTime() ?? 0;
      const db = safeParse(b.eventdate)?.getTime() ?? 0;
      return db - da; // newest first
    });
}

// ─── Risk Projects ──────────────────────────────────────────────────────────

/**
 * Returns projects that require attention, with human-readable reasons.
 * Sorted by severity (number of reasons) descending.
 */
export function getRiskProjects(projects: EconomyProjectInsight[]): EconomyRiskItem[] {
  const risks: EconomyRiskItem[] = [];

  projects.forEach(p => {
    const reasons: string[] = [];
    const s = p.summary;

    // Over budget
    if (s.totalBudget > 0 && s.totalDeviationPercent < -10) {
      reasons.push(`Över budget (${Math.abs(s.totalDeviationPercent).toFixed(0)}%)`);
    }

    // Negative projected margin
    if (p.forecastMarginPercent < 0 && p.quotedAmount > 0) {
      reasons.push('Negativ marginalprognos');
    }

    // Completed but not invoiced at all
    if (
      ['event-completed', 'ready-for-invoicing'].includes(p.economyStatus) &&
      p.invoicedAmount === 0
    ) {
      reasons.push('Avslutat men ej fakturerat');
    }

    // Note: Missing data (supplier invoices, time reports, budget) is NOT treated
    // as a risk — it's normal for many projects to not have all data filled in.

    if (reasons.length > 0) {
      risks.push({ project: p, reasons });
    }
  });

  return risks.sort((a, b) => b.reasons.length - a.reasons.length);
}

// ─── Convenience: All Forecasts ─────────────────────────────────────────────

/**
 * Computes forecast buckets for 30, 60, and 90 days.
 */
export function getAllForecasts(projects: EconomyProjectInsight[]): EconomyForecastBucket[] {
  return [
    getEconomyForecast(projects, 30, '30 dagar'),
    getEconomyForecast(projects, 60, '60 dagar'),
    getEconomyForecast(projects, 90, '90 dagar'),
  ];
}

// ─── Filtered Lists ─────────────────────────────────────────────────────────

/** Projects with event date in the future */
export function getUpcomingProjects(projects: EconomyProjectInsight[]): EconomyProjectInsight[] {
  return projects
    .filter(p => p.economyStatus === 'upcoming')
    .sort((a, b) => {
      const da = safeParse(a.eventdate)?.getTime() ?? Infinity;
      const db = safeParse(b.eventdate)?.getTime() ?? Infinity;
      return da - db; // nearest first
    });
}

/** Active/ongoing projects */
export function getOngoingProjects(projects: EconomyProjectInsight[]): EconomyProjectInsight[] {
  return projects.filter(p => p.economyStatus === 'ongoing');
}

/** Projects explicitly ready for invoicing (not just event-completed) */
export function getReadyForInvoicingProjects(projects: EconomyProjectInsight[]): EconomyProjectInsight[] {
  return projects
    .filter(p => p.isReadyForInvoicing)
    .sort((a, b) => b.remainingToInvoice - a.remainingToInvoice);
}

// ─── Forecast Drivers ───────────────────────────────────────────────────────

export interface ForecastDrivers {
  /** Top projects by forecast revenue (biggest impact on income) */
  topRevenue: EconomyProjectInsight[];
  /** Top projects with worst margin (biggest risk to profitability) */
  topMarginRisk: EconomyProjectInsight[];
  /** Top projects with most remaining to invoice (biggest invoicing actions) */
  topRemainingToInvoice: EconomyProjectInsight[];
}

/**
 * Returns the top 5 projects driving the forecast in three dimensions:
 * revenue impact, margin risk, and invoicing backlog.
 */
export function getForecastDrivers(projects: EconomyProjectInsight[], limit = 5): ForecastDrivers {
  // Only include projects with economic data
  const withData = projects.filter(p => p.quotedAmount > 0 || p.actualCost > 0);

  const topRevenue = [...withData]
    .sort((a, b) => b.forecastRevenue - a.forecastRevenue)
    .slice(0, limit);

  const topMarginRisk = [...withData]
    .filter(p => p.forecastMarginPercent < 30 && !p.isEconomyClosed)
    .sort((a, b) => a.forecastMarginPercent - b.forecastMarginPercent)
    .slice(0, limit);

  const topRemainingToInvoice = [...withData]
    .filter(p => p.remainingToInvoice > 0)
    .sort((a, b) => b.remainingToInvoice - a.remainingToInvoice)
    .slice(0, limit);

  return { topRevenue, topMarginRisk, topRemainingToInvoice };
}

// ─── Leadership Summary ─────────────────────────────────────────────────────

export interface LeadershipMetrics {
  /** Expected revenue next 30 days (safe + likely) */
  revenue30: number;
  /** Expected revenue next 90 days (safe + likely) */
  revenue90: number;
  /** Expected margin next 90 days in % */
  margin90Percent: number;
  /** Ratio of safe revenue to total forecast (0-1) */
  safeRatio90: number;
  /** Number of projects contributing to forecast */
  forecastProjectCount: number;
  /** Total pipeline (uncertain) revenue */
  pipelineTotal: number;
}

/**
 * Computes leadership-level summary metrics from forecasts.
 */
export function getLeadershipMetrics(
  forecasts: EconomyForecastBucket[],
  projects: EconomyProjectInsight[],
): LeadershipMetrics {
  const f30 = forecasts[0];
  const f90 = forecasts[2];

  const revenue30 = f30 ? f30.safeRevenue + f30.likelyRevenue : 0;
  const revenue90 = f90 ? f90.safeRevenue + f90.likelyRevenue : 0;
  const margin90Percent = f90?.forecastMarginPercent ?? 0;

  const totalForecast90 = f90 ? f90.safeRevenue + f90.likelyRevenue + f90.pipelineRevenue : 0;
  const safeRatio90 = totalForecast90 > 0 ? (f90?.safeRevenue ?? 0) / totalForecast90 : 0;

  const forecastProjectCount = projects.filter(p =>
    p.quotedAmount > 0 && !p.isEconomyClosed
  ).length;

  const pipelineTotal = f90?.pipelineRevenue ?? 0;

  return { revenue30, revenue90, margin90Percent, safeRatio90, forecastProjectCount, pipelineTotal };
}
