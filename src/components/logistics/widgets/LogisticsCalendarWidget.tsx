import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar as CalendarIcon, Maximize2 } from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';
import { useTransportAssignments } from '@/hooks/useTransportAssignments';
import { cn } from '@/lib/utils';

interface Props {
  onClick: () => void;
}

const LogisticsCalendarWidget: React.FC<Props> = ({ onClick }) => {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const { assignments } = useTransportAssignments(monthStart, monthEnd);

  // Collect dates that have transport assignments
  const transportDates = assignments.map(a => new Date(a.transport_date));

  const todayCount = assignments.filter(
    a => a.transport_date === format(new Date(), 'yyyy-MM-dd')
  ).length;

  return (
    <Card
      className="group cursor-pointer border-border/40 shadow-2xl rounded-2xl overflow-hidden hover:shadow-3xl transition-all duration-300 hover:scale-[1.02]"
    >
      <CardContent className="p-0">
        {/* Header */}
        <div
          className="bg-gradient-to-r from-primary to-primary/80 px-4 py-3 flex items-center justify-between cursor-pointer"
          onClick={onClick}
        >
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-primary-foreground" />
            <span className="text-sm font-medium text-primary-foreground">
              Vecka {format(new Date(), 'w', { locale: sv })}
            </span>
            <span className="text-xs text-primary-foreground/70 ml-2">
              {todayCount} transport{todayCount !== 1 ? 'er' : ''} idag
            </span>
          </div>
          <Maximize2 className="w-3.5 h-3.5 text-primary-foreground/60 group-hover:text-primary-foreground transition-colors" />
        </div>

        {/* Calendar */}
        <div className="p-2">
          <Calendar
            mode="single"
            selected={currentDate}
            onSelect={(date) => date && setCurrentDate(date)}
            locale={sv}
            className="p-0"
            modifiers={{
              transport: transportDates,
            }}
            modifiersClassNames={{
              transport: 'bg-primary/20 text-primary font-bold rounded-md',
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default LogisticsCalendarWidget;
