import { Clock, MapPin, Users } from "lucide-react";
import { format, isSameDay } from "date-fns";
import { sv } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { DashboardEvent, EventCategory, DashboardViewMode } from "@/hooks/useDashboardEvents";
import DashboardEventCard, { getEventCategoryColor, getCategoryIcon } from "./DashboardEventCard";
import CalendarHeader from "./CalendarHeader";

interface DashboardDayViewProps {
  events: DashboardEvent[];
  currentDate: Date;
  onPreviousDay: () => void;
  onNextDay: () => void;
  isLoading: boolean;
  viewMode: DashboardViewMode;
  onViewModeChange: (mode: DashboardViewMode) => void;
  activeCategories: EventCategory[];
  onCategoriesChange: (cats: EventCategory[]) => void;
}


const DashboardDayView = ({ 
  events, 
  currentDate,
  onPreviousDay,
  onNextDay,
  isLoading,
  viewMode,
  onViewModeChange,
  activeCategories,
  onCategoriesChange,
}: DashboardDayViewProps) => {
  const isToday = isSameDay(currentDate, new Date());
  const dayEvents = events.filter(e => isSameDay(e.date, currentDate));
  const dayName = format(currentDate, 'EEEE d MMMM', { locale: sv });
  const titleText = isToday ? `${dayName} — Idag` : dayName;

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
      <CalendarHeader
        title={titleText}
        onPrevious={onPreviousDay}
        onNext={onNextDay}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        activeCategories={activeCategories}
        onCategoriesChange={onCategoriesChange}
      />
      
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
