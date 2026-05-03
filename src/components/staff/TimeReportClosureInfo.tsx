import React from 'react';
import { Info, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { useTimeReportClosureReason, type ClosureKind } from '@/hooks/useTimeReportClosureReason';

interface Props {
  timeReportId: string | null | undefined;
  staffId: string;
  reportDate: string | null | undefined;
}

const kindStyle: Record<ClosureKind, string> = {
  manual_mobile: 'text-emerald-600',
  manual_admin: 'text-blue-600',
  manual_staff_edit: 'text-blue-500',
  auto_watchdog: 'text-amber-600',
  unknown: 'text-muted-foreground',
};

/**
 * Tiny info icon shown next to the end-time of a closed time report row.
 * Hover to see *how* and *when* the report was closed (manual stop in
 * mobile, manual edit by admin, or watchdog auto-close).
 */
export const TimeReportClosureInfo: React.FC<Props> = ({ timeReportId, staffId, reportDate }) => {
  const { data, isLoading } = useTimeReportClosureReason({
    timeReportId,
    staffId,
    reportDate,
    enabled: !!timeReportId,
  });

  if (!timeReportId) return null;

  if (isLoading) {
    return <Loader2 className="inline h-3 w-3 animate-spin text-muted-foreground ml-1" aria-hidden />;
  }
  if (!data) return null;

  const colour = kindStyle[data.kind];
  const at = data.at ? format(new Date(data.at), 'd MMM HH:mm', { locale: sv }) : null;

  return (
    <HoverCard openDelay={150} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          aria-label="Visa varför tidrapporten stängdes"
          className={`inline-flex items-center align-middle ml-1 ${colour} hover:opacity-80`}
          onClick={(e) => e.stopPropagation()}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="top" align="start" className="w-72 text-xs">
        <div className={`font-semibold ${colour}`}>{data.label}</div>
        <div className="mt-1 text-foreground">{data.detail}</div>
        {(at || data.byName) && (
          <div className="mt-2 text-muted-foreground">
            {at && <div>När: {at}</div>}
            {data.byName && <div>Av: {data.byName}</div>}
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
};
