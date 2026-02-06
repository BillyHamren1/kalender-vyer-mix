import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  addDays, 
  isSameDay, 
  isSameMonth 
} from "date-fns";
import { sv } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { DashboardEvent } from "@/hooks/useDashboardEvents";
import DashboardEventCard, { getEventCategoryColor } from "./DashboardEventCard";

interface DashboardMonthViewProps {
  events: DashboardEvent[];
  currentDate: Date;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onDayClick: (date: Date) => void;
  isLoading: boolean;
}

const DashboardMonthView = ({ 
  events, 
  currentDate,
  onPreviousMonth,
  onNextMonth,
  onDayClick,
  isLoading 
}: DashboardMonthViewProps) => {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const monthLabel = format(currentDate, 'MMMM yyyy', { locale: sv });

  // Generate all days for the calendar grid
  const days: Date[] = [];
  let day = calendarStart;
  while (day <= calendarEnd) {
    days.push(day);
    day = addDays(day, 1);
  }

  // Group events by date for quick lookup
  const eventsByDate = new Map<string, DashboardEvent[]>();
  events.forEach(e => {
    const key = format(e.date, 'yyyy-MM-dd');
    if (!eventsByDate.has(key)) eventsByDate.set(key, []);
    eventsByDate.get(key)!.push(e);
  });

  const weekDayNames = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

  return (
    <div className="bg-card rounded-2xl shadow-xl border overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-primary/80 px-6 py-4">
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={onPreviousMonth}
              className="text-primary-foreground hover:bg-primary-foreground/10 border border-primary-foreground/30 rounded-lg"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <span className="text-primary-foreground font-medium min-w-[160px] text-center capitalize">
              {monthLabel}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={onNextMonth}
              className="text-primary-foreground hover:bg-primary-foreground/10 border border-primary-foreground/30 rounded-lg"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
      
      {/* Calendar grid */}
      <div className="p-3">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {weekDayNames.map(name => (
            <div key={name} className="text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground py-2">
              {name}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-1">
          {days.map(d => {
            const isToday = isSameDay(d, new Date());
            const isCurrentMonth = isSameMonth(d, currentDate);
            const dateKey = format(d, 'yyyy-MM-dd');
            const dayEvents = eventsByDate.get(dateKey) || [];
            const maxVisible = 3;
            const overflow = dayEvents.length - maxVisible;

            return (
              <div
                key={dateKey}
                onClick={() => onDayClick(d)}
                className={cn(
                  "min-h-[100px] rounded-lg border p-1.5 cursor-pointer transition-all hover:shadow-sm",
                  isCurrentMonth ? "bg-card border-border" : "bg-muted/30 border-border/30",
                  isToday && "ring-2 ring-primary/40 border-primary/30 bg-primary/5",
                  !isCurrentMonth && "opacity-50"
                )}
              >
                {/* Day number */}
                <div className={cn(
                  "text-xs font-bold mb-1",
                  isToday ? "text-primary" : isCurrentMonth ? "text-foreground" : "text-muted-foreground"
                )}>
                  {format(d, 'd')}
                </div>

                {/* Event dots/labels */}
                <div className="space-y-0.5">
                  {dayEvents.slice(0, maxVisible).map(event => (
                    <DashboardEventCard
                      key={`${event.id}-${event.eventType}`}
                      event={event}
                      compact
                    />
                  ))}
                  {overflow > 0 && (
                    <div className="text-[10px] text-muted-foreground font-medium pl-2">
                      +{overflow} till
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default DashboardMonthView;
