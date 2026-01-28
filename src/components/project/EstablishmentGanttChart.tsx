import { useMemo, useRef, useEffect, useState } from "react";
import { format, differenceInDays, addDays, subDays, startOfDay, min, max } from "date-fns";
import { sv } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, Plus, Truck, Package, Users, Wrench, ClipboardCheck } from "lucide-react";

interface EstablishmentTask {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  completed: boolean;
  category: 'transport' | 'material' | 'personal' | 'installation' | 'kontroll';
}

interface EstablishmentGanttChartProps {
  rigDate?: string | null;
  eventDate?: string | null;
  onTaskClick?: (task: EstablishmentTask) => void;
}

const CATEGORY_COLORS = {
  transport: 'bg-blue-500',
  material: 'bg-amber-500',
  personal: 'bg-green-500',
  installation: 'bg-purple-500',
  kontroll: 'bg-cyan-500',
};

const CATEGORY_ICONS = {
  transport: Truck,
  material: Package,
  personal: Users,
  installation: Wrench,
  kontroll: ClipboardCheck,
};

const CATEGORY_LABELS = {
  transport: 'Transport',
  material: 'Material',
  personal: 'Personal',
  installation: 'Installation',
  kontroll: 'Kontroll',
};

// Generate default establishment tasks based on rig date
function generateDefaultTasks(rigDate: Date, eventDate: Date): EstablishmentTask[] {
  return [
    {
      id: 'est-1',
      title: 'Lastning på lager',
      startDate: subDays(rigDate, 1),
      endDate: subDays(rigDate, 1),
      completed: false,
      category: 'material',
    },
    {
      id: 'est-2',
      title: 'Transport till plats',
      startDate: rigDate,
      endDate: rigDate,
      completed: false,
      category: 'transport',
    },
    {
      id: 'est-3',
      title: 'Personal anländer',
      startDate: rigDate,
      endDate: rigDate,
      completed: false,
      category: 'personal',
    },
    {
      id: 'est-4',
      title: 'Lossning & uppställning',
      startDate: rigDate,
      endDate: rigDate,
      completed: false,
      category: 'installation',
    },
    {
      id: 'est-5',
      title: 'Montering dag 1',
      startDate: rigDate,
      endDate: rigDate,
      completed: false,
      category: 'installation',
    },
    {
      id: 'est-6',
      title: 'Montering dag 2',
      startDate: addDays(rigDate, 1),
      endDate: addDays(rigDate, 1),
      completed: false,
      category: 'installation',
    },
    {
      id: 'est-7',
      title: 'Slutkontroll & städning',
      startDate: subDays(eventDate, 1),
      endDate: subDays(eventDate, 1),
      completed: false,
      category: 'kontroll',
    },
    {
      id: 'est-8',
      title: 'Överlämning till kund',
      startDate: eventDate,
      endDate: eventDate,
      completed: false,
      category: 'kontroll',
    },
  ];
}

const EstablishmentGanttChart = ({ rigDate, eventDate, onTaskClick }: EstablishmentGanttChartProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [todayPosition, setTodayPosition] = useState(0);

  const ganttData = useMemo(() => {
    if (!rigDate || !eventDate) return null;

    const rig = startOfDay(new Date(rigDate));
    const event = startOfDay(new Date(eventDate));
    const tasks = generateDefaultTasks(rig, event);

    if (tasks.length === 0) return null;

    const allDates = tasks.flatMap(t => [t.startDate, t.endDate]);
    const minDate = subDays(min(allDates), 2);
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
  }, [rigDate, eventDate]);

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

  if (!rigDate || !eventDate) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" />
            Etablering - Gantt-schema
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            Ingen rigg- eller eventdatum tillgängligt för denna bokning.
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
            <Wrench className="h-5 w-5 text-primary" />
            Etablering - Gantt-schema
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
  const taskLabelWidth = 220;
  const timelineWidth = ganttData.totalDays * dayWidth;
  const today = startOfDay(new Date());

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" />
            Etablering - Gantt-schema
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
                    <IconComponent className={cn("h-4 w-4 flex-shrink-0", `text-${task.category === 'transport' ? 'blue' : task.category === 'material' ? 'amber' : task.category === 'personal' ? 'green' : task.category === 'installation' ? 'purple' : 'cyan'}-500`)} />
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
                      {duration > 0 && (
                        <span className="absolute inset-0 flex items-center px-2 text-xs text-white font-medium truncate">
                          {task.title}
                        </span>
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
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => {
            const IconComponent = CATEGORY_ICONS[key as keyof typeof CATEGORY_ICONS];
            return (
              <div key={key} className="flex items-center gap-1">
                <div className={cn("w-4 h-3 rounded", CATEGORY_COLORS[key as keyof typeof CATEGORY_COLORS])} />
                <span>{label}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default EstablishmentGanttChart;
