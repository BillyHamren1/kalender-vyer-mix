import { useMemo, useRef, useEffect, useState } from "react";
import { format, differenceInDays, addDays, subDays, startOfDay, min, max } from "date-fns";
import { sv } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectTask } from "@/types/project";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, Info } from "lucide-react";

interface GanttTask {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  completed: boolean;
  isInfoOnly: boolean;
  category: TaskCategory;
  originalTask: ProjectTask;
}

interface ProjectGanttChartProps {
  tasks: ProjectTask[];
  onTaskClick?: (task: ProjectTask) => void;
}

type TaskCategory = 'transport' | 'material' | 'personal' | 'installation' | 'kontroll' | 'admin';

const CATEGORY_CONFIG: Record<TaskCategory, { label: string; color: string; bgClass: string }> = {
  transport:    { label: 'Transport',    color: 'hsl(217, 91%, 60%)', bgClass: 'bg-blue-500' },
  material:     { label: 'Material',     color: 'hsl(25, 95%, 53%)',  bgClass: 'bg-orange-500' },
  personal:     { label: 'Personal',     color: 'hsl(142, 71%, 45%)', bgClass: 'bg-green-500' },
  installation: { label: 'Installation', color: 'hsl(271, 91%, 65%)', bgClass: 'bg-purple-500' },
  kontroll:     { label: 'Kontroll',     color: 'hsl(184, 60%, 38%)', bgClass: 'bg-teal-500' },
  admin:        { label: 'Admin',        color: 'hsl(215, 14%, 60%)', bgClass: 'bg-slate-400' },
};

function categorizeTask(title: string): TaskCategory {
  const t = title.toLowerCase();
  if (t.includes('transport')) return 'transport';
  if (t.includes('material') || t.includes('produkt')) return 'material';
  if (t.includes('personal') || t.includes('bemanning')) return 'personal';
  if (t.includes('montering') || t.includes('installation') || t.includes('rigg')) return 'installation';
  if (t.includes('kontroll') || t.includes('slutkontroll')) return 'kontroll';
  return 'admin';
}

function calculateTaskDates(task: ProjectTask): { startDate: Date; endDate: Date } {
  const createdAt = startOfDay(new Date(task.created_at));

  if (!task.deadline) {
    // No deadline: use created_at as start, 3 days duration
    if (task.completed) {
      return { startDate: createdAt, endDate: addDays(createdAt, 1) };
    }
    return { startDate: createdAt, endDate: addDays(createdAt, 3) };
  }

  const deadline = startOfDay(new Date(task.deadline));
  const lowerTitle = task.title.toLowerCase();

  if (lowerTitle.includes('feedback')) {
    return { startDate: subDays(deadline, 6), endDate: deadline };
  }
  if (lowerTitle.includes('stängning')) {
    return { startDate: subDays(deadline, 7), endDate: deadline };
  }
  if (task.is_info_only) {
    return { startDate: deadline, endDate: deadline };
  }
  return { startDate: subDays(deadline, 7), endDate: deadline };
}

const ProjectGanttChart = ({ tasks, onTaskClick }: ProjectGanttChartProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [todayPosition, setTodayPosition] = useState(0);

  const ganttData = useMemo(() => {
    if (tasks.length === 0) return null;

    const ganttTasks: GanttTask[] = tasks
      .map(task => {
        const { startDate, endDate } = calculateTaskDates(task);
        return {
          id: task.id,
          title: task.title,
          startDate,
          endDate,
          completed: task.completed,
          isInfoOnly: task.is_info_only,
          category: categorizeTask(task.title),
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

    return { tasks: ganttTasks, minDate, maxDate, totalDays, days };
  }, [tasks]);

  useEffect(() => {
    if (ganttData && scrollRef.current) {
      const today = startOfDay(new Date());
      const dayWidth = 40;
      const daysSinceStart = differenceInDays(today, ganttData.minDate);
      scrollRef.current.scrollLeft = Math.max(0, daysSinceStart * dayWidth - 100 + 200);
      setTodayPosition(daysSinceStart);
    }
  }, [ganttData]);

  if (!ganttData || ganttData.tasks.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Gantt-schema</CardTitle></CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">Inga uppgifter att visa i schemat.</p>
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

  // Collect used categories for legend
  const usedCategories = [...new Set(ganttData.tasks.map(t => t.category))];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Gantt-schema</CardTitle>
      </CardHeader>
      <div className="overflow-x-auto relative" ref={scrollRef}>
        <div style={{ minWidth: taskLabelWidth + timelineWidth }}>
          <div className="flex">
            {/* Task labels column - sticky */}
            <div className="flex-shrink-0 border-r bg-background z-20 sticky left-0" style={{ width: taskLabelWidth }}>
              <div className="border-b bg-muted/30" style={{ height: 20 }} />
              <div className="border-b bg-muted/50 px-3 flex items-end pb-1 font-medium text-sm" style={{ height: 40 }}>
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
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: CATEGORY_CONFIG[task.category].color }}
                  />
                  {task.isInfoOnly ? (
                    <Info className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  ) : task.completed ? (
                    <CheckCircle2 className="h-3 w-3 text-primary flex-shrink-0" />
                  ) : (
                    <Circle className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  )}
                  <span className={cn("text-sm truncate", task.completed && "line-through text-muted-foreground")}>
                    {task.title}
                  </span>
                </div>
              ))}
            </div>

            {/* Timeline */}
            <div className="flex-shrink-0" style={{ width: timelineWidth }}>
              {/* Month headers */}
              <div className="flex border-b bg-muted/30" style={{ height: 20 }}>
                {(() => {
                  const months: { label: string; span: number }[] = [];
                  let currentMonth = '';
                  ganttData.days.forEach(day => {
                    const m = format(day, 'MMMM yyyy', { locale: sv });
                    if (m !== currentMonth) {
                      months.push({ label: m, span: 1 });
                      currentMonth = m;
                    } else {
                      months[months.length - 1].span++;
                    }
                  });
                  return months.map((m, i) => (
                    <div
                      key={i}
                      className="flex-shrink-0 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center px-1 border-r"
                      style={{ width: m.span * dayWidth }}
                    >
                      {m.label}
                    </div>
                  ));
                })()}
              </div>

              {/* Day headers */}
              <div className="flex border-b bg-muted/50" style={{ height: 40 }}>
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
                      <span className={cn("font-medium", isToday && "text-primary")}>{format(day, 'd')}</span>
                      <span className="text-[10px] text-muted-foreground">{format(day, 'EEE', { locale: sv })}</span>
                    </div>
                  );
                })}
              </div>

              {/* Task bars */}
              {ganttData.tasks.map((task) => {
                const startOffset = differenceInDays(task.startDate, ganttData.minDate);
                const duration = differenceInDays(task.endDate, task.startDate) + 1;
                const categoryColor = CATEGORY_CONFIG[task.category].color;

                return (
                  <div key={task.id} className="relative border-b" style={{ height: rowHeight }}>
                    {/* Grid */}
                    <div className="absolute inset-0 flex">
                      {ganttData.days.map((day, dayIndex) => {
                        const isToday = differenceInDays(day, today) === 0;
                        const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                        return (
                          <div
                            key={dayIndex}
                            className={cn("flex-shrink-0 border-r", isWeekend && "bg-muted/30", isToday && "bg-primary/5")}
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
                        "absolute top-1.5 bottom-1.5 rounded cursor-pointer transition-all hover:brightness-110",
                        task.isInfoOnly ? "w-3 rounded-full" : "",
                        task.completed ? "opacity-50" : ""
                      )}
                      style={{
                        left: startOffset * dayWidth + (task.isInfoOnly ? dayWidth / 2 - 6 : 4),
                        width: task.isInfoOnly ? 12 : Math.max(duration * dayWidth - 8, 20),
                        backgroundColor: categoryColor
                      }}
                      onClick={() => onTaskClick?.(task.originalTask)}
                      title={`${task.title}\n${format(task.startDate, 'd MMM', { locale: sv })} – ${format(task.endDate, 'd MMM', { locale: sv })}`}
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
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 p-3 border-t text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-0.5 h-4 bg-primary" />
          <span>Idag</span>
        </div>
        {usedCategories.map(cat => (
          <div key={cat} className="flex items-center gap-1.5">
            <div className="w-4 h-2.5 rounded-sm" style={{ backgroundColor: CATEGORY_CONFIG[cat].color }} />
            <span>{CATEGORY_CONFIG[cat].label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-muted-foreground/40" />
          <span>Milstolpe</span>
        </div>
      </div>
    </Card>
  );
};

export default ProjectGanttChart;
