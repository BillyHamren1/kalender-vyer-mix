import React, { useState, useMemo } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Truck, MapPin, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, addDays, isSameDay, startOfWeek, endOfWeek } from 'date-fns';
import { sv } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useTransportAssignments, TransportAssignment } from '@/hooks/useTransportAssignments';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

const TransportEventCard = ({ assignment }: { assignment: TransportAssignment }) => {
  const navigate = useNavigate();

  const statusLabel = assignment.status === 'delivered' ? 'Levererad' :
    assignment.status === 'in_transit' ? 'På väg' :
    assignment.status === 'skipped' ? 'Hoppad' :
    assignment.partner_response === 'accepted' ? 'Accepterad' :
    assignment.partner_response === 'declined' ? 'Nekad' : 'Väntar';

  const statusDot = assignment.status === 'delivered' ? 'bg-primary' :
    assignment.status === 'in_transit' ? 'bg-secondary animate-pulse' :
    assignment.partner_response === 'accepted' ? 'bg-primary' :
    assignment.partner_response === 'declined' ? 'bg-destructive' :
    'bg-muted-foreground';

  return (
    <div
      onClick={() => {
        if (assignment.booking_id) navigate(`/booking/${assignment.booking_id}`);
      }}
      className={cn(
        "group relative rounded-lg border transition-all duration-200 overflow-hidden cursor-pointer",
        "bg-secondary/10 border-secondary/30",
        "hover:shadow-sm hover:scale-[1.01]"
      )}
    >
      <div className="p-2.5">
        {/* Header row */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="px-2 py-0.5 rounded text-[10px] tracking-wide font-bold border bg-secondary/20 text-secondary border-secondary/40">
            TRANSPORT
          </span>
          <Truck className="w-3 h-3 ml-auto text-secondary" />
        </div>
        
        {/* Client name */}
        <h4 className="font-semibold text-sm text-foreground line-clamp-2 mb-1">
          {assignment.booking?.client || 'Okänd kund'}
        </h4>

        {/* Address */}
        {assignment.booking?.deliveryaddress && (
          <div className="flex items-start gap-1.5 mb-1">
            <MapPin className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
            <span className="text-xs text-muted-foreground line-clamp-1">
              {assignment.booking.deliveryaddress}
            </span>
          </div>
        )}

        {/* Status */}
        <div className="flex items-center gap-1.5 mt-1">
          <div className={cn("w-2 h-2 rounded-full", statusDot)} />
          <span className="text-xs text-muted-foreground">{statusLabel}</span>
        </div>
      </div>
    </div>
  );
};

const DayColumn = ({
  date,
  assignments,
}: {
  date: Date;
  assignments: TransportAssignment[];
}) => {
  const isToday = isSameDay(date, new Date());
  const isPast = date < new Date() && !isToday;
  const dayStr = format(date, 'yyyy-MM-dd');
  const dayEvents = assignments.filter(a => a.transport_date === dayStr);
  const dayName = format(date, 'EEEE', { locale: sv });
  const dayNumber = format(date, 'd');
  const monthName = format(date, 'MMM', { locale: sv });

  return (
    <div className={cn(
      "flex flex-col flex-1 min-w-[160px]",
      isPast && "opacity-50"
    )}>
      {/* Day header */}
      <div className={cn(
        "relative rounded-t-xl px-3 py-2.5 text-center border-x border-t transition-all",
        isToday ? "bg-primary/15 border-primary/30" : "bg-muted border-border"
      )}>
        {isToday && (
          <div className="pointer-events-none absolute left-1/2 top-2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-primary" />
        )}

        <div className={cn(
          "text-[10px] font-bold uppercase tracking-widest",
          isToday ? "text-primary" : "text-muted-foreground"
        )}>
          {dayName}
        </div>

        <div className="flex items-baseline justify-center gap-0.5 mt-0.5">
          <span className={cn(
            "text-2xl font-bold tabular-nums",
            isToday ? "text-primary" : "text-foreground"
          )}>{dayNumber}</span>
          <span className="text-xs text-muted-foreground">{monthName}.</span>
        </div>
      </div>

      <div className={cn("h-px", isToday ? "bg-primary/40" : "bg-border")} />
      
      {/* Events container */}
      <div className={cn(
        "flex-1 p-2 space-y-2 min-h-[280px] border-x border-b rounded-b-xl",
        isToday ? "bg-primary/5 border-primary/30" : "bg-card border-border"
      )}>
        {dayEvents.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center py-8">
              <Calendar className="w-10 h-10 mx-auto text-muted-foreground/20 mb-2" />
              <span className="text-sm text-muted-foreground/40">Inga händelser</span>
            </div>
          </div>
        ) : (
          dayEvents.map(assignment => (
            <TransportEventCard key={assignment.id} assignment={assignment} />
          ))
        )}
      </div>
    </div>
  );
};

const LogisticsWeekView: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekNumber = format(weekStart, 'w');

  const { assignments, isLoading } = useTransportAssignments(weekStart, weekEnd);

  const navigateWeek = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => addDays(prev, direction === 'prev' ? -7 : 7));
  };

  return (
    <div className="bg-card rounded-2xl shadow-xl border overflow-hidden">
      {/* Header — teal gradient identical to DashboardWeekView */}
      <div className="bg-gradient-to-r from-primary to-primary/80 px-6 py-4">
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigateWeek('prev')}
              className="text-primary-foreground hover:bg-primary-foreground/10 border border-primary-foreground/30 rounded-lg"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <span className="text-primary-foreground font-medium min-w-[80px] text-center">
              Vecka {weekNumber}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigateWeek('next')}
              className="text-primary-foreground hover:bg-primary-foreground/10 border border-primary-foreground/30 rounded-lg"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
      
      {/* Week grid */}
      <div className="p-3 overflow-x-auto">
        {isLoading ? (
          <div className="flex gap-2 min-w-[1120px]">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex-1 min-w-[160px] space-y-2">
                <Skeleton className="h-16 rounded-t-xl" />
                <Skeleton className="h-[280px] rounded-b-xl" />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex gap-2 min-w-[1120px] items-stretch">
            {days.map(day => (
              <DayColumn 
                key={day.toISOString()}
                date={day}
                assignments={assignments}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LogisticsWeekView;
