
import React, { useState } from 'react';
import { startOfWeek, startOfMonth } from 'date-fns';
import MobileWarehouseWeekSelector from './MobileWarehouseWeekSelector';
import MobileWarehouseEventsList from './MobileWarehouseEventsList';
import { CalendarEvent } from '@/components/Calendar/ResourceData';

interface MobileWarehouseCalendarViewProps {
  events: CalendarEvent[];
}

const MobileWarehouseCalendarView: React.FC<MobileWarehouseCalendarViewProps> = ({ events }) => {
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedWeekStart, setSelectedWeekStart] = useState(() => 
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );

  const handleMonthChange = (newMonth: Date) => {
    setCurrentMonth(startOfMonth(newMonth));
    // When changing month, select the first week of the new month
    setSelectedWeekStart(startOfWeek(startOfMonth(newMonth), { weekStartsOn: 1 }));
  };

  const handleWeekSelect = (weekStart: Date) => {
    setSelectedWeekStart(weekStart);
  };

  return (
    <div className="min-h-screen bg-muted/30 p-4 space-y-4">
      {/* Week Selector with Month Navigation */}
      <MobileWarehouseWeekSelector
        currentMonth={currentMonth}
        selectedWeekStart={selectedWeekStart}
        onMonthChange={handleMonthChange}
        onWeekSelect={handleWeekSelect}
      />

      {/* Events List for Selected Week */}
      <MobileWarehouseEventsList
        events={events}
        weekStart={selectedWeekStart}
      />
    </div>
  );
};

export default MobileWarehouseCalendarView;
