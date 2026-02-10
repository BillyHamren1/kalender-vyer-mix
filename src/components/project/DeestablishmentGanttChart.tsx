import { useMemo, useRef, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, differenceInDays, addDays, subDays, startOfDay, min, max } from "date-fns";
import { sv } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckCircle2, Plus, Truck, Package, Users, Wrench, ClipboardCheck, PackageX } from "lucide-react";
import { fetchAllSubtasksForBooking } from "@/services/establishmentSubtaskService";

interface DeestablishmentTask {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  completed: boolean;
  category: 'transport' | 'material' | 'personal' | 'demontering' | 'kontroll';
}

interface DeestablishmentGanttChartProps {
  eventDate?: string | null;
  rigdownDate?: string | null;
  bookingId?: string | null;
  onTaskClick?: (task: DeestablishmentTask) => void;
}

const CATEGORY_COLORS = {
  transport: 'bg-blue-500',
  material: 'bg-amber-500',
  personal: 'bg-green-500',
  demontering: 'bg-rose-500',
  kontroll: 'bg-cyan-500',
};

const CATEGORY_ICONS = {
  transport: Truck,
  material: Package,
  personal: Users,
  demontering: PackageX,
  kontroll: ClipboardCheck,
};

const CATEGORY_LABELS = {
  transport: 'Transport',
  material: 'Material',
  personal: 'Personal',
  demontering: 'Demontering',
  kontroll: 'Kontroll',
};

// Generate default de-establishment tasks based on event and rigdown dates
function generateDefaultTasks(eventDate: Date, rigdownDate: Date): DeestablishmentTask[] {
  return [
    {
      id: 'deest-1',
      title: 'Event avslutas',
      startDate: eventDate,
      endDate: eventDate,
      completed: false,
      category: 'kontroll',
    },
    {
      id: 'deest-2',
      title: 'Personal anländer för nedmontering',
      startDate: rigdownDate,
      endDate: rigdownDate,
      completed: false,
      category: 'personal',
    },
    {
      id: 'deest-3',
      title: 'Demontering påbörjas',
      startDate: rigdownDate,
      endDate: rigdownDate,
      completed: false,
      category: 'demontering',
    },
    {
      id: 'deest-4',
      title: 'Nedmontering & packning',
      startDate: rigdownDate,
      endDate: rigdownDate,
      completed: false,
      category: 'demontering',
    },
    {
      id: 'deest-5',
      title: 'Städning av plats',
      startDate: rigdownDate,
      endDate: rigdownDate,
      completed: false,
      category: 'kontroll',
    },
    {
      id: 'deest-6',
      title: 'Lastning för transport',
      startDate: rigdownDate,
      endDate: rigdownDate,
      completed: false,
      category: 'material',
    },
    {
      id: 'deest-7',
      title: 'Transport till lager',
      startDate: addDays(rigdownDate, 1),
      endDate: addDays(rigdownDate, 1),
      completed: false,
      category: 'transport',
    },
    {
      id: 'deest-8',
      title: 'Lossning & inventering',
      startDate: addDays(rigdownDate, 1),
      endDate: addDays(rigdownDate, 1),
      completed: false,
      category: 'material',
    },
    {
      id: 'deest-9',
      title: 'Skaderapport & dokumentation',
      startDate: addDays(rigdownDate, 2),
      endDate: addDays(rigdownDate, 2),
      completed: false,
      category: 'kontroll',
    },
  ];
}

const DeestablishmentGanttChart = ({ eventDate, rigdownDate, bookingId, onTaskClick }: DeestablishmentGanttChartProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [todayPosition, setTodayPosition] = useState(0);

  // Fetch all subtasks for progress indicators
  const { data: allSubtasks = [] } = useQuery({
    queryKey: ['establishment-all-subtasks', bookingId],
    queryFn: () => fetchAllSubtasksForBooking(bookingId!),
    enabled: !!bookingId
  });

  const subtasksByTask = useMemo(() => {
    const map: Record<string, { total: number; completed: number }> = {};
    for (const st of allSubtasks) {
      if (!map[st.parent_task_id]) map[st.parent_task_id] = { total: 0, completed: 0 };
      map[st.parent_task_id].total++;
      if (st.completed) map[st.parent_task_id].completed++;
    }
    return map;
  }, [allSubtasks]);

  const ganttData = useMemo(() => {
    if (!eventDate || !rigdownDate) return null;

    const event = startOfDay(new Date(eventDate));
    const rigdown = startOfDay(new Date(rigdownDate));
    const tasks = generateDefaultTasks(event, rigdown);

    if (tasks.length === 0) return null;

    const allDates = tasks.flatMap(t => [t.startDate, t.endDate]);
    const minDate = subDays(min(allDates), 1);
    const maxDate = addDays(max(allDates), 2);
    const totalDays = differenceInDays(maxDate, minDate) + 1;

    const days: Date[] = [];
    for (let i = 0; i < totalDays; i++) {
      days.push(addDays(minDate, i));
    }

    return {
      tasks,
      minDate,
      maxDate,
      totalDays,
      days
    };
  }, [eventDate, rigdownDate]);

  useEffect(() => {
    if (ganttData && scrollRef.current) {
      const today = startOfDay(new Date());
      const daysSinceStart = differenceInDays(today, ganttData.minDate);
      const dayWidth = 60;
      const scrollPosition = daysSinceStart * dayWidth - 100;
      scrollRef.current.scrollLeft = Math.max(0, scrollPosition);
      setTodayPosition(daysSinceStart);
    }
  }, [ganttData]);

  if (!eventDate || !rigdownDate) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PackageX className="h-5 w-5 text-rose-500" />
            Avetablering - Gantt-schema
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            Ingen event- eller nedmonteringsdatum tillgängligt för denna bokning.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!ganttData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PackageX className="h-5 w-5 text-rose-500" />
            Avetablering - Gantt-schema
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            Inga uppgifter att visa.
          </p>
        </CardContent>
      </Card>
    );
  }

  const dayWidth = 60;
  const rowHeight = 40;
  const headerHeight = 60;
  const taskLabelWidth = 240;
  const timelineWidth = ganttData.totalDays * dayWidth;
  const today = startOfDay(new Date());

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <PackageX className="h-5 w-5 text-rose-500" />
            Avetablering - Gantt-schema
          </CardTitle>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Lägg till aktivitet
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="flex">
          {/* Task labels column */}
          <div className="flex-shrink-0 border-r bg-background z-10" style={{ width: taskLabelWidth }}>
            <div 
              className="border-b bg-muted/50 px-3 flex items-end pb-2 font-medium text-sm"
              style={{ height: headerHeight }}
            >
              Aktivitet
            </div>
            
            {ganttData.tasks.map((task) => {
              const IconComponent = CATEGORY_ICONS[task.category];
              return (
                <div
                  key={task.id}
                  className={cn(
                    "flex items-center gap-2 px-3 border-b cursor-pointer hover:bg-muted/50 transition-colors",
                    task.completed && "opacity-60"
                  )}
                  style={{ height: rowHeight }}
                  onClick={() => onTaskClick?.(task)}
                >
                  {task.completed ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                  ) : (
                    <IconComponent className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  )}
                  <span className={cn(
                    "text-sm truncate",
                    task.completed && "line-through text-muted-foreground"
                  )}>
                    {task.title}
                  </span>
                </div>
              );
            })}
          </div>
          
          {/* Scrollable timeline */}
          <div className="flex-1 overflow-x-auto" ref={scrollRef}>
            <div style={{ width: timelineWidth, minWidth: '100%' }}>
              {/* Date headers */}
              <div 
                className="flex border-b bg-muted/50"
                style={{ height: headerHeight }}
              >
                {ganttData.days.map((day, index) => {
                  const isToday = differenceInDays(day, today) === 0;
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                  
                  return (
                    <div
                      key={index}
                      className={cn(
                        "flex-shrink-0 flex flex-col items-center justify-end pb-1 border-r text-xs",
                        isWeekend && "bg-muted/70",
                        isToday && "bg-primary/10"
                      )}
                      style={{ width: dayWidth }}
                    >
                      <span className={cn(
                        "font-medium text-base",
                        isToday && "text-primary"
                      )}>
                        {format(day, 'd')}
                      </span>
                      <span className="text-muted-foreground">
                        {format(day, 'EEE', { locale: sv })}
                      </span>
                    </div>
                  );
                })}
              </div>
              
              {/* Task bars */}
              {ganttData.tasks.map((task) => {
                const startOffset = differenceInDays(task.startDate, ganttData.minDate);
                const duration = differenceInDays(task.endDate, task.startDate) + 1;
                const colorClass = CATEGORY_COLORS[task.category];
                
                return (
                  <div
                    key={task.id}
                    className="relative border-b"
                    style={{ height: rowHeight }}
                  >
                    {/* Grid lines */}
                    <div className="absolute inset-0 flex">
                      {ganttData.days.map((day, dayIndex) => {
                        const isToday = differenceInDays(day, today) === 0;
                        const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                        
                        return (
                          <div
                            key={dayIndex}
                            className={cn(
                              "flex-shrink-0 border-r",
                              isWeekend && "bg-muted/30",
                              isToday && "bg-primary/5"
                            )}
                            style={{ width: dayWidth }}
                          />
                        );
                      })}
                    </div>
                    
                    {/* Today marker */}
                    {todayPosition >= 0 && todayPosition < ganttData.totalDays && (
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-primary z-10"
                        style={{ left: todayPosition * dayWidth + dayWidth / 2 }}
                      />
                    )}
                    
                    {/* Task bar */}
                    <div
                      className={cn(
                        "absolute top-2 bottom-2 rounded-md cursor-pointer transition-all hover:opacity-80 shadow-sm",
                        task.completed ? "opacity-60" : "",
                        colorClass
                      )}
                      style={{
                        left: startOffset * dayWidth + 4,
                        width: Math.max(duration * dayWidth - 8, 24)
                      }}
                      onClick={() => onTaskClick?.(task)}
                      title={`${task.title}\n${format(task.startDate, 'd MMM', { locale: sv })}`}
                    >
                      <span className="absolute inset-0 flex items-center px-2 text-xs text-white font-medium truncate">
                        {task.title}
                        {subtasksByTask[task.id] && (
                          <span className="ml-1 opacity-80">
                            ({subtasksByTask[task.id].completed}/{subtasksByTask[task.id].total})
                          </span>
                        )}
                      </span>
                      {subtasksByTask[task.id] && subtasksByTask[task.id].total > 0 && (
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20 rounded-b-md overflow-hidden">
                          <div
                            className="h-full bg-white/60 transition-all"
                            style={{ width: `${(subtasksByTask[task.id].completed / subtasksByTask[task.id].total) * 100}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        
        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 p-3 border-t text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-0.5 h-4 bg-primary" />
            <span>Idag</span>
          </div>
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center gap-1">
              <div className={cn("w-4 h-3 rounded", CATEGORY_COLORS[key as keyof typeof CATEGORY_COLORS])} />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default DeestablishmentGanttChart;
