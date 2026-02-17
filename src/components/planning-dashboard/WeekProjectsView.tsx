import { Calendar, MapPin, Users, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDrop } from "react-dnd";
import { format, addDays, isSameDay } from "date-fns";
import { sv } from "date-fns/locale";
import { DRAG_TYPE_STAFF } from "./AllStaffCard";
import { cn } from "@/lib/utils";
import { WeekProject } from "@/services/planningDashboardService";
import { useNavigate } from "react-router-dom";

interface WeekProjectsViewProps {
  projects: WeekProject[];
  weekStart: Date;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onCurrentWeek: () => void;
  isLoading: boolean;
  onStaffDrop: (staffId: string, bookingId: string, date: Date) => Promise<void>;
}

type PlanningEventTypeKey = 'rig' | 'event' | 'rigdown' | 'other';

const normalizePlanningEventType = (eventType: string): PlanningEventTypeKey => {
  const t = (eventType ?? '').trim().toLowerCase();

  // Accept multiple sources/labels (e.g. "Rigg", "RIG", "Montering")
  if (t === 'rigg' || t === 'rig' || t.includes('monter')) return 'rig';
  if (t === 'event') return 'event';
  if (t === 'riggdown' || t === 'rigdown' || t.includes('nedmont') || t.includes('demonter')) return 'rigdown';

  return 'other';
};

const getEventTypeLabel = (eventType: string): string => {
  const key = normalizePlanningEventType(eventType);
  switch (key) {
    case 'rig':
      return 'RIG';
    case 'event':
      return 'EVENT';
    case 'rigdown':
      return 'RIGDOWN';
    default:
      return (eventType ?? '').toUpperCase();
  }
};

const getEventTypeStyles = (
  eventType: string
): { badgeClass: string; cardBgClass: string; cardBorderClass: string } => {
  const key = normalizePlanningEventType(eventType);

  switch (key) {
    case 'rig':
      return {
        badgeClass: 'bg-planning-rig text-planning-rig-foreground border border-planning-rig-border font-bold',
        cardBgClass: 'bg-planning-rig/35',
        cardBorderClass: 'border-planning-rig-border/60'
      };
    case 'event':
      return {
        badgeClass: 'bg-planning-event text-planning-event-foreground border border-planning-event-border font-bold',
        cardBgClass: 'bg-planning-event/35',
        cardBorderClass: 'border-planning-event-border/60'
      };
    case 'rigdown':
      return {
        badgeClass: 'bg-planning-rigdown text-planning-rigdown-foreground border border-planning-rigdown-border font-bold',
        cardBgClass: 'bg-planning-rigdown/35',
        cardBorderClass: 'border-planning-rigdown-border/60'
      };
    default:
      return {
        badgeClass: 'bg-muted text-foreground border border-border',
        cardBgClass: 'bg-muted/20',
        cardBorderClass: 'border-border/60'
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
  const navigate = useNavigate();
  
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

  const handleClick = () => {
    navigate(`/booking/${project.bookingId}`);
  };

  return (
    <div
      ref={drop as any}
      onClick={handleClick}
      className={cn(
        "group relative rounded border transition-all duration-200 overflow-hidden cursor-pointer",
        styles.cardBgClass,
        styles.cardBorderClass,
        isOver && canDrop 
          ? "border-primary shadow-md scale-[1.01] ring-1 ring-primary/20" 
          : "hover:border-primary/50 hover:shadow-sm",
      )}
    >
      <div className="px-2 py-1.5">
        {/* Header row */}
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className={cn(
            "px-1.5 py-px rounded text-[9px] tracking-wide shrink-0",
            styles.badgeClass
          )}>
            {getEventTypeLabel(project.eventType)}
          </span>
          {project.bookingNumber && (
            <span className="text-[10px] font-mono text-muted-foreground truncate">
              #{project.bookingNumber}
            </span>
          )}
        </div>
        
        {/* Client name - single line */}
        <h4 className="font-semibold text-xs text-foreground truncate mb-0.5">
          {project.client}
        </h4>
        
        {/* Assigned staff */}
        <div className="flex items-center gap-1">
          <Users className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
          {project.assignedStaff.length === 0 ? (
            <span className={cn(
              "text-[10px] italic transition-colors",
              isOver && canDrop ? "text-primary" : "text-muted-foreground/50"
            )}>
              {isOver && canDrop ? "Släpp här" : "Ingen tilldelad"}
            </span>
          ) : (
            <span className="text-[10px] text-foreground leading-tight truncate">
              {project.assignedStaff.map(s => s.name.split(' ')[0]).join(', ')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

const DayColumn = ({
  date,
  projects,
  onStaffDrop,
  onDayClick
}: {
  date: Date;
  projects: WeekProject[];
  onStaffDrop: (staffId: string, bookingId: string, date: Date) => Promise<void>;
  onDayClick: (date: Date) => void;
}) => {
  const isToday = isSameDay(date, new Date());
  const isPast = date < new Date() && !isToday;
  const dayProjects = projects.filter(p => isSameDay(p.date, date));
  const dayName = format(date, 'EEEE', { locale: sv });
  const dayNumber = format(date, 'd');
  const monthName = format(date, 'MMM', { locale: sv });

  return (
    <div className={cn(
      "flex flex-col flex-1 min-w-[160px]",
      isPast && "opacity-50"
    )}>
      {/* Day header - clickable */}
      <div 
        onClick={() => onDayClick(date)}
        className={cn(
          "relative rounded-t-xl px-3 py-2.5 text-center border-x border-t cursor-pointer transition-all hover:opacity-80",
          isToday ? "bg-primary/15 border-primary/30" : "bg-muted border-border hover:bg-muted/80"
        )}
      >
        {/* Thin line for today (absolute so layout doesn't shift) */}
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

      {/* Separator line */}
      <div className={cn(
        "h-px",
        isToday ? "bg-primary/40" : "bg-border"
      )} />
      
      {/* Projects container */}
      <div className={cn(
        "flex-1 p-2 space-y-2 min-h-[280px] border-x border-b rounded-b-xl",
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

const WeekProjectsView = ({ 
  projects, 
  weekStart,
  onPreviousWeek,
  onNextWeek,
  onCurrentWeek,
  isLoading, 
  onStaffDrop 
}: WeekProjectsViewProps) => {
  const navigate = useNavigate();
  
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekNumber = format(weekStart, 'w');
  const monthYear = format(weekStart, 'MMMM yyyy', { locale: sv });

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
        <div className="flex gap-2 min-w-[1120px] items-stretch">
          {days.map(day => (
            <DayColumn 
              key={day.toISOString()}
              date={day}
              projects={projects}
              onStaffDrop={onStaffDrop}
              onDayClick={handleDayClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default WeekProjectsView;
