import React from 'react';
import { Calendar } from '@/components/ui/calendar';
import { sv } from 'date-fns/locale';

interface DashboardMiniCalendarProps {
  currentDate: Date;
  onDateChange: (date: Date) => void;
}

const DashboardMiniCalendar: React.FC<DashboardMiniCalendarProps> = ({
  currentDate,
  onDateChange,
}) => {
  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
      <Calendar
        mode="single"
        selected={currentDate}
        onSelect={(date) => date && onDateChange(date)}
        locale={sv}
        className="p-2"
      />
    </div>
  );
};

export default DashboardMiniCalendar;
