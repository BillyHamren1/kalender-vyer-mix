import { Calendar } from "lucide-react";
import { format, addDays, isSameDay } from "date-fns";
import { sv } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { DashboardEvent, EventCategory, DashboardViewMode } from "@/hooks/useDashboardEvents";
import DashboardEventCard from "./DashboardEventCard";
import { useNavigate } from "react-router-dom";
import CalendarHeader from "./CalendarHeader";

interface DashboardWeekViewProps {
  events: DashboardEvent[];
  weekStart: Date;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  isLoading: boolean;
  viewMode: DashboardViewMode;
  onViewModeChange: (mode: DashboardViewMode) => void;
  activeCategories: EventCategory[];
  onCategoriesChange: (cats: EventCategory[]) => void;
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
      "flex flex-col flex-1 min-w-0",
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
  isLoading,
  viewMode,
  onViewModeChange,
  activeCategories,
  onCategoriesChange,
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
      <CalendarHeader
        title={`Vecka ${weekNumber}`}
        onPrevious={onPreviousWeek}
        onNext={onNextWeek}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        activeCategories={activeCategories}
        onCategoriesChange={onCategoriesChange}
      />
      
      {/* Week grid */}
      <div className="p-3">
        <div className="flex gap-2 items-stretch">
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
