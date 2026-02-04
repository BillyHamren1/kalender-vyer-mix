import { useMemo, useRef, useEffect, useState } from "react";
import { format, differenceInDays, addDays, subDays, startOfDay, min, max, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PackingTask } from "@/types/packing";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, Info, Truck, Package, ClipboardCheck, BoxesIcon, PackageCheck, CalendarDays } from "lucide-react";

interface GanttTask {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  completed: boolean;
  isInfoOnly: boolean;
  originalTask: PackingTask;
  taskType: 'packing' | 'delivery' | 'return' | 'inventory' | 'unpacking' | 'custom';
}

interface PackingGanttChartProps {
  tasks: PackingTask[];
  rigDate?: string | null;
  eventDate?: string | null;
  rigdownDate?: string | null;
  onTaskClick?: (task: PackingTask) => void;
}

// Map task types to warehouse colors (matching ResourceData.ts)
const TASK_TYPE_COLORS: Record<GanttTask['taskType'], string> = {
  packing: 'bg-purple-500',    // Lila - Packning
  delivery: 'bg-blue-500',     // Blå - Utleverans
  return: 'bg-orange-500',     // Orange - Återleverans
  inventory: 'bg-cyan-500',    // Cyan - Inventering
  unpacking: 'bg-slate-500',   // Grå - Upppackning
  custom: 'bg-emerald-500',    // Grön - Egenskapade
};

const TASK_TYPE_LABELS: Record<GanttTask['taskType'], string> = {
  packing: 'Packning',
  delivery: 'Utleverans',
  return: 'Återleverans',
  inventory: 'Inventering',
  unpacking: 'Upppackning',
  custom: 'Egenskapad',
};

// Calculate task dates based on warehouse logistics logic
function calculateWarehouseTaskDates(
  task: PackingTask,
  rigDate: Date | null,
  rigdownDate: Date | null
): { startDate: Date; endDate: Date; taskType: GanttTask['taskType'] } {
  const title = task.title.toLowerCase();
  const deadline = task.deadline ? startOfDay(parseISO(task.deadline)) : null;

  // Packing phase tasks (relative to rig day)
  if (rigDate) {
    // Match "packning" but not "upppackning"
    if ((title === 'packning' || title.includes('packning påbörjad') || title.includes('packing started')) && !title.includes('upppackning')) {
      return { 
        startDate: subDays(rigDate, 4), 
        endDate: subDays(rigDate, 4),
        taskType: 'packing'
      };
    }
    if (title.includes('utrustning packad') || title.includes('equipment packed')) {
      return { 
        startDate: subDays(rigDate, 1), 
        endDate: subDays(rigDate, 1),
        taskType: 'packing'
      };
    }
    if (title.includes('utleverans') || title.includes('delivery')) {
      return { 
        startDate: rigDate, 
        endDate: rigDate,
        taskType: 'delivery'
      };
    }
  }

  // Post-event tasks (relative to rigdown day)
  if (rigdownDate) {
    if (title.includes('återleverans') || title.includes('return')) {
      return { 
        startDate: rigdownDate, 
        endDate: rigdownDate,
        taskType: 'return'
      };
    }
    if (title.includes('inventering') || title.includes('inventory')) {
      return { 
        startDate: addDays(rigdownDate, 1), 
        endDate: addDays(rigdownDate, 1),
        taskType: 'inventory'
      };
    }
    if (title.includes('upppackning') || title.includes('unpacking')) {
      return { 
        startDate: addDays(rigdownDate, 2), 
        endDate: addDays(rigdownDate, 2),
        taskType: 'unpacking'
      };
    }
  }

  // Fallback: use deadline or today for custom tasks
  const fallbackDate = deadline || startOfDay(new Date());
  return { 
    startDate: fallbackDate, 
    endDate: fallbackDate,
    taskType: 'custom'
  };
}

const PackingGanttChart = ({ tasks, rigDate, eventDate, rigdownDate, onTaskClick }: PackingGanttChartProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [todayPosition, setTodayPosition] = useState(0);

  // Parse date strings to Date objects
  const parsedRigDate = rigDate ? startOfDay(parseISO(rigDate)) : null;
  const parsedEventDate = eventDate ? startOfDay(parseISO(eventDate)) : null;
  const parsedRigdownDate = rigdownDate ? startOfDay(parseISO(rigdownDate)) : null;
  
  const ganttData = useMemo(() => {
    if (tasks.length === 0) return null;
    
    const ganttTasks: GanttTask[] = tasks
      .filter(t => t.deadline || parsedRigDate || parsedRigdownDate) // Include tasks that can be positioned
      .map(task => {
        const { startDate, endDate, taskType } = calculateWarehouseTaskDates(
          task,
          parsedRigDate,
          parsedRigdownDate
        );
        return {
          id: task.id,
          title: task.title,
          startDate,
          endDate,
          completed: task.completed,
          isInfoOnly: task.is_info_only,
          originalTask: task,
          taskType
        };
      })
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    
    if (ganttTasks.length === 0) return null;
    
    // Collect all dates including milestones
    const allDates: Date[] = ganttTasks.flatMap(t => [t.startDate, t.endDate]);
    if (parsedRigDate) allDates.push(parsedRigDate);
    if (parsedEventDate) allDates.push(parsedEventDate);
    if (parsedRigdownDate) allDates.push(parsedRigdownDate);
    
    const minDate = subDays(min(allDates), 3);
    const maxDate = addDays(max(allDates), 3);
    const totalDays = differenceInDays(maxDate, minDate) + 1;
    
    const days: Date[] = [];
    for (let i = 0; i < totalDays; i++) {
      days.push(addDays(minDate, i));
    }
    
    return {
      tasks: ganttTasks,
      minDate,
      maxDate,
      totalDays,
      days
    };
  }, [tasks, parsedRigDate, parsedEventDate, parsedRigdownDate]);

  useEffect(() => {
    if (ganttData && scrollRef.current) {
      const today = startOfDay(new Date());
      const daysSinceStart = differenceInDays(today, ganttData.minDate);
      const dayWidth = 40;
      const scrollPosition = daysSinceStart * dayWidth - 100;
      scrollRef.current.scrollLeft = Math.max(0, scrollPosition);
      setTodayPosition(daysSinceStart);
    }
  }, [ganttData]);

  if (!ganttData || ganttData.tasks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Gantt-schema</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            Inga uppgifter med datum att visa i schemat.
          </p>
        </CardContent>
      </Card>
    );
  }

  const dayWidth = 40;
  const rowHeight = 36;
  const headerHeight = 60;
  const taskLabelWidth = 220;
  
  const timelineWidth = ganttData.totalDays * dayWidth;
  const today = startOfDay(new Date());

  // Calculate milestone positions
  const rigDayPosition = parsedRigDate ? differenceInDays(parsedRigDate, ganttData.minDate) : null;
  const eventDayPosition = parsedEventDate ? differenceInDays(parsedEventDate, ganttData.minDate) : null;
  const rigdownDayPosition = parsedRigdownDate ? differenceInDays(parsedRigdownDate, ganttData.minDate) : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5" />
          Gantt-schema
        </CardTitle>
        {/* Milestone info */}
        {(parsedRigDate || parsedEventDate || parsedRigdownDate) && (
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mt-2">
            {parsedRigDate && (
              <span className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                Riggdag: {format(parsedRigDate, 'd MMM', { locale: sv })}
              </span>
            )}
            {parsedEventDate && (
              <span className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                Eventdag: {format(parsedEventDate, 'd MMM', { locale: sv })}
              </span>
            )}
            {parsedRigdownDate && (
              <span className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-orange-500" />
                Rigdown: {format(parsedRigdownDate, 'd MMM', { locale: sv })}
              </span>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <div className="flex">
          {/* Task labels column (fixed) */}
          <div className="flex-shrink-0 border-r bg-background z-10" style={{ width: taskLabelWidth }}>
            <div 
              className="border-b bg-muted/50 px-3 flex items-end pb-2 font-medium text-sm"
              style={{ height: headerHeight }}
            >
              Uppgift
            </div>
            
            {ganttData.tasks.map((task) => {
              const TaskIcon = task.taskType === 'packing' ? Package :
                              task.taskType === 'delivery' ? Truck :
                              task.taskType === 'return' ? Truck :
                              task.taskType === 'inventory' ? ClipboardCheck :
                              task.taskType === 'unpacking' ? BoxesIcon :
                              PackageCheck;
              
              return (
                <div
                  key={task.id}
                  className={cn(
                    "flex items-center gap-2 px-3 border-b cursor-pointer hover:bg-muted/50 transition-colors",
                    task.completed && "opacity-60"
                  )}
                  style={{ height: rowHeight }}
                  onClick={() => onTaskClick?.(task.originalTask)}
                >
                  {task.isInfoOnly ? (
                    <Info className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  ) : task.completed ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                  ) : (
                    <TaskIcon className={cn(
                      "h-3.5 w-3.5 flex-shrink-0",
                      task.taskType === 'packing' && "text-purple-600",
                      task.taskType === 'delivery' && "text-blue-600",
                      task.taskType === 'return' && "text-orange-600",
                      task.taskType === 'inventory' && "text-cyan-600",
                      task.taskType === 'unpacking' && "text-slate-600",
                      task.taskType === 'custom' && "text-emerald-600"
                    )} />
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
                  const isFirstOfMonth = day.getDate() === 1;
                  const isRigDay = parsedRigDate && differenceInDays(day, parsedRigDate) === 0;
                  const isEventDay = parsedEventDate && differenceInDays(day, parsedEventDate) === 0;
                  const isRigdownDay = parsedRigdownDate && differenceInDays(day, parsedRigdownDate) === 0;
                  
                  return (
                    <div
                      key={index}
                      className={cn(
                        "flex-shrink-0 flex flex-col items-center justify-end pb-1 border-r text-xs",
                        isWeekend && "bg-muted/70",
                        isToday && "bg-primary/10",
                        isRigDay && "bg-blue-100 dark:bg-blue-900/30",
                        isEventDay && "bg-green-100 dark:bg-green-900/30",
                        isRigdownDay && "bg-orange-100 dark:bg-orange-900/30"
                      )}
                      style={{ width: dayWidth }}
                    >
                      {isFirstOfMonth && (
                        <span className="text-[10px] font-medium text-muted-foreground">
                          {format(day, 'MMM', { locale: sv })}
                        </span>
                      )}
                      <span className={cn(
                        "font-medium",
                        isToday && "text-primary",
                        isRigDay && "text-blue-700 dark:text-blue-300",
                        isEventDay && "text-green-700 dark:text-green-300",
                        isRigdownDay && "text-orange-700 dark:text-orange-300"
                      )}>
                        {format(day, 'd')}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
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
                const colorClass = TASK_TYPE_COLORS[task.taskType];
                
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
                        const isRigDay = parsedRigDate && differenceInDays(day, parsedRigDate) === 0;
                        const isEventDay = parsedEventDate && differenceInDays(day, parsedEventDate) === 0;
                        const isRigdownDay = parsedRigdownDate && differenceInDays(day, parsedRigdownDate) === 0;
                        
                        return (
                          <div
                            key={dayIndex}
                            className={cn(
                              "flex-shrink-0 border-r",
                              isWeekend && "bg-muted/30",
                              isToday && "bg-primary/5",
                              isRigDay && "bg-blue-50 dark:bg-blue-900/20",
                              isEventDay && "bg-green-50 dark:bg-green-900/20",
                              isRigdownDay && "bg-orange-50 dark:bg-orange-900/20"
                            )}
                            style={{ width: dayWidth }}
                          />
                        );
                      })}
                    </div>
                    
                    {/* Milestone markers */}
                    {rigDayPosition !== null && rigDayPosition >= 0 && rigDayPosition < ganttData.totalDays && (
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-blue-500/50 z-5"
                        style={{ left: rigDayPosition * dayWidth + dayWidth / 2 }}
                      />
                    )}
                    {eventDayPosition !== null && eventDayPosition >= 0 && eventDayPosition < ganttData.totalDays && (
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-green-500/50 z-5"
                        style={{ left: eventDayPosition * dayWidth + dayWidth / 2 }}
                      />
                    )}
                    {rigdownDayPosition !== null && rigdownDayPosition >= 0 && rigdownDayPosition < ganttData.totalDays && (
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-orange-500/50 z-5"
                        style={{ left: rigdownDayPosition * dayWidth + dayWidth / 2 }}
                      />
                    )}
                    
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
                        "absolute top-1.5 bottom-1.5 rounded cursor-pointer transition-all hover:opacity-80 shadow-sm",
                        task.isInfoOnly ? "w-3 rounded-full" : "",
                        task.completed ? "opacity-60" : "",
                        colorClass
                      )}
                      style={{
                        left: startOffset * dayWidth + (task.isInfoOnly ? dayWidth / 2 - 6 : 4),
                        width: task.isInfoOnly ? 12 : Math.max(duration * dayWidth - 8, 24)
                      }}
                      onClick={() => onTaskClick?.(task.originalTask)}
                      title={`${task.title} (${TASK_TYPE_LABELS[task.taskType]})\n${format(task.startDate, 'd MMM', { locale: sv })}`}
                    >
                      {!task.isInfoOnly && duration > 1 && (
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
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-purple-500" />
            <span>Packning</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span>Utleverans</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-orange-500" />
            <span>Återleverans</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-cyan-500" />
            <span>Inventering</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-slate-500" />
            <span>Upppackning</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-emerald-500" />
            <span>Egenskapad</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PackingGanttChart;
