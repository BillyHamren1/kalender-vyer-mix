/**
 * Shared Project Economy Status Model
 * 
 * This is the single source of truth for project economy signals,
 * blockers, and warnings. Used by:
 * - ProjectEconomyTab (single project view)
 * - ProjectLeaderActionBoard (overview across many projects)
 * - ProjectClosureGate (closure checklist)
 * - EconomyOverview / BillingSection
 * 
 * All computation is pure — no hooks, no side effects.
 */

import type { EconomySummary } from '@/types/projectEconomy';
import type { BillingStatus } from '@/hooks/useProjectBilling';

// ─── Input: attestation counts (from getAttestationCounts) ──────────────────

export interface AttestationCounts {
  imported: number;
  needsReview: number;
  linked: number;
  attested: number;
  rejected: number;
  unreviewed: number;
  unattested: number;
}

// ─── Signal levels ──────────────────────────────────────────────────────────

export type SignalLevel = 'ok' | 'warning' | 'danger' | 'neutral';

// ─── Individual status signals ──────────────────────────────────────────────

export interface TimeStatus {
  level: SignalLevel;
  label: string;
  detail?: string;
}

export interface CostStatus {
  level: SignalLevel;
  label: string;
  detail?: string;
}

export interface SupplierInvoiceStatus {
  level: SignalLevel;
  label: string;
  detail?: string;
  /** Total unattested count */
  unattestedCount: number;
  /** Total imported (new) count */
  importedCount: number;
}

export interface MarginStatus {
  level: SignalLevel;
  label: string;
  detail?: string;
  /** Margin as percentage */
  marginPercent: number;
  /** Absolute margin amount */
  marginAmount: number;
}

export interface ClosureStatus {
  level: SignalLevel;
  label: string;
  /** Whether the project can be closed (no blockers) */
  canClose: boolean;
  blockerCount: number;
  warningCount: number;
}

export interface ClosureTrackingStatus {
  level: SignalLevel;
  label: string;
  billingStatus: BillingStatus | null;
}

// ─── Blocker / Warning ──────────────────────────────────────────────────────

export type BlockerType =
  | 'unattested_invoices'
  | 'new_unreviewed_costs'
  | 'economy_data_stale';

export type WarningType =
  | 'budget_deviation'
  | 'low_margin'
  | 'time_reports_unapproved';

export interface Blocker {
  type: BlockerType;
  label: string;
  detail?: string;
}

export interface Warning {
  type: WarningType;
  label: string;
  detail?: string;
}

// ─── Combined signals ───────────────────────────────────────────────────────

export interface ProjectEconomySignals {
  time: TimeStatus;
  cost: CostStatus;
  supplierInvoice: SupplierInvoiceStatus;
  margin: MarginStatus;
  closure: ClosureStatus;
  handover: ClosureTrackingStatus;
  blockers: Blocker[];
  warnings: Warning[];
  /** Revenue amount (productRevenue) */
  revenue: number;
  /** Total actual cost */
  totalCost: number;
  /** Time report approval counts */
  timeReportCounts: { total: number; approved: number; pending: number };
}

// ─── Input for computing signals ────────────────────────────────────────────

export interface ProjectEconomyInput {
  summary: EconomySummary;
  attestCounts: AttestationCounts;
  billingStatus: BillingStatus | null;
  budgetedHours: number;
  hourlyRate: number;
  timeReportsApproved: boolean;
  hasRecentEconomyData: boolean;
  /** Counts for time report approval */
  timeReportCounts?: {
    total: number;
    approved: number;
    pending: number;
  };
}

// ─── Pure computation ───────────────────────────────────────────────────────

/**
 * Compute all project economy signals from raw inputs.
 * This is the main entry point. Use everywhere.
 */
export function computeProjectEconomySignals(input: ProjectEconomyInput): ProjectEconomySignals {
  const { summary, attestCounts, billingStatus, budgetedHours, hourlyRate, timeReportsApproved, hasRecentEconomyData } = input;

  const revenue = summary.productRevenue || 0;
  const totalCost = summary.totalActual || 0;
  const marginAmount = revenue - totalCost;
  const marginPercent = revenue > 0 ? (marginAmount / revenue) * 100 : 0;
  const budgetTarget = budgetedHours * hourlyRate;
  const budgetDeviation = budgetTarget > 0 ? ((totalCost - budgetTarget) / budgetTarget) * 100 : 0;

  const trCounts = input.timeReportCounts ?? { total: 0, approved: 0, pending: 0 };
  const allTimesApproved = timeReportsApproved && trCounts.pending === 0;

  // --- Blockers & Warnings ---
  const blockers = computeBlockers(attestCounts, hasRecentEconomyData);
  const warnings = computeWarnings(budgetDeviation, marginPercent, allTimesApproved);

  // --- Individual signals ---
  const time = computeTimeStatus(summary, trCounts);
  const cost = computeCostStatus(summary, budgetTarget);
  const supplierInvoice = computeSupplierInvoiceStatus(attestCounts);
  const margin = computeMarginStatus(marginPercent, marginAmount, revenue);
  const closure = computeClosureStatus(blockers, warnings);
  const handover = computeHandoverStatus(billingStatus);

  return {
    time,
    cost,
    supplierInvoice,
    margin,
    closure,
    handover,
    blockers,
    warnings,
    revenue,
    totalCost,
    timeReportCounts: trCounts,
  };
}

// ─── Blocker computation ────────────────────────────────────────────────────

export function computeBlockers(
  attestCounts: AttestationCounts,
  hasRecentEconomyData: boolean,
): Blocker[] {
  const blockers: Blocker[] = [];

  if (attestCounts.unattested > 0) {
    blockers.push({
      type: 'unattested_invoices',
      label: 'Alla leverantörsfakturor attesterade',
      detail: `${attestCounts.unattested} oattesterade fakturor`,
    });
  }

  if (attestCounts.imported > 0) {
    blockers.push({
      type: 'new_unreviewed_costs',
      label: 'Inga nya ogranskade kostnader',
      detail: `${attestCounts.imported} nya kostnader`,
    });
  }

  if (!hasRecentEconomyData) {
    blockers.push({
      type: 'economy_data_stale',
      label: 'Ekonomibilden uppdaterad',
      detail: 'Uppdatera ekonomidata innan stängning',
    });
  }

  return blockers;
}

// ─── Warning computation ────────────────────────────────────────────────────

export function computeWarnings(
  budgetDeviationPercent: number,
  marginPercent: number,
  timeReportsApproved: boolean,
): Warning[] {
  const warnings: Warning[] = [];

  if (Math.abs(budgetDeviationPercent) > 10) {
    warnings.push({
      type: 'budget_deviation',
      label: 'Budgetavvikelse inom rimlig nivå',
      detail: `${budgetDeviationPercent.toFixed(0)}% avvikelse`,
    });
  }

  if (marginPercent < 10) {
    warnings.push({
      type: 'low_margin',
      label: 'Marginal acceptabel',
      detail: `Marginal: ${marginPercent.toFixed(0)}%`,
    });
  }

  if (!timeReportsApproved) {
    warnings.push({
      type: 'time_reports_unapproved',
      label: 'Tidrapporter godkända',
      detail: 'Ej alla tidrapporter godkända',
    });
  }

  return warnings;
}

// ─── Individual signal computations ─────────────────────────────────────────

function computeTimeStatus(
  summary: EconomySummary,
  trCounts: { total: number; approved: number; pending: number },
): TimeStatus {
  if (summary.budgetedHours === 0 && summary.actualHours === 0) {
    return { level: 'neutral', label: 'Inga timmar registrerade' };
  }
  if (trCounts.pending > 0) {
    return { level: 'warning', label: 'Ej godkända tider', detail: `${trCounts.pending} av ${trCounts.total} väntar` };
  }
  const deviation = summary.staffDeviationPercent;
  if (deviation <= 0) return { level: 'ok', label: 'Inom tidsbudget' };
  if (deviation <= 10) return { level: 'warning', label: 'Nära tidsbudget', detail: `${deviation.toFixed(0)}% över` };
  return { level: 'danger', label: 'Över tidsbudget', detail: `${deviation.toFixed(0)}% över` };
}

function computeCostStatus(summary: EconomySummary, budgetTarget: number): CostStatus {
  if (budgetTarget === 0 && summary.totalActual === 0) {
    return { level: 'neutral', label: 'Inga kostnader' };
  }
  if (budgetTarget === 0) {
    return { level: 'neutral', label: 'Ingen budget satt', detail: `Kostnad: ${summary.totalActual.toFixed(0)} kr` };
  }
  const percent = ((summary.totalActual - budgetTarget) / budgetTarget) * 100;
  if (percent <= 0) return { level: 'ok', label: 'Inom kostnadsbudget' };
  if (percent <= 10) return { level: 'warning', label: 'Nära kostnadsbudget', detail: `${percent.toFixed(0)}% över` };
  return { level: 'danger', label: 'Över kostnadsbudget', detail: `${percent.toFixed(0)}% över` };
}

function computeSupplierInvoiceStatus(counts: AttestationCounts): SupplierInvoiceStatus {
  if (counts.unattested === 0 && counts.imported === 0) {
    return { level: 'ok', label: 'Alla attesterade', unattestedCount: 0, importedCount: 0 };
  }
  if (counts.imported > 0) {
    return {
      level: 'danger',
      label: 'Nya ej granskade',
      detail: `${counts.imported} nya fakturor`,
      unattestedCount: counts.unattested,
      importedCount: counts.imported,
    };
  }
  return {
    level: 'warning',
    label: 'Ej attesterade',
    detail: `${counts.unattested} inväntar attest`,
    unattestedCount: counts.unattested,
    importedCount: 0,
  };
}

function computeMarginStatus(marginPercent: number, marginAmount: number, revenue: number): MarginStatus {
  if (revenue === 0) {
    return { level: 'neutral', label: 'Ingen intäkt', marginPercent: 0, marginAmount: 0 };
  }
  if (marginPercent >= 20) return { level: 'ok', label: 'God marginal', marginPercent, marginAmount };
  if (marginPercent >= 10) return { level: 'ok', label: 'Acceptabel marginal', marginPercent, marginAmount };
  if (marginPercent >= 0) return { level: 'warning', label: 'Låg marginal', detail: `${marginPercent.toFixed(0)}%`, marginPercent, marginAmount };
  return { level: 'danger', label: 'Negativ marginal', detail: `${marginPercent.toFixed(0)}%`, marginPercent, marginAmount };
}

function computeClosureStatus(blockers: Blocker[], warnings: Warning[]): ClosureStatus {
  if (blockers.length === 0 && warnings.length === 0) {
    return { level: 'ok', label: 'Redo att stänga', canClose: true, blockerCount: 0, warningCount: 0 };
  }
  if (blockers.length === 0) {
    return { level: 'warning', label: 'Redo med varningar', canClose: true, blockerCount: 0, warningCount: warnings.length };
  }
  return {
    level: 'danger',
    label: 'Blockerad',
    canClose: false,
    blockerCount: blockers.length,
    warningCount: warnings.length,
  };
}

function computeHandoverStatus(billingStatus: BillingStatus | null): HandoverStatus {
  if (!billingStatus) return { level: 'neutral', label: 'Ej påbörjad', billingStatus: null };

  const map: Record<BillingStatus, { level: SignalLevel; label: string }> = {
    draft: { level: 'neutral', label: 'Under granskning' },
    needs_completion: { level: 'warning', label: 'Kräver komplettering' },
    ready_for_handover: { level: 'ok', label: 'Klar för överlämning' },
    handed_over_to_booking: { level: 'ok', label: 'Överlämnad till ekonomi' },
    invoiced_in_booking: { level: 'ok', label: 'Fakturerad' },
  };

  const entry = map[billingStatus] || { level: 'neutral', label: billingStatus };
  return { ...entry, billingStatus };
}

// ─── Convenience: build GateItems from signals (for ProjectClosureGate) ─────

import type { GateItem } from '@/components/economy/ProjectClosureGate';

export function buildGateItemsFromSignals(signals: ProjectEconomySignals): GateItem[] {
  const gates: GateItem[] = [];

  // Blockers → blocking gates (inverted: gate.passed = false when blocker exists)
  // We need to show all potential gates, passed or not
  
  // Blocker: unattested invoices
  const hasUnattestedBlocker = signals.blockers.some(b => b.type === 'unattested_invoices');
  gates.push({
    label: 'Alla leverantörsfakturor attesterade',
    passed: !hasUnattestedBlocker,
    blocking: true,
    detail: hasUnattestedBlocker
      ? signals.blockers.find(b => b.type === 'unattested_invoices')?.detail
      : undefined,
  });

  // Blocker: new unreviewed costs
  const hasNewCostsBlocker = signals.blockers.some(b => b.type === 'new_unreviewed_costs');
  gates.push({
    label: 'Inga nya ogranskade kostnader',
    passed: !hasNewCostsBlocker,
    blocking: true,
    detail: hasNewCostsBlocker
      ? signals.blockers.find(b => b.type === 'new_unreviewed_costs')?.detail
      : undefined,
  });

  // Blocker: stale economy data
  const hasStaleBlocker = signals.blockers.some(b => b.type === 'economy_data_stale');
  gates.push({
    label: 'Ekonomibilden uppdaterad',
    passed: !hasStaleBlocker,
    blocking: true,
    detail: hasStaleBlocker
      ? signals.blockers.find(b => b.type === 'economy_data_stale')?.detail
      : undefined,
  });

  // Warning: budget deviation
  const hasBudgetWarning = signals.warnings.some(w => w.type === 'budget_deviation');
  gates.push({
    label: 'Budgetavvikelse inom rimlig nivå',
    passed: !hasBudgetWarning,
    blocking: false,
    detail: hasBudgetWarning
      ? signals.warnings.find(w => w.type === 'budget_deviation')?.detail
      : undefined,
  });

  // Warning: low margin
  const hasMarginWarning = signals.warnings.some(w => w.type === 'low_margin');
  gates.push({
    label: 'Marginal acceptabel',
    passed: !hasMarginWarning,
    blocking: false,
    detail: hasMarginWarning
      ? signals.warnings.find(w => w.type === 'low_margin')?.detail
      : undefined,
  });

  // Warning: time reports
  const hasTimeWarning = signals.warnings.some(w => w.type === 'time_reports_unapproved');
  gates.push({
    label: 'Tidrapporter godkända',
    passed: !hasTimeWarning,
    blocking: false,
    detail: hasTimeWarning
      ? signals.warnings.find(w => w.type === 'time_reports_unapproved')?.detail
      : undefined,
  });

  return gates;
}

// ─── Convenience: empty counts ──────────────────────────────────────────────

export const EMPTY_ATTEST_COUNTS: AttestationCounts = {
  imported: 0,
  needsReview: 0,
  linked: 0,
  attested: 0,
  rejected: 0,
  unreviewed: 0,
  unattested: 0,
};
