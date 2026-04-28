import React from 'react';
import { cn } from '@/lib/utils';
import {
  AdminTimeReviewResult,
  summarizeForBadge,
  ReviewStatus,
} from '@/lib/admin/adminTimeReviewEngine';

/**
 * DayStatusBadge — single chip rendering of a person×day's review status.
 *
 * Reads from the same `evaluateAdminTimeReview()` result that
 * AdminTimeReviewDashboard rows and DayReviewPanel use, so the colour
 * and label can never drift between surfaces.
 */
export interface DayStatusBadgeProps {
  result: AdminTimeReviewResult;
  /** When true, show "{n}" badge with the anomaly count. */
  showCount?: boolean;
  className?: string;
}

const STATUS_CLASSES: Record<ReviewStatus, string> = {
  ok: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  warning: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  critical: 'bg-destructive/15 text-destructive border-destructive/40',
};

const STATUS_FALLBACK_LABEL: Record<ReviewStatus, string> = {
  ok: 'OK',
  warning: 'Granska',
  critical: 'Åtgärd krävs',
};

export const DayStatusBadge: React.FC<DayStatusBadgeProps> = ({
  result,
  showCount = true,
  className,
}) => {
  const summary = summarizeForBadge(result);
  const label = summary.topLabel ?? STATUS_FALLBACK_LABEL[summary.status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold',
        STATUS_CLASSES[summary.status],
        className,
      )}
      title={summary.topLabel ?? undefined}
    >
      <span className="truncate max-w-[160px]">{label}</span>
      {showCount && summary.count > 1 && (
        <span className="opacity-70">+{summary.count - 1}</span>
      )}
    </span>
  );
};

export default DayStatusBadge;
