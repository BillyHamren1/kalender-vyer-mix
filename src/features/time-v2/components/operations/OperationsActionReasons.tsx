import React from 'react';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CalendarX2, Link2Off, Receipt, RotateCcw, SearchCheck } from 'lucide-react';
import type { OperationsActionCode, OperationsActionReason } from '@/features/time-v2/lib/operations';

const ICONS: Record<OperationsActionCode, React.ReactNode> = {
  time_needs_review: <SearchCheck className="w-3 h-3" />,
  time_missing: <CalendarX2 className="w-3 h-3" />,
  time_correction: <RotateCcw className="w-3 h-3" />,
  expenses_open: <Receipt className="w-3 h-3" />,
  expenses_unbound: <Link2Off className="w-3 h-3" />,
};

/** Visual weight per reason: destructive when Planning cannot decide it yet. */
const VARIANT: Record<OperationsActionCode, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  time_needs_review: 'default',
  time_missing: 'destructive',
  time_correction: 'secondary',
  expenses_open: 'default',
  expenses_unbound: 'destructive',
};

interface Props {
  reasons: OperationsActionReason[];
  testId?: string;
  /** Shown when the list is empty (detail panel only). */
  emptyLabel?: string;
}

/** The row's action reasons in operator language — one chip per reason, contract-derived only. */
const OperationsActionReasons: React.FC<Props> = ({ reasons, testId = 'time-v2-ops-action-reasons', emptyLabel }) => {
  if (reasons.length === 0) {
    return emptyLabel ? (
      <p className="text-xs text-muted-foreground" data-testid={`${testId}-none`}>{emptyLabel}</p>
    ) : null;
  }
  return (
    <ul className="flex flex-wrap gap-1" data-testid={testId} aria-label="Åtgärdsorsaker">
      {reasons.map((r) => (
        <li key={r.code}>
          <Badge variant={VARIANT[r.code]} className="text-[10px] gap-1 font-normal" data-reason={r.code}>
            {ICONS[r.code] ?? <AlertTriangle className="w-3 h-3" />}
            {r.label}
          </Badge>
        </li>
      ))}
    </ul>
  );
};

export default OperationsActionReasons;
