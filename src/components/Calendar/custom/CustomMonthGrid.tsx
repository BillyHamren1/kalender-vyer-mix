import React, { useMemo } from 'react';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, format, isSameDay } from 'date-fns';
import { StaffCalendarEvent, StaffResource } from '@/services/staffCalendarService';
import { useEventNavigation } from '@/hooks/useEventNavigation';
import MonthCell from './MonthCell';

interface CustomMonthGridProps {
  events: StaffCalendarEvent[];
  staffResources: StaffResource[];
  currentDate: Date;
  viewMode: 'day' | 'week' | 'month';
  onDateChange: (date: Date) => void;
  isLoading?: boolean;
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const CustomMonthGrid: React.FC<CustomMonthGridProps> = ({
  events,
  currentDate,
  isLoading = false,
}) => {
  const { handleEventClick } = useEventNavigation();

  // Build weeks grid
  const weeks = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const result: Date[][] = [];
    let day = calStart;
    let week: Date[] = [];

    while (day <= calEnd) {
      week.push(new Date(day));
      if (week.length === 7) {
        result.push(week);
        week = [];
      }
      day = addDays(day, 1);
    }
    if (week.length > 0) result.push(week);
    return result;
  }, [currentDate]);

  // Filter to booking events and format for display
  const formattedEvents = useMemo(() => {
    return events
      .filter(ev => ev.eventType === 'booking_event')
      .map(ev => ({
        id: ev.id,
        title: ev.title,
        start: new Date(ev.start),
        backgroundColor: ev.backgroundColor,
        borderColor: ev.borderColor,
        extendedProps: {
          bookingId: ev.bookingId,
          booking_id: ev.bookingId,
          eventType: ev.extendedProps?.eventType,
          staffName: ev.staffName,
          client: ev.client,
        },
      }));
  }, [events]);

  // Group events by date string
  const eventsByDate = useMemo(() => {
    const map = new Map<string, typeof formattedEvents>();
    for (const ev of formattedEvents) {
      const key = format(ev.start, 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return map;
  }, [formattedEvents]);

  const handleCellEventClick = (ev: any) => {
    if (ev.extendedProps?.bookingId) {
      handleEventClick({
        event: {
          id: ev.id,
          title: ev.title,
          start: ev.start,
          end: ev.start,
          extendedProps: ev.extendedProps,
        },
      });
    }
  };

  return (
    <div className="relative bg-background rounded-lg border border-border overflow-hidden">
      {isLoading && (
        <div className="absolute inset-0 bg-background/90 flex items-center justify-center z-20 backdrop-blur-sm">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Loading staff schedules...</p>
          </div>
        </div>
      )}

      {/* Weekday header */}
      <div className="grid grid-cols-7 bg-muted/50 border-b border-border">
        {WEEKDAY_LABELS.map(label => (
          <div
            key={label}
            className="text-center py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Weeks */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7">
          {week.map(day => {
            const key = format(day, 'yyyy-MM-dd');
            const dayEvents = eventsByDate.get(key) || [];
            return (
              <MonthCell
                key={key}
                date={day}
                currentMonth={currentDate}
                events={dayEvents}
                onEventClick={handleCellEventClick}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default CustomMonthGrid;
