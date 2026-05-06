import React from 'react';
import { cn } from '@/lib/utils';
import {
  AdminTimeReviewResult,
  evaluateDayApprovalState,
  type DayApprovalState,
  type ReviewWorkdayInput,
  type ReviewOpenTimer,
  type ReviewAssistantEvent,
} from '@/lib/admin/adminTimeReviewEngine';

/**
 * DayStatusBadge — visar dagens 4-stegs attest-status:
 *   Pågår / Redo för attest / Godkänd / Kräver korrigering
 *
 * Drivs av evaluateDayApprovalState() — samma källa som DayApprovalAction.
 * Oallokerad tid räknas aldrig som "Kräver korrigering".
 */
export interface DayStatusBadgeProps {
  result: AdminTimeReviewResult;
  workday: ReviewWorkdayInput | null;
  reviewStatus?: 'open' | 'needs_review' | 'approved' | string | null;
  openTimer?: ReviewOpenTimer | null;
  assistantEvents?: ReviewAssistantEvent[];
  className?: string;
}

const STATE_CLASSES: Record<DayApprovalState, string> = {
  in_progress: 'bg-muted text-muted-foreground border-border',
  ready_for_approval: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  approved: 'bg-primary/15 text-primary border-primary/30',
  requires_correction: 'bg-destructive/15 text-destructive border-destructive/40',
};

export const DayStatusBadge: React.FC<DayStatusBadgeProps> = ({
  result,
  workday,
  reviewStatus,
  openTimer = null,
  assistantEvents = [],
  className,
}) => {
  const state = evaluateDayApprovalState(result, {
    workday,
    openTimer,
    assistantEvents,
    reviewStatus,
  });

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold',
        STATE_CLASSES[state.state],
        className,
      )}
      title={state.detail}
    >
      <span className="truncate max-w-[160px]">{state.label}</span>
    </span>
  );
};

export default DayStatusBadge;
