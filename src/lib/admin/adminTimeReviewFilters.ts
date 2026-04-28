/**
 * adminTimeReviewFilters — pure helpers extracted from AdminTimeReview
 * page so they can be unit-tested without rendering the page.
 *
 * Mirror of the predicates used in src/pages/AdminTimeReview.tsx.
 */
import type { DayReviewRow } from './timeReviewQueries';
import type { FilterState } from '@/components/admin/time-review/FilterBar';
import type { SummaryCounts } from '@/components/admin/time-review/SummaryCards';
import type { EmptyKind } from '@/components/admin/time-review/EmptyState';

export const computeCounts = (rows: DayReviewRow[]): SummaryCounts => ({
  total: rows.length,
  ongoing: rows.filter((r) => r.workdayStart && !r.workdayEnd).length,
  needsReview: rows.filter(
    (r) => r.reviewStatus === 'needs_review' || r.result.status === 'critical',
  ).length,
  readyToApprove: rows.filter(
    (r) => r.reviewStatus !== 'approved' && r.result.status === 'ok' && r.workdayEnd,
  ).length,
  approved: rows.filter((r) => r.reviewStatus === 'approved').length,
});

export const matchesFilter = (row: DayReviewRow, f: FilterState): boolean => {
  if (f.staffId !== 'all' && row.staffId !== f.staffId) return false;
  if (f.status === 'ongoing' && !(row.workdayStart && !row.workdayEnd)) return false;
  if (
    f.status === 'needsReview' &&
    !(row.reviewStatus === 'needs_review' || row.result.status === 'critical')
  )
    return false;
  if (
    f.status === 'readyToApprove' &&
    !(row.reviewStatus !== 'approved' && row.result.status === 'ok' && row.workdayEnd)
  )
    return false;
  if (f.status === 'approved' && row.reviewStatus !== 'approved') return false;
  if (f.anomaly !== 'all' && !row.result.anomalies.some((a) => a.kind === f.anomaly))
    return false;
  if (f.projectQuery.trim()) {
    const q = f.projectQuery.trim().toLowerCase();
    if (!row.staffName.toLowerCase().includes(q)) return false;
  }
  // Date-range gate (defensive — page query already scopes by from/to,
  // but kept here so the helper is self-contained for tests).
  if (f.from && f.to) {
    const d = row.date;
    const fromYmd = f.from.toISOString().slice(0, 10);
    const toYmd = f.to.toISOString().slice(0, 10);
    if (d < fromYmd || d > toYmd) return false;
  }
  return true;
};

export const computeEmptyKind = (
  rows: DayReviewRow[],
  filteredRows: DayReviewRow[],
  filter: FilterState,
  topFilter: keyof SummaryCounts | null,
): EmptyKind | null => {
  if (filteredRows.length > 0) return null;
  if (rows.length === 0) return 'no-days';
  if (
    filter.staffId !== 'all' ||
    filter.status !== 'all' ||
    filter.anomaly !== 'all' ||
    filter.projectQuery ||
    topFilter
  ) {
    return 'no-matches';
  }
  if (rows.every((r) => r.reviewStatus === 'approved')) return 'all-approved';
  if (rows.every((r) => r.result.anomalies.length === 0)) return 'no-anomalies';
  return 'no-matches';
};
