import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, addDays, isSameDay } from "date-fns";
import { sv } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { DashboardEvent } from "@/hooks/useDashboardEvents";
import DashboardEventCard from "./DashboardEventCard";
import { useNavigate } from "react-router-dom";

interface DashboardWeekViewProps {
  events: DashboardEvent[];
  weekStart: Date;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  isLoading: boolean;
}

const DayColumn = ({
  date,
  events,
  onDayClick,
}: {
  date: Date;
  events: DashboardEvent[];
  onDayClick: (date: Date) => void;
}) => {
  const isToday = isSameDay(date, new Date());
  const isPast = date < new Date() && !isToday;
  const dayEvents = events.filter(e => isSameDay(e.date, date));
  const dayName = format(date, 'EEEE', { locale: sv });
  const dayNumber = format(date, 'd');
  const monthName = format(date, 'MMM', { locale: sv });

  return (
    <div className={cn(
      "flex flex-col flex-1 min-w-[100px]",
      isPast && "opacity-50"
    )}>
      {/* Day header */}
      <div 
        onClick={() => onDayClick(date)}
        className={cn(
          "relative rounded-t-xl px-3 py-2.5 text-center border-x border-t cursor-pointer transition-all hover:opacity-80",
          isToday ? "bg-primary/15 border-primary/30" : "bg-muted border-border hover:bg-muted/80"
        )}
      >
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
          dayEvents.map(event => (
            <DashboardEventCard 
              key={`${event.id}-${event.eventType}`}
              event={event}
            />
          ))
        )}
      </div>
    </div>
  );
};

const DashboardWeekView = ({ 
  events, 
  weekStart,
  onPreviousWeek,
  onNextWeek,
  isLoading 
}: DashboardWeekViewProps) => {
  const navigate = useNavigate();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekNumber = format(weekStart, 'w');

  const handleDayClick = (date: Date) => {
    const dateParam = format(date, 'yyyy-MM-dd');
    navigate(`/calendar?date=${dateParam}&view=day`);
  };

  return (
    <div className="bg-card rounded-2xl shadow-xl border overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-primary/80 px-6 py-4">
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={onPreviousWeek}
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
              onClick={onNextWeek}
              className="text-primary-foreground hover:bg-primary-foreground/10 border border-primary-foreground/30 rounded-lg"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
      
      {/* Week grid */}
      <div className="p-3 overflow-x-auto">
        <div className="flex gap-2 min-w-[700px] items-stretch">
          {days.map(day => (
            <DayColumn 
              key={day.toISOString()}
              date={day}
              events={events}
              onDayClick={handleDayClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default DashboardWeekView;
