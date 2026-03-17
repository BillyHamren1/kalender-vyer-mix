
import React, { useState } from 'react';
import { startOfWeek, startOfMonth } from 'date-fns';
import MobileWeekSelector from './MobileWeekSelector';
import MobileEventsList from './MobileEventsList';
import { CalendarEvent } from '@/components/Calendar/ResourceData';

interface MobileCalendarViewProps {
  events: CalendarEvent[];
  currentMonth?: Date;
  selectedWeekStart?: Date;
  onMonthChange?: (date: Date) => void;
  onWeekSelect?: (weekStart: Date) => void;
}

const MobileCalendarView: React.FC<MobileCalendarViewProps> = ({
  events,
  currentMonth: externalMonth,
  selectedWeekStart: externalWeekStart,
  onMonthChange: externalMonthChange,
  onWeekSelect: externalWeekSelect,
}) => {
  const [internalMonth, setInternalMonth] = useState(() => startOfMonth(new Date()));
  const [internalWeekStart, setInternalWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );

  const currentMonth = externalMonth ?? internalMonth;
  const selectedWeekStart = externalWeekStart ?? internalWeekStart;

  const handleMonthChange = (newMonth: Date) => {
    if (externalMonthChange) {
      externalMonthChange(newMonth);
    } else {
      setInternalMonth(startOfMonth(newMonth));
      setInternalWeekStart(startOfWeek(startOfMonth(newMonth), { weekStartsOn: 1 }));
    }
  };

  const handleWeekSelect = (weekStart: Date) => {
    if (externalWeekSelect) {
      externalWeekSelect(weekStart);
    } else {
      setInternalWeekStart(weekStart);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 p-4 space-y-4">
      {/* Events List */}
      <MobileEventsList
        events={events}
        weekStart={selectedWeekStart}
      />

      {/* Week Selector at bottom */}
      <MobileWeekSelector
        currentMonth={currentMonth}
        selectedWeekStart={selectedWeekStart}
        onMonthChange={handleMonthChange}
        onWeekSelect={handleWeekSelect}
      />
    </div>
  );
};

export default MobileCalendarView;
