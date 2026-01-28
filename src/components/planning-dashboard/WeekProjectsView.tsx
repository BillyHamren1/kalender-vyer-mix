import { Calendar, MapPin, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDrop } from "react-dnd";
import { format, addDays, startOfWeek, isSameDay } from "date-fns";
import { sv } from "date-fns/locale";
import { DRAG_TYPE_STAFF } from "./AllStaffCard";
import { cn } from "@/lib/utils";
import { WeekProject } from "@/services/planningDashboardService";

interface WeekProjectsViewProps {
  projects: WeekProject[];
  isLoading: boolean;
  onStaffDrop: (staffId: string, bookingId: string, date: Date) => Promise<void>;
}

const getEventTypeLabel = (eventType: string): string => {
  switch (eventType) {
    case 'Rigg': return 'Rigg';
    case 'Event': return 'Event';
    case 'Riggdown': return 'Nedmont.';
    default: return eventType;
  }
};

const getEventTypeColor = (eventType: string): string => {
  switch (eventType) {
    case 'Rigg': return 'bg-blue-500';
    case 'Event': return 'bg-green-500';
    case 'Riggdown': return 'bg-orange-500';
    default: return 'bg-primary';
  }
};

const ProjectDropSlot = ({
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

  return (
    <div
      ref={drop as any}
      className={cn(
        "p-3 rounded-lg border transition-all",
        isOver && canDrop ? "border-primary bg-primary/10 shadow-md" : "border-border bg-card",
        "hover:shadow-sm"
      )}
    >
      {/* Header with event type and client */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge className={cn("text-xs text-white", getEventTypeColor(project.eventType))}>
              {getEventTypeLabel(project.eventType)}
            </Badge>
            {project.bookingNumber && (
              <span className="text-xs text-muted-foreground">#{project.bookingNumber}</span>
            )}
          </div>
          <h4 className="font-semibold text-sm truncate">{project.client}</h4>
        </div>
      </div>
      
      {/* Address */}
      {project.deliveryAddress && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate">{project.deliveryAddress}</span>
        </div>
      )}
      
      {/* Assigned staff */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        {project.assignedStaff.length === 0 ? (
          <span className="text-xs text-muted-foreground/60 italic">Dra personal hit</span>
        ) : (
          project.assignedStaff.map(s => (
            <Badge 
              key={s.id} 
              variant="default"
              className="text-xs py-0 px-1.5"
            >
              {s.name.split(' ')[0]}
            </Badge>
          ))
        )}
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

  return (
    <div className={cn(
      "border rounded-lg p-3 min-h-[200px] flex flex-col",
      isToday ? "border-primary bg-primary/5" : "border-border",
      isPast ? "opacity-60" : ""
    )}>
      {/* Day header */}
      <div className="flex items-center justify-between mb-3">
        <span className={cn(
          "text-base font-semibold",
          isToday ? "text-primary" : ""
        )}>
          {format(date, 'EEE d/M', { locale: sv })}
        </span>
        {isToday && (
          <Badge variant="default" className="text-xs">Idag</Badge>
        )}
      </div>
      
      {/* Projects list */}
      <div className="flex-1 space-y-2">
        {dayProjects.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground/50 italic">
            Inga bokningar
          </div>
        ) : (
          dayProjects.map(project => (
            <ProjectDropSlot 
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
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          Veckoplanering - Bokningar & Personal
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="w-full">
          <div className="grid grid-cols-7 gap-3 min-w-[900px]">
            {days.map(day => (
              <DayColumn 
                key={day.toISOString()}
                date={day}
                projects={projects}
                onStaffDrop={onStaffDrop}
              />
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default WeekProjectsView;
