import { Calendar, MapPin, Users, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDrop } from "react-dnd";
import { format, addDays, startOfWeek, isSameDay, addWeeks, subWeeks } from "date-fns";
import { sv } from "date-fns/locale";
import { DRAG_TYPE_STAFF } from "./AllStaffCard";
import { cn } from "@/lib/utils";
import { WeekProject } from "@/services/planningDashboardService";
import { useState } from "react";

interface WeekProjectsViewProps {
  projects: WeekProject[];
  isLoading: boolean;
  onStaffDrop: (staffId: string, bookingId: string, date: Date) => Promise<void>;
}

const getEventTypeLabel = (eventType: string): string => {
  switch (eventType) {
    case 'Rigg': return 'RIG';
    case 'Event': return 'EVENT';
    case 'Riggdown': return 'NEDMONT';
    default: return eventType.toUpperCase();
  }
};

// Uses same colors as calendar: Rig (green), Event (yellow), Rigdown (red)
const getEventTypeStyles = (eventType: string): { badge: string; bar: string; bg: string } => {
  switch (eventType) {
    case 'Rigg': 
      return { 
        badge: 'bg-[#F2FCE2] text-green-800 border border-green-300 font-bold', 
        bar: 'bg-green-400',
        bg: 'bg-[#F2FCE2]/30'
      };
    case 'Event': 
      return { 
        badge: 'bg-[#FEF7CD] text-amber-800 border border-amber-300 font-bold', 
        bar: 'bg-amber-400',
        bg: 'bg-[#FEF7CD]/30'
      };
    case 'Riggdown': 
      return { 
        badge: 'bg-[#FEE2E2] text-red-800 border border-red-300 font-bold', 
        bar: 'bg-red-400',
        bg: 'bg-[#FEE2E2]/30'
      };
    default: 
      return { 
        badge: 'bg-muted text-foreground border border-border', 
        bar: 'bg-muted',
        bg: 'bg-muted/20'
      };
  }
};

const ProjectCard = ({
  project,
  onStaffDrop
}: {
  project: WeekProject;
  onStaffDrop: (staffId: string, bookingId: string, date: Date) => Promise<void>;
}) => {
  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: DRAG_TYPE_STAFF,
    drop: (item: { id: string; name: string }) => {
      onStaffDrop(item.id, project.bookingId, project.date);
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  }), [project.bookingId, project.date, onStaffDrop]);

  const styles = getEventTypeStyles(project.eventType);

  return (
    <div
      ref={drop as any}
      className={cn(
        "group relative rounded-lg border transition-all duration-200 overflow-hidden",
        styles.bg,
        isOver && canDrop 
          ? "border-primary shadow-lg scale-[1.02] ring-2 ring-primary/20" 
          : "border-border/60 hover:border-primary/50 hover:shadow-sm",
      )}
    >
      {/* Compact content */}
      <div className="p-2.5">
        {/* Header row - compact */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className={cn(
            "px-2 py-0.5 rounded text-[10px] tracking-wide",
            styles.badge
          )}>
            {getEventTypeLabel(project.eventType)}
          </span>
          {project.bookingNumber && (
            <span className="text-xs font-mono text-muted-foreground">
              #{project.bookingNumber}
            </span>
          )}
        </div>
        
        {/* Client name - compact */}
        <h4 className="font-semibold text-sm text-foreground line-clamp-1 mb-1.5">
          {project.client}
        </h4>
        
        {/* Assigned staff section - compact */}
        <div className="flex items-center gap-1.5">
          <Users className="w-3 h-3 text-muted-foreground shrink-0" />
          <div className="flex items-center gap-1 flex-wrap">
            {project.assignedStaff.length === 0 ? (
              <span className={cn(
                "text-xs italic px-2 py-0.5 rounded border border-dashed transition-colors",
                isOver && canDrop 
                  ? "border-primary text-primary bg-primary/5" 
                  : "border-muted-foreground/30 text-muted-foreground/50"
              )}>
                Dra hit...
              </span>
            ) : (
              project.assignedStaff.map(s => (
                <span 
                  key={s.id} 
                  className="inline-flex items-center gap-1 bg-primary text-primary-foreground text-xs font-medium py-0.5 px-2 rounded"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-foreground/30" />
                  {s.name.split(' ')[0]}
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const DayColumn = ({
  date,
  projects,
  onStaffDrop
}: {
  date: Date;
  projects: WeekProject[];
  onStaffDrop: (staffId: string, bookingId: string, date: Date) => Promise<void>;
}) => {
  const isToday = isSameDay(date, new Date());
  const isPast = date < new Date() && !isToday;
  const dayProjects = projects.filter(p => isSameDay(p.date, date));
  const dayName = format(date, 'EEEE', { locale: sv });
  const dayNumber = format(date, 'd');
  const monthName = format(date, 'MMM', { locale: sv });

  return (
    <div className={cn(
      "flex flex-col min-w-[180px]",
      isPast && "opacity-50"
    )}>
      {/* Day header - distinct background */}
      <div className={cn(
        "rounded-t-xl px-3 py-2.5 text-center border-x border-t",
        isToday ? "bg-primary/15 border-primary/30" : "bg-muted border-border"
      )}>
        {/* Thin teal line for today */}
        {isToday && (
          <div className="mx-auto mb-1.5 h-0.5 w-8 rounded-full bg-primary" />
        )}

        <div className={cn(
          "text-[10px] font-bold uppercase tracking-widest",
          isToday ? "text-primary" : "text-muted-foreground"
        )}>
          {dayName}
        </div>

        <div className="flex items-baseline justify-center gap-0.5 mt-0.5">
          <span className={cn(
            "text-2xl font-bold",
            isToday ? "text-primary" : "text-foreground"
          )}>{dayNumber}</span>
          <span className="text-xs text-muted-foreground">{monthName}.</span>
        </div>
      </div>

      {/* Separator line */}
      <div className={cn(
        "h-px",
        isToday ? "bg-primary/40" : "bg-border"
      )} />
      
      {/* Projects container */}
      <div className={cn(
        "flex-1 p-2 space-y-2 min-h-[300px] border-x border-b rounded-b-xl",
        isToday ? "bg-primary/5 border-primary/30" : "bg-card border-border"
      )}>
        {dayProjects.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center py-8">
              <Calendar className="w-10 h-10 mx-auto text-muted-foreground/20 mb-2" />
              <span className="text-sm text-muted-foreground/40">
                Inga jobb
              </span>
            </div>
          </div>
        ) : (
          dayProjects.map(project => (
            <ProjectCard 
              key={`${project.bookingId}-${project.eventType}`}
              project={project}
              onStaffDrop={onStaffDrop}
            />
          ))
        )}
      </div>
    </div>
  );
};

const WeekProjectsView = ({ projects, isLoading, onStaffDrop }: WeekProjectsViewProps) => {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => 
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  
  const days = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
  const weekNumber = format(currentWeekStart, 'w');
  const monthYear = format(currentWeekStart, 'MMMM yyyy', { locale: sv });

  const goToPreviousWeek = () => setCurrentWeekStart(prev => subWeeks(prev, 1));
  const goToNextWeek = () => setCurrentWeekStart(prev => addWeeks(prev, 1));
  const goToCurrentWeek = () => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

  return (
    <div className="bg-card rounded-2xl shadow-xl border overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-primary/80 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-primary-foreground/10 rounded-lg">
              <Calendar className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-primary-foreground">
                Vecka {weekNumber}
              </h2>
              <p className="text-primary-foreground/70 text-sm capitalize">
                {monthYear}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={goToPreviousWeek}
              className="text-primary-foreground hover:bg-primary-foreground/10"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={goToCurrentWeek}
              className="text-primary-foreground hover:bg-primary-foreground/10 text-xs font-medium"
            >
              Idag
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={goToNextWeek}
              className="text-primary-foreground hover:bg-primary-foreground/10"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
      
      {/* Week grid */}
      <div className="p-4 overflow-x-auto">
        <div className="grid grid-cols-7 gap-3 min-w-[1200px]">
          {days.map(day => (
            <DayColumn 
              key={day.toISOString()}
              date={day}
              projects={projects}
              onStaffDrop={onStaffDrop}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default WeekProjectsView;
