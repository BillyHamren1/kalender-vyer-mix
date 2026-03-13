import { useMemo } from 'react';
import { parseISO, isAfter, isBefore, addDays, startOfDay, startOfMonth, endOfMonth } from 'date-fns';
import type { ProjectWithEconomy } from '@/hooks/useEconomyOverviewData';
import type { EconomySummary } from '@/types/projectEconomy';

// ─── Derived Economy Status ─────────────────────────────────────────────────

export type EconomyStatus =
  | 'upcoming'
  | 'ongoing'
  | 'event-completed'
  | 'ready-for-invoicing'
  | 'partially-invoiced'
  | 'fully-invoiced'
  | 'economy-closed'
  | 'risk'
  | 'missing-data';

export interface EnrichedProject extends ProjectWithEconomy {
  economyStatus: EconomyStatus;
  expectedRevenue: number;      // quotesTotal or productCostBudget (best guess at revenue)
  totalInvoiced: number;        // invoicesTotal
  remainingToInvoice: number;   // expected - invoiced
  totalCost: number;            // staffActual + purchasesTotal + supplierInvoicesTotal
  projectedMargin: number;      // expectedRevenue - totalCost
  projectedMarginPercent: number;
  isRisk: boolean;
  missingData: string[];
}

export function computeEconomyStatus(p: ProjectWithEconomy): EconomyStatus {
  const s = p.summary;
  const today = startOfDay(new Date());

  // Economy is closed when all supplier invoices are final-linked
  if (p.economyClosed && p.status === 'completed') return 'economy-closed';

  // Check for missing data
  const missing = getMissingData(p);
  if (missing.length >= 3) return 'missing-data';

  // Risk: negative margin or significantly over budget
  if (s.totalBudget > 0 && s.totalDeviationPercent < -10) return 'risk';

  // Fully invoiced
  const expectedRevenue = getExpectedRevenue(s);
  if (expectedRevenue > 0 && s.invoicesTotal >= expectedRevenue * 0.95) return 'fully-invoiced';

  // Partially invoiced
  if (s.invoicesTotal > 0 && expectedRevenue > 0 && s.invoicesTotal < expectedRevenue * 0.95) return 'partially-invoiced';

  // Completed/ready for invoicing
  if (p.status === 'completed' || p.economyClosed) return 'ready-for-invoicing';

  // Event completed (event date has passed but project not marked completed)
  if (p.eventdate) {
    try {
      const eventDate = parseISO(p.eventdate);
      if (isBefore(eventDate, today)) return 'event-completed';
    } catch {}
  }

  // Upcoming
  if (p.eventdate) {
    try {
      const eventDate = parseISO(p.eventdate);
      if (isAfter(eventDate, today)) return 'upcoming';
    } catch {}
  }

  return 'ongoing';
}

function getExpectedRevenue(s: EconomySummary): number {
  // Best guess at expected revenue: quotes total, or product cost budget as fallback
  return s.quotesTotal > 0 ? s.quotesTotal : s.productCostBudget;
}

function getMissingData(p: ProjectWithEconomy): string[] {
  const missing: string[] = [];
  const s = p.summary;
  if (s.totalBudget === 0 && s.budgetedHours === 0) missing.push('budget');
  if (s.quotesTotal === 0 && s.productCostBudget === 0) missing.push('offert');
  if (p.timeReports.length === 0 && s.actualHours === 0) missing.push('tidrapporter');
  if (s.supplierInvoicesTotal === 0 && s.invoicesTotal === 0 && s.purchasesTotal === 0) missing.push('leverantörsfakturor');
  return missing;
}

export function enrichProject(p: ProjectWithEconomy): EnrichedProject {
  const s = p.summary;
  const economyStatus = computeEconomyStatus(p);
  const expectedRevenue = getExpectedRevenue(s);
  const totalInvoiced = s.invoicesTotal;
  const remainingToInvoice = Math.max(0, expectedRevenue - totalInvoiced);
  const totalCost = s.staffActual + s.purchasesTotal + s.supplierInvoicesTotal;
  const projectedMargin = expectedRevenue - totalCost;
  const projectedMarginPercent = expectedRevenue > 0 ? (projectedMargin / expectedRevenue) * 100 : 0;
  const isRisk = economyStatus === 'risk' || projectedMarginPercent < 0;
  const missingData = getMissingData(p);

  return {
    ...p,
    economyStatus,
    expectedRevenue,
    totalInvoiced,
    remainingToInvoice,
    totalCost,
    projectedMargin,
    projectedMarginPercent,
    isRisk,
    missingData,
  };
}

// ─── Dashboard KPIs ─────────────────────────────────────────────────────────

export interface DashboardKPIs {
  invoicedThisMonth: number;
  readyToInvoice: number;
  forecast30: number;
  forecast90: number;
  totalCostsThisMonth: number;
  projectedMarginPercent: number;
  completedNotFullyInvoiced: number;
  riskProjectCount: number;
}

export function computeDashboardKPIs(projects: EnrichedProject[]): DashboardKPIs {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const day30 = addDays(now, 30);
  const day90 = addDays(now, 90);

  let invoicedThisMonth = 0;
  let readyToInvoice = 0;
  let totalCostsThisMonth = 0;
  let completedNotFullyInvoiced = 0;
  let riskProjectCount = 0;
  let forecast30 = 0;
  let forecast90 = 0;
  let totalExpectedRevenue = 0;
  let totalCosts = 0;

  projects.forEach(p => {
    const s = p.summary;

    // Invoiced this month: approximate from invoicesTotal for completed this month
    // We don't have invoice dates per-invoice from the batch, so use a heuristic:
    // if project was recently completed, count it
    if (p.eventdate) {
      try {
        const ed = parseISO(p.eventdate);
        if (ed >= monthStart && ed <= monthEnd) {
          invoicedThisMonth += s.invoicesTotal;
          totalCostsThisMonth += p.totalCost;
        }
      } catch {}
    }

    // Ready to invoice
    if (['ready-for-invoicing', 'event-completed'].includes(p.economyStatus)) {
      readyToInvoice += p.remainingToInvoice;
    }

    // Completed not fully invoiced
    if (['ready-for-invoicing', 'event-completed', 'partially-invoiced'].includes(p.economyStatus) && p.remainingToInvoice > 0) {
      completedNotFullyInvoiced++;
    }

    // Risk
    if (p.isRisk) riskProjectCount++;

    // Forecasts: 30-day = ready to invoice + events within 30 days
    if (p.eventdate) {
      try {
        const ed = parseISO(p.eventdate);
        if (ed <= day30 && p.remainingToInvoice > 0) {
          forecast30 += p.remainingToInvoice;
        }
        if (ed <= day90 && p.remainingToInvoice > 0) {
          forecast90 += p.remainingToInvoice;
        }
      } catch {}
    } else if (['ready-for-invoicing', 'event-completed'].includes(p.economyStatus)) {
      forecast30 += p.remainingToInvoice;
      forecast90 += p.remainingToInvoice;
    }

    totalExpectedRevenue += p.expectedRevenue;
    totalCosts += p.totalCost;
  });

  // Add already-ready to forecast
  forecast30 = Math.max(forecast30, readyToInvoice);

  const projectedMarginPercent = totalExpectedRevenue > 0 
    ? ((totalExpectedRevenue - totalCosts) / totalExpectedRevenue) * 100 
    : 0;

  return {
    invoicedThisMonth,
    readyToInvoice,
    forecast30,
    forecast90,
    totalCostsThisMonth,
    projectedMarginPercent,
    completedNotFullyInvoiced,
    riskProjectCount,
  };
}

// ─── Forecast Data (for charts) ─────────────────────────────────────────────

export interface ForecastBucket {
  label: string;
  secure: number;    // Already invoiced + ready
  probable: number;  // Active with strong data
  pipeline: number;  // All remaining with some economic value
}

export function computeForecasts(projects: EnrichedProject[]): ForecastBucket[] {
  const now = new Date();
  const buckets = [
    { label: '30 dagar', days: 30 },
    { label: '60 dagar', days: 60 },
    { label: '90 dagar', days: 90 },
  ];

  return buckets.map(({ label, days }) => {
    const cutoff = addDays(now, days);
    let secure = 0;
    let probable = 0;
    let pipeline = 0;

    projects.forEach(p => {
      const inRange = !p.eventdate || (() => {
        try { return parseISO(p.eventdate!) <= cutoff; } catch { return false; }
      })();
      if (!inRange) return;

      if (['fully-invoiced', 'economy-closed'].includes(p.economyStatus)) {
        secure += p.totalInvoiced;
      } else if (['ready-for-invoicing', 'partially-invoiced'].includes(p.economyStatus)) {
        secure += p.totalInvoiced;
        probable += p.remainingToInvoice;
      } else if (['event-completed', 'ongoing'].includes(p.economyStatus)) {
        if (p.expectedRevenue > 0 && p.missingData.length <= 1) {
          probable += p.expectedRevenue - p.totalInvoiced;
        } else if (p.expectedRevenue > 0) {
          pipeline += p.expectedRevenue - p.totalInvoiced;
        }
      } else if (p.economyStatus === 'upcoming') {
        pipeline += p.expectedRevenue;
      }
    });

    return { label, secure, probable, pipeline };
  });
}

// ─── Risk categorization ────────────────────────────────────────────────────

export interface RiskItem {
  project: EnrichedProject;
  reasons: string[];
}

export function computeRiskList(projects: EnrichedProject[]): RiskItem[] {
  const risks: RiskItem[] = [];

  projects.forEach(p => {
    const reasons: string[] = [];
    const s = p.summary;

    if (s.totalBudget > 0 && s.totalDeviationPercent < -10) {
      reasons.push('Över budget (>' + Math.abs(s.totalDeviationPercent).toFixed(0) + '%)');
    }
    if (p.projectedMarginPercent < 0) {
      reasons.push('Negativ marginalprognos');
    }
    if (['event-completed', 'ready-for-invoicing'].includes(p.economyStatus) && p.totalInvoiced === 0) {
      reasons.push('Avslutat men ej fakturerat');
    }
    if (p.missingData.includes('leverantörsfakturor') && p.economyStatus !== 'upcoming') {
      reasons.push('Saknar leverantörsfakturor');
    }
    if (p.missingData.includes('tidrapporter') && !['upcoming', 'economy-closed'].includes(p.economyStatus)) {
      reasons.push('Saknar tidrapporter');
    }
    if (p.missingData.includes('budget') && p.missingData.includes('offert')) {
      reasons.push('Saknar budget och offertdata');
    }

    if (reasons.length > 0) {
      risks.push({ project: p, reasons });
    }
  });

  // Sort by number of reasons desc
  return risks.sort((a, b) => b.reasons.length - a.reasons.length);
}

// ─── Main hook ──────────────────────────────────────────────────────────────

export function useEconomyDashboard(projects: ProjectWithEconomy[] | undefined) {
  const enriched = useMemo(() => 
    (projects || []).map(enrichProject), [projects]);

  const kpis = useMemo(() => computeDashboardKPIs(enriched), [enriched]);
  const forecasts = useMemo(() => computeForecasts(enriched), [enriched]);
  const risks = useMemo(() => computeRiskList(enriched), [enriched]);

  const byStatus = useMemo(() => {
    const map: Record<EconomyStatus, EnrichedProject[]> = {
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
    enriched.forEach(p => map[p.economyStatus].push(p));
    return map;
  }, [enriched]);

  // Invoicing queue: projects that need invoicing attention
  const invoicingQueue = useMemo(() => ({
    readyForInvoicing: [...byStatus['ready-for-invoicing'], ...byStatus['event-completed']]
      .sort((a, b) => b.remainingToInvoice - a.remainingToInvoice),
    partiallyInvoiced: byStatus['partially-invoiced']
      .sort((a, b) => b.remainingToInvoice - a.remainingToInvoice),
    completedNotInvoiced: enriched
      .filter(p => ['ready-for-invoicing', 'event-completed', 'partially-invoiced'].includes(p.economyStatus) && p.remainingToInvoice > 0)
      .sort((a, b) => {
        const da = a.eventdate ? new Date(a.eventdate).getTime() : 0;
        const db = b.eventdate ? new Date(b.eventdate).getTime() : 0;
        return da - db; // oldest first = most overdue
      }),
  }), [byStatus, enriched]);

  // Completed projects
  const completedProjects = useMemo(() => 
    enriched
      .filter(p => ['fully-invoiced', 'economy-closed', 'ready-for-invoicing', 'partially-invoiced', 'event-completed'].includes(p.economyStatus) || p.status === 'completed')
      .sort((a, b) => {
        const da = a.eventdate ? new Date(a.eventdate).getTime() : 0;
        const db = b.eventdate ? new Date(b.eventdate).getTime() : 0;
        return db - da;
      }),
    [enriched]);

  return {
    enriched,
    kpis,
    forecasts,
    risks,
    byStatus,
    invoicingQueue,
    completedProjects,
  };
}
