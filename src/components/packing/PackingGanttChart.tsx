import { useMemo, useRef, useEffect, useState } from "react";
import { format, differenceInDays, addDays, subDays, startOfDay, min, max } from "date-fns";
import { sv } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PackingTask } from "@/types/packing";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, Info } from "lucide-react";

interface GanttTask {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  completed: boolean;
  isInfoOnly: boolean;
  originalTask: PackingTask;
}

interface PackingGanttChartProps {
  tasks: PackingTask[];
  onTaskClick?: (task: PackingTask) => void;
}

// Calculate start/end dates based on task properties
function calculateTaskDates(task: PackingTask): { startDate: Date; endDate: Date } {
  const deadline = task.deadline ? startOfDay(new Date(task.deadline)) : startOfDay(new Date());
  
  const lowerTitle = task.title.toLowerCase();
  
  if (lowerTitle.includes('feedback')) {
    return {
      startDate: subDays(deadline, 6),
      endDate: deadline
    };
  }
  
  if (lowerTitle.includes('stängning')) {
    return {
      startDate: subDays(deadline, 7),
      endDate: deadline
    };
  }
  
  if (task.is_info_only) {
    return {
      startDate: deadline,
      endDate: deadline
    };
  }
  
  return {
    startDate: subDays(deadline, 7),
    endDate: deadline
  };
}

const TASK_COLORS = [
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-cyan-500',
  'bg-indigo-500',
  'bg-teal-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-emerald-500',
  'bg-violet-500',
];

const PackingGanttChart = ({ tasks, onTaskClick }: PackingGanttChartProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [todayPosition, setTodayPosition] = useState(0);
  
  const ganttData = useMemo(() => {
    if (tasks.length === 0) return null;
    
    const ganttTasks: GanttTask[] = tasks
      .filter(t => t.deadline)
      .map(task => {
        const { startDate, endDate } = calculateTaskDates(task);
        return {
          id: task.id,
          title: task.title,
          startDate,
          endDate,
          completed: task.completed,
          isInfoOnly: task.is_info_only,
          originalTask: task
        };
      })
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    
    if (ganttTasks.length === 0) return null;
    
    const allDates = ganttTasks.flatMap(t => [t.startDate, t.endDate]);
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
  }, [tasks]);

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
  const taskLabelWidth = 200;
  
  const timelineWidth = ganttData.totalDays * dayWidth;
  const today = startOfDay(new Date());

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Gantt-schema</CardTitle>
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
            
            {ganttData.tasks.map((task) => (
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
                  <Info className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                ) : task.completed ? (
                  <CheckCircle2 className="h-3 w-3 text-green-600 flex-shrink-0" />
                ) : (
                  <Circle className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                )}
                <span className={cn(
                  "text-sm truncate",
                  task.completed && "line-through text-muted-foreground"
                )}>
                  {task.title}
                </span>
              </div>
            ))}
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
                      {isFirstOfMonth && (
                        <span className="text-[10px] font-medium text-muted-foreground">
                          {format(day, 'MMM', { locale: sv })}
                        </span>
                      )}
                      <span className={cn(
                        "font-medium",
                        isToday && "text-primary"
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
              {ganttData.tasks.map((task, taskIndex) => {
                const startOffset = differenceInDays(task.startDate, ganttData.minDate);
                const duration = differenceInDays(task.endDate, task.startDate) + 1;
                const colorClass = TASK_COLORS[taskIndex % TASK_COLORS.length];
                
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
                        "absolute top-1.5 bottom-1.5 rounded cursor-pointer transition-all hover:opacity-80",
                        task.isInfoOnly ? "w-3 rounded-full" : "",
                        task.completed ? "opacity-60" : "",
                        colorClass
                      )}
                      style={{
                        left: startOffset * dayWidth + (task.isInfoOnly ? dayWidth / 2 - 6 : 4),
                        width: task.isInfoOnly ? 12 : Math.max(duration * dayWidth - 8, 20)
                      }}
                      onClick={() => onTaskClick?.(task.originalTask)}
                      title={`${task.title}\n${format(task.startDate, 'd MMM', { locale: sv })} - ${format(task.endDate, 'd MMM', { locale: sv })}`}
                    >
                      {!task.isInfoOnly && duration > 2 && (
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
        <div className="flex items-center gap-4 p-3 border-t text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-0.5 h-4 bg-primary" />
            <span>Idag</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span>Milstolpe</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-6 h-3 rounded bg-green-500" />
            <span>Uppgift (7 dagar)</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PackingGanttChart;
