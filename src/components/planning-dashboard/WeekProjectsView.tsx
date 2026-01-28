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

const getEventTypeStyles = (eventType: string): { badge: string; bar: string } => {
  switch (eventType) {
    case 'Rigg': 
      return { 
        badge: 'bg-primary/10 text-primary border border-primary font-bold', 
        bar: 'bg-primary' 
      };
    case 'Event': 
      return { 
        badge: 'bg-primary/10 text-primary border border-primary font-bold', 
        bar: 'bg-primary' 
      };
    case 'Riggdown': 
      return { 
        badge: 'bg-primary/10 text-primary border border-primary font-bold', 
        bar: 'bg-primary' 
      };
    default: 
      return { 
        badge: 'bg-muted text-foreground border border-border', 
        bar: 'bg-muted' 
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
        "group relative bg-card rounded-xl border transition-all duration-200 overflow-hidden",
        isOver && canDrop 
          ? "border-primary shadow-lg scale-[1.02] ring-2 ring-primary/20" 
          : "border-border hover:border-primary/50 hover:shadow-md",
      )}
    >
      {/* Color bar top */}
      <div className={cn("h-1 w-full", styles.bar)} />
      
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <span className={cn(
            "px-2.5 py-1 rounded text-xs tracking-wide",
            styles.badge
          )}>
            {getEventTypeLabel(project.eventType)}
          </span>
          {project.bookingNumber && (
            <span className="text-sm font-mono text-muted-foreground">
              #{project.bookingNumber}
            </span>
          )}
        </div>
        
        {/* Client name */}
        <h4 className="font-semibold text-base text-foreground mb-2 line-clamp-1">
          {project.client}
        </h4>
        
        {/* Address */}
        {project.deliveryAddress && (
          <div className="flex items-start gap-2 text-sm text-muted-foreground mb-3">
            <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="line-clamp-2">{project.deliveryAddress}</span>
          </div>
        )}
        
        {/* Assigned staff section */}
        <div className="pt-3 border-t border-border/50">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Personal
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap min-h-[28px]">
            {project.assignedStaff.length === 0 ? (
              <span className={cn(
                "text-sm italic px-3 py-1.5 rounded-lg border-2 border-dashed transition-colors",
                isOver && canDrop 
                  ? "border-primary text-primary bg-primary/5" 
                  : "border-muted-foreground/30 text-muted-foreground/60"
              )}>
                Dra personal hit...
              </span>
            ) : (
              project.assignedStaff.map(s => (
                <span 
                  key={s.id} 
                  className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground text-sm font-medium py-1 px-2.5 rounded-md"
                >
                  <span className="w-2 h-2 rounded-full bg-primary-foreground/30" />
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
      {/* Day header */}
      <div className={cn(
        "rounded-t-xl px-4 py-3 text-center border border-b-0 bg-card",
        isToday ? "border-primary/40" : "border-border/50"
      )}>
        <div className={cn(
          "mx-auto mb-2 h-1 w-12 rounded-full",
          isToday ? "bg-primary" : "bg-muted"
        )} />

        <div className={cn(
          "text-xs font-semibold uppercase tracking-wider",
          isToday ? "text-primary" : "text-muted-foreground"
        )}>
          {dayName}
        </div>

        <div className="flex items-baseline justify-center gap-1 mt-0.5">
          <span className={cn(
            "text-3xl font-bold",
            isToday ? "text-primary" : "text-foreground"
          )}>{dayNumber}</span>
          <span className="text-sm text-muted-foreground">{monthName}.</span>
        </div>

        {isToday && (
          <div className="mt-1.5">
            <span className="text-[10px] font-bold bg-primary/10 text-primary px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              Idag
            </span>
          </div>
        )}
      </div>
      
      {/* Projects container */}
      <div className={cn(
        "flex-1 p-3 space-y-3 min-h-[350px] border border-t-0 rounded-b-xl",
        isToday ? "bg-card border-primary/40" : "bg-muted/10 border-border/50"
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
