import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, addWeeks, subWeeks, addMonths, subMonths } from 'date-fns';
import { useTransportAssignments } from '@/hooks/useTransportAssignments';
import LogisticsTransportWidget from '@/components/logistics/widgets/LogisticsTransportWidget';
import LogisticsWeekView from '@/components/logistics/LogisticsWeekView';
import TransportBookingTab from '@/components/logistics/TransportBookingTab';

type ExpandedWidget = 'transport' | null;

const LogisticsPlanning: React.FC = () => {
  const [expanded, setExpanded] = useState<ExpandedWidget>(null);
  
  // Shared date state for transport widget (week view manages its own)
  const [widgetDateMode, setWidgetDateMode] = useState<'week' | 'month' | 'custom'>('week');
  const [widgetWeekOffset, setWidgetWeekOffset] = useState(0);
  const [widgetMonthOffset, setWidgetMonthOffset] = useState(0);
  const [widgetCustomRange, setWidgetCustomRange] = useState<{ from: Date; to: Date } | null>(null);
  const [weekViewDate, setWeekViewDate] = useState(new Date());

  // Compute the widest date range needed across both components
  const combinedRange = useMemo(() => {
    const now = new Date();
    
    // Week view range
    const wvStart = startOfWeek(weekViewDate, { weekStartsOn: 1 });
    const wvEnd = endOfWeek(weekViewDate, { weekStartsOn: 1 });

    // Widget range
    let wtStart: Date, wtEnd: Date;
    if (widgetDateMode === 'week') {
      const base = widgetWeekOffset === 0 ? now : (widgetWeekOffset > 0 ? addWeeks(now, widgetWeekOffset) : subWeeks(now, Math.abs(widgetWeekOffset)));
      wtStart = startOfWeek(base, { weekStartsOn: 1 });
      wtEnd = endOfWeek(base, { weekStartsOn: 1 });
    } else if (widgetDateMode === 'month') {
      const base = widgetMonthOffset === 0 ? now : (widgetMonthOffset > 0 ? addMonths(now, widgetMonthOffset) : subMonths(now, Math.abs(widgetMonthOffset)));
      wtStart = startOfMonth(base);
      wtEnd = endOfMonth(base);
    } else if (widgetCustomRange) {
      wtStart = widgetCustomRange.from;
      wtEnd = widgetCustomRange.to;
    } else {
      wtStart = startOfWeek(now, { weekStartsOn: 1 });
      wtEnd = endOfWeek(now, { weekStartsOn: 1 });
    }

    return {
      start: wvStart < wtStart ? wvStart : wtStart,
      end: wvEnd > wtEnd ? wvEnd : wtEnd,
      widgetStart: wtStart,
      widgetEnd: wtEnd,
    };
  }, [weekViewDate, widgetDateMode, widgetWeekOffset, widgetMonthOffset, widgetCustomRange]);

  // Single data fetch for both components
  const { assignments, isLoading } = useTransportAssignments(combinedRange.start, combinedRange.end);

  return (
    <div>
      <div className="mb-6">
        <LogisticsWeekView
          assignments={assignments}
          isLoading={isLoading}
          currentDate={weekViewDate}
          onDateChange={setWeekViewDate}
        />
      </div>

      <div className="mb-6">
        <LogisticsTransportWidget
          onClick={() => setExpanded('transport')}
          assignments={assignments}
          isLoading={isLoading}
          dateMode={widgetDateMode}
          onDateModeChange={setWidgetDateMode}
          weekOffset={widgetWeekOffset}
          onWeekOffsetChange={setWidgetWeekOffset}
          monthOffset={widgetMonthOffset}
          onMonthOffsetChange={setWidgetMonthOffset}
          customRange={widgetCustomRange}
          onCustomRangeChange={setWidgetCustomRange}
        />
      </div>

      <Dialog open={expanded === 'transport'} onOpenChange={open => !open && setExpanded(null)}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[85vh] p-4 bg-card overflow-auto">
          <TransportBookingTab vehicles={[]} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LogisticsPlanning;
