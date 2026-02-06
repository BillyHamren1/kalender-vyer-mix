import { ChevronLeft, ChevronRight, Clock, MapPin, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, isSameDay } from "date-fns";
import { sv } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { DashboardEvent } from "@/hooks/useDashboardEvents";
import DashboardEventCard, { getEventCategoryColor, getCategoryIcon } from "./DashboardEventCard";

interface DashboardDayViewProps {
  events: DashboardEvent[];
  currentDate: Date;
  onPreviousDay: () => void;
  onNextDay: () => void;
  isLoading: boolean;
}

const DashboardDayView = ({ 
  events, 
  currentDate,
  onPreviousDay,
  onNextDay,
  isLoading 
}: DashboardDayViewProps) => {
  const isToday = isSameDay(currentDate, new Date());
  const dayEvents = events.filter(e => isSameDay(e.date, currentDate));
  const dayName = format(currentDate, 'EEEE d MMMM', { locale: sv });

  // Group by category
  const planningEvents = dayEvents.filter(e => e.category === 'planning');
  const warehouseEvents = dayEvents.filter(e => e.category === 'warehouse');
  const logisticsEvents = dayEvents.filter(e => e.category === 'logistics');

  const sections = [
    { category: 'planning' as const, label: 'Personal & Projekt', events: planningEvents },
    { category: 'warehouse' as const, label: 'Lager', events: warehouseEvents },
    { category: 'logistics' as const, label: 'Logistik', events: logisticsEvents },
  ].filter(s => s.events.length > 0);

  return (
    <div className="bg-card rounded-2xl shadow-xl border overflow-hidden">
      {/* Header */}
      <div className={cn(
        "px-6 py-4 bg-gradient-to-r",
        isToday ? "from-primary to-primary/80" : "from-muted to-muted/80"
      )}>
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={onPreviousDay}
              className={cn(
                "border rounded-lg",
                isToday 
                  ? "text-primary-foreground hover:bg-primary-foreground/10 border-primary-foreground/30" 
                  : "text-foreground hover:bg-accent border-border"
              )}
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="text-center min-w-[200px]">
              <span className={cn(
                "font-medium capitalize",
                isToday ? "text-primary-foreground" : "text-foreground"
              )}>
                {dayName}
              </span>
              {isToday && (
                <span className="ml-2 text-xs bg-primary-foreground/20 text-primary-foreground px-2 py-0.5 rounded-full">
                  Idag
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onNextDay}
              className={cn(
                "border rounded-lg",
                isToday 
                  ? "text-primary-foreground hover:bg-primary-foreground/10 border-primary-foreground/30" 
                  : "text-foreground hover:bg-accent border-border"
              )}
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
      
      {/* Day content */}
      <div className="p-6">
        {dayEvents.length === 0 ? (
          <div className="text-center py-16">
            <Clock className="w-12 h-12 mx-auto text-muted-foreground/20 mb-3" />
            <p className="text-muted-foreground">Inga händelser denna dag</p>
          </div>
        ) : (
          <div className="space-y-6">
            {sections.map(section => {
              const color = getEventCategoryColor(section.category);
              const Icon = getCategoryIcon(section.category);
              return (
                <div key={section.category}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className={cn("p-1.5 rounded-md", color.bg)}>
                      <Icon className={cn("w-4 h-4", color.text)} />
                    </div>
                    <h3 className="text-sm font-semibold text-foreground">{section.label}</h3>
                    <span className="text-xs text-muted-foreground ml-auto">{section.events.length} st</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {section.events.map(event => (
                      <DashboardEventCard key={`${event.id}-${event.eventType}`} event={event} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardDayView;
