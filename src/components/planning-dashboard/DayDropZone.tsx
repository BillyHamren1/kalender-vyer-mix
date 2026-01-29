import { Calendar, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDrop } from "react-dnd";
import { format, addDays, startOfWeek, isSameDay } from "date-fns";
import { sv } from "date-fns/locale";
import { DRAG_TYPE_STAFF } from "./AllStaffCard";
import { cn } from "@/lib/utils";

export interface DayAssignment {
  date: Date;
  teamId: string;
  teamName: string;
  staff: Array<{
    id: string;
    name: string;
    color: string | null;
  }>;
}

interface DayDropZoneProps {
  assignments: DayAssignment[];
  isLoading: boolean;
  onStaffDrop: (staffId: string, teamId: string, date: Date) => Promise<void>;
}

const teamNames: Record<string, string> = {
  'team-1': 'Team 1',
  'team-2': 'Team 2',
  'team-3': 'Team 3',
  'team-4': 'Team 4',
  'team-5': 'Team 5',
  'team-6': 'Team 6',
  'team-7': 'Team 7',
  'team-8': 'Team 8',
  'team-9': 'Team 9',
  'team-10': 'Team 10',
  'team-11': 'Live'
};

const SingleDayDropZone = ({ 
  date, 
  teams,
  onStaffDrop 
}: { 
  date: Date; 
  teams: DayAssignment[];
  onStaffDrop: (staffId: string, teamId: string, date: Date) => Promise<void>;
}) => {
  const isToday = isSameDay(date, new Date());
  const isPast = date < new Date() && !isToday;

  return (
    <div className={cn(
      "border rounded-lg p-3 min-h-[160px]",
      isToday ? "border-primary bg-primary/5" : "",
      isPast ? "opacity-60" : ""
    )}>
      <div className="flex items-center justify-between mb-3">
        <span className={cn(
          "text-base font-semibold",
          isToday ? "text-primary" : ""
        )}>
          {format(date, 'EEE d/M', { locale: sv })}
        </span>
        {isToday && (
          <Badge variant="default" className="text-sm px-2 py-0.5">Idag</Badge>
        )}
      </div>
      
      <div className="space-y-2">
        {['team-1', 'team-2', 'team-3', 'team-4', 'team-5', 'team-11'].map(teamId => {
          const teamData = teams.find(t => t.teamId === teamId);
          return (
            <TeamDropSlot 
              key={teamId}
              teamId={teamId}
              teamName={teamNames[teamId]}
              date={date}
              staff={teamData?.staff || []}
              onStaffDrop={onStaffDrop}
              isPast={isPast}
            />
          );
        })}
      </div>
    </div>
  );
};

const TeamDropSlot = ({
  teamId,
  teamName,
  date,
  staff,
  onStaffDrop,
  isPast
}: {
  teamId: string;
  teamName: string;
  date: Date;
  staff: Array<{ id: string; name: string; color: string | null }>;
  onStaffDrop: (staffId: string, teamId: string, date: Date) => Promise<void>;
  isPast: boolean;
}) => {
  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: DRAG_TYPE_STAFF,
    canDrop: () => !isPast,
    drop: (item: { id: string; name: string }) => {
      onStaffDrop(item.id, teamId, date);
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  }), [teamId, date, isPast, onStaffDrop]);

  return (
    <div
      ref={drop as any}
      className={cn(
        "p-2 rounded border border-dashed transition-colors min-h-[36px]",
        isOver && canDrop ? "border-primary bg-primary/10" : "border-muted-foreground/30",
        !canDrop && isOver ? "border-destructive/50" : ""
      )}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted-foreground font-medium shrink-0">{teamName}:</span>
        {staff.length === 0 ? (
          <span className="text-sm text-muted-foreground/50 italic">Släpp här</span>
        ) : (
          staff.map(s => (
            <Badge 
              key={s.id} 
              variant="default"
              className="text-sm py-0.5 px-2 font-medium"
            >
              {s.name.split(' ')[0]}
            </Badge>
          ))
        )}
      </div>
    </div>
  );
};

const DayDropZone = ({ assignments, isLoading, onStaffDrop }: DayDropZoneProps) => {
  // Generate 7 days starting from today
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Group assignments by date
  const assignmentsByDate = new Map<string, DayAssignment[]>();
  assignments.forEach(a => {
    const key = format(a.date, 'yyyy-MM-dd');
    if (!assignmentsByDate.has(key)) {
      assignmentsByDate.set(key, []);
    }
    assignmentsByDate.get(key)!.push(a);
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          Veckoplanering - Dra personal hit
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="w-full">
          <div className="grid grid-cols-7 gap-2 min-w-[700px]">
            {days.map(day => (
              <SingleDayDropZone 
                key={day.toISOString()}
                date={day}
                teams={assignmentsByDate.get(format(day, 'yyyy-MM-dd')) || []}
                onStaffDrop={onStaffDrop}
              />
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default DayDropZone;
