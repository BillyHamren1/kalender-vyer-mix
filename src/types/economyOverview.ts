/**
 * Economy Overview Dashboard Types
 * 
 * These types define the data model for the Economy Overview dashboard.
 * They sit on top of the raw ProjectWithEconomy data from useEconomyOverviewData
 * and provide normalized, enriched views for KPIs, invoicing, forecasts, and risk.
 */

import type { EconomySummary, StaffTimeReport } from '@/types/projectEconomy';
import type { ProjectSize } from '@/hooks/useEconomyOverviewData';

// ─── Derived Economy Status ─────────────────────────────────────────────────

/**
 * Computed status for each project based on dates, invoicing, budget, and data completeness.
 * Evaluated in priority order — earlier statuses take precedence.
 */
export type EconomyProjectStatus =
  | 'upcoming'              // Event date is in the future
  | 'ongoing'               // Active, event date not yet passed (or no date)
  | 'event-completed'       // Event date has passed, project not yet closed
  | 'ready-for-invoicing'   // Project marked completed or explicitly ready
  | 'partially-invoiced'    // Some invoices exist but not fully invoiced
  | 'fully-invoiced'        // Invoiced >= 95% of expected revenue
  | 'economy-closed'        // All supplier invoices final-linked and project completed
  | 'risk'                  // Over budget (>10%) or negative projected margin
  | 'missing-data';         // Lacks 3+ critical data points

// ─── Missing Data Flags ─────────────────────────────────────────────────────

/**
 * Granular flags for what data a project is missing.
 * Used for risk detection and data quality indicators.
 */
export type MissingDataFlag =
  | 'missing-quote'
  | 'missing-invoice'
  | 'missing-budget'
  | 'missing-time-reports'
  | 'missing-supplier-invoices'
  | 'missing-booking'
  | 'missing-eventdate';

// ─── Forecast Bucket ────────────────────────────────────────────────────────

/**
 * Revenue/cost forecast for a given time horizon (30/60/90 days).
 * Three confidence tiers: safe, likely, pipeline.
 */
export interface EconomyForecastBucket {
  /** Horizon label, e.g. "30 dagar" */
  label: string;
  /** Number of days in this horizon */
  days: number;

  // Revenue tiers
  /** Already invoiced + completed ready-for-invoicing within the period */
  safeRevenue: number;
  /** Safe + active projects with strong economic data (quote + ≤1 missing flag) */
  likelyRevenue: number;
  /** Likely + upcoming/weak-data projects with some economic value */
  pipelineRevenue: number;

  // Actuals
  /** Total already invoiced across all projects in period */
  actualInvoiced: number;
  /** Total actual costs incurred */
  actualCost: number;

  // Cost forecast
  /** Projected total cost for projects in this period */
  forecastCost: number;

  // Margin
  /** Likely revenue minus forecast cost */
  forecastMargin: number;
  /** Margin as percentage of likely revenue */
  forecastMarginPercent: number;
}

// ─── Dashboard Summary ──────────────────────────────────────────────────────

/**
 * Aggregated KPIs for the entire economy dashboard.
 * Computed from all projects via getDashboardSummary().
 */
export interface EconomyDashboardSummary {
  // Counts
  totalProjects: number;
  ongoingCount: number;
  upcomingCount: number;
  completedCount: number;
  readyForInvoicingCount: number;
  partiallyInvoicedCount: number;
  fullyInvoicedCount: number;
  economyClosedCount: number;
  riskCount: number;
  missingDataCount: number;

  // Financial KPIs
  /** Sum of invoicesTotal for projects with eventdate in current month */
  invoicedThisMonth: number;
  /** Sum of remainingToInvoice for ready/event-completed projects */
  readyToInvoiceAmount: number;
  /** Total costs for projects with eventdate in current month */
  totalCostsThisMonth: number;

  // Revenue projections (sum of likelyRevenue per bucket)
  projectedRevenue30: number;
  projectedRevenue60: number;
  projectedRevenue90: number;

  // Cost projections
  projectedCost30: number;
  projectedCost60: number;
  projectedCost90: number;

  // Margin projections
  projectedMargin30: number;
  projectedMargin60: number;
  projectedMargin90: number;

  // Overall margin
  /** Total expected revenue across all projects */
  totalExpectedRevenue: number;
  /** Total actual cost across all projects */
  totalActualCost: number;
  /** Overall projected margin percent */
  projectedMarginPercent: number;

  // Action items
  /** Number of completed/event-completed projects not fully invoiced */
  completedNotFullyInvoicedCount: number;
  /** Number of projects flagged as risk */
  riskProjectCount: number;
}

// ─── Project Insight ────────────────────────────────────────────────────────

/**
 * Enriched per-project view with all computed economy fields.
 * This is the primary data object used by all dashboard components.
 */
export interface EconomyProjectInsight {
  // Identity
  id: string;
  name: string;
  projectSize: ProjectSize;
  status: string;
  booking_id: string | null;
  eventdate: string | null;
  navigateTo: string;

  // Derived status
  economyStatus: EconomyProjectStatus;

  // Raw summary (from batch API)
  summary: EconomySummary;
  timeReports: StaffTimeReport[];
  economyClosed: boolean;

  // Revenue
  /** Best guess: quotesTotal > 0 ? quotesTotal : productCostBudget */
  quotedAmount: number;
  /** Already invoiced (summary.invoicesTotal) */
  invoicedAmount: number;
  /** Max(0, quotedAmount - invoicedAmount) */
  remainingToInvoice: number;

  // Costs
  /** staffActual + purchasesTotal + supplierInvoicesTotal */
  actualCost: number;
  /**
   * Forecast total cost. Uses totalBudget if available and project is not
   * completed; otherwise uses actualCost as best estimate.
   */
  forecastCost: number;

  // Revenue forecast
  /** quotedAmount if project has economic data; 0 otherwise */
  forecastRevenue: number;

  // Margin
  /** forecastRevenue - forecastCost */
  forecastMargin: number;
  /** forecastMargin / forecastRevenue * 100 (0 if no revenue) */
  forecastMarginPercent: number;

  // Boolean convenience flags
  isReadyForInvoicing: boolean;
  isPartiallyInvoiced: boolean;
  isFullyInvoiced: boolean;
  isEconomyClosed: boolean;
  isRiskProject: boolean;

  // Data quality
  missingDataFlags: MissingDataFlag[];
}

// ─── Risk Item ──────────────────────────────────────────────────────────────

/**
 * A project paired with human-readable risk reasons.
 */
export interface EconomyRiskItem {
  project: EconomyProjectInsight;
  reasons: string[];
}
