import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, differenceInDays, addDays, subDays, startOfDay, min, max, isBefore, isEqual } from "date-fns";
import { sv } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CheckCircle2, Plus, Truck, Package, Users, Wrench, ClipboardCheck, Trash2, Loader2, AlertTriangle, Circle, Play, Ban, XCircle, ArrowUp, ArrowRight, ArrowDown, User, HelpCircle } from "lucide-react";
import { fetchEstablishmentBookingData } from "@/services/establishmentPlanningService";
import { fetchAllSubtasksForBooking } from "@/services/establishmentSubtaskService";
import {
  fetchEstablishmentTasks,
  fetchEstablishmentTasksByProject,
  generateDefaultTasks,
  generateDefaultTasksForProject,
  updateEstablishmentTask,
  deleteEstablishmentTask,
  type EstablishmentTask,
} from "@/services/establishmentTaskService";
import AddEstablishmentTaskDialog from "./AddEstablishmentTaskDialog";
import type { ProjectBookingInfo } from "./AddEstablishmentTaskDialog";
import { toast } from "sonner";

interface EstablishmentGanttChartProps {
  rigDate?: string | null;
  eventDate?: string | null;
  bookingId?: string | null;
  largeProjectId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  client?: string;
  address?: string | null;
  projectBookings?: ProjectBookingInfo[];
  staffPool?: Array<{ id: string; name: string }>;
  onTaskClick?: (task: { id: string; title: string; category: string; startDate: Date; endDate: Date; completed: boolean }) => void;
  visibleTaskIds?: Set<string> | null;
}

const CATEGORY_COLORS: Record<string, string> = {
  transport: 'bg-blue-500',
  material: 'bg-amber-500',
  personal: 'bg-green-500',
  installation: 'bg-purple-500',
  kontroll: 'bg-cyan-500',
};

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  not_started: { bg: 'bg-muted', text: 'text-muted-foreground', label: 'Ej startad' },
  in_progress: { bg: 'bg-primary/15', text: 'text-primary', label: 'Pågår' },
  blocked: { bg: 'bg-destructive/15', text: 'text-destructive', label: 'Blockerad' },
  done: { bg: 'bg-emerald-500/15', text: 'text-emerald-600', label: 'Klar' },
  cancelled: { bg: 'bg-muted', text: 'text-muted-foreground', label: 'Avbruten' },
};

const READINESS_LABELS: Record<string, string> = {
  ready: 'Redo',
  missing_information: 'Saknar info',
  waiting_for_decision: 'Väntar beslut',
  waiting_for_external: 'Väntar extern',
};

const PRIORITY_CONFIG: Record<string, { icon: typeof ArrowUp; className: string; label: string }> = {
  high: { icon: ArrowUp, className: 'text-destructive', label: 'Hög' },
  medium: { icon: ArrowRight, className: 'text-amber-500', label: 'Medium' },
  low: { icon: ArrowDown, className: 'text-muted-foreground', label: 'Låg' },
};

const CATEGORY_ICONS: Record<string, typeof Truck> = {
  transport: Truck,
  material: Package,
  personal: Users,
  installation: Wrench,
  kontroll: ClipboardCheck,
};

const CATEGORY_LABELS: Record<string, string> = {
  transport: 'Transport',
  material: 'Material',
  personal: 'Personal',
  installation: 'Installation',
  kontroll: 'Kontroll',
};

const STATUS_ICON_MAP: Record<string, typeof Circle> = {
  not_started: Circle,
  in_progress: Play,
  blocked: Ban,
  done: CheckCircle2,
  cancelled: XCircle,
};

const EstablishmentGanttChart = ({
  rigDate,
  eventDate,
  bookingId,
  largeProjectId,
  startDate,
  endDate,
  client = 'Okänd kund',
  address,
  projectBookings = [],
  staffPool = [],
  onTaskClick,
  visibleTaskIds = null,
}: EstablishmentGanttChartProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [todayPosition, setTodayPosition] = useState(0);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [expandedGaps, setExpandedGaps] = useState<Set<number>>(new Set());
  const queryClient = useQueryClient();

  const isProjectMode = !!largeProjectId;
  const queryKey = isProjectMode
    ? ['establishment-tasks', 'project', largeProjectId]
    : ['establishment-tasks', bookingId];

  // Effective dates for generation
  const effectiveStartDate = rigDate || startDate;
  const effectiveEndDate = eventDate || endDate;

  // Fetch booking data for products list in dialog (only in booking mode)
  const { data: bookingData } = useQuery({
    queryKey: ['establishment-booking-data', bookingId],
    queryFn: () => fetchEstablishmentBookingData(bookingId!),
    enabled: !!bookingId && !isProjectMode,
  });

  // Fetch DB tasks
  const { data: dbTasks, isLoading: isLoadingTasks } = useQuery({
    queryKey,
    queryFn: async () => {
      if (isProjectMode) {
        const tasks = await fetchEstablishmentTasksByProject(largeProjectId!);
        if (tasks.length === 0 && effectiveStartDate && effectiveEndDate) {
          return await generateDefaultTasksForProject(largeProjectId!, effectiveStartDate, effectiveEndDate);
        }
        return tasks;
      } else {
        const tasks = await fetchEstablishmentTasks(bookingId!);
        if (tasks.length === 0 && rigDate && eventDate) {
          return await generateDefaultTasks(bookingId!, rigDate, eventDate);
        }
        return tasks;
      }
    },
    enabled: isProjectMode ? !!largeProjectId : !!bookingId,
  });

  // Fetch subtasks for progress
  const { data: allSubtasks = [] } = useQuery({
    queryKey: ['establishment-all-subtasks', bookingId],
    queryFn: () => fetchAllSubtasksForBooking(bookingId!),
    enabled: !!bookingId && !isProjectMode,
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

  const allTasks = dbTasks || [];
  const tasks = visibleTaskIds ? allTasks.filter(t => visibleTaskIds.has(t.id)) : allTasks;

  // ── Adaptive timeline: detect active days & gaps ──────────────
  const ganttData = useMemo(() => {
    if (tasks.length === 0) return null;

    const taskDates = tasks.map(t => ({
      ...t,
      startDate: startOfDay(new Date(t.start_date)),
      endDate: startOfDay(new Date(t.end_date)),
    }));

    const allDates = taskDates.flatMap(t => [t.startDate, t.endDate]);
    const minDate = subDays(min(allDates), 1);
    const maxDate = addDays(max(allDates), 1);
    const totalDays = differenceInDays(maxDate, minDate) + 1;

    const days: Date[] = [];
    for (let i = 0; i < totalDays; i++) {
      days.push(addDays(minDate, i));
    }

    // Mark which day indices have task activity
    const activeDayIndices = new Set<number>();
    for (const t of taskDates) {
      const s = differenceInDays(t.startDate, minDate);
      const e = differenceInDays(t.endDate, minDate);
      for (let i = Math.max(0, s - 1); i <= Math.min(totalDays - 1, e + 1); i++) {
        activeDayIndices.add(i);
      }
    }

    // Build segments: runs of active days separated by gaps
    type Segment = { type: 'days'; dayIndices: number[] } | { type: 'gap'; dayIndices: number[]; gapId: number };
    const segments: Segment[] = [];
    let gapCounter = 0;
    let i = 0;
    while (i < totalDays) {
      if (activeDayIndices.has(i)) {
        const run: number[] = [];
        while (i < totalDays && activeDayIndices.has(i)) {
          run.push(i);
          i++;
        }
        segments.push({ type: 'days', dayIndices: run });
      } else {
        const run: number[] = [];
        while (i < totalDays && !activeDayIndices.has(i)) {
          run.push(i);
          i++;
        }
        // Only collapse gaps of 2+ days
        if (run.length >= 2) {
          segments.push({ type: 'gap', dayIndices: run, gapId: gapCounter++ });
        } else {
          // Treat single empty days as regular days
          segments.push({ type: 'days', dayIndices: run });
        }
      }
    }

    return { taskDates, minDate, maxDate, totalDays, days, segments, activeDayIndices };
  }, [tasks]);

  const toggleGap = useCallback((gapId: number) => {
    setExpandedGaps(prev => {
      const next = new Set(prev);
      if (next.has(gapId)) next.delete(gapId);
      else next.add(gapId);
      return next;
    });
  }, []);

  // Build visible columns from segments
  const visibleColumns = useMemo(() => {
    if (!ganttData) return [];
    type Col = { type: 'day'; dayIndex: number; date: Date } | { type: 'gap'; gapId: number; count: number; dayIndices: number[] };
    const cols: Col[] = [];
    for (const seg of ganttData.segments) {
      if (seg.type === 'days') {
        for (const di of seg.dayIndices) {
          cols.push({ type: 'day', dayIndex: di, date: ganttData.days[di] });
        }
      } else {
        if (expandedGaps.has(seg.gapId)) {
          for (const di of seg.dayIndices) {
            cols.push({ type: 'day', dayIndex: di, date: ganttData.days[di] });
          }
        } else {
          cols.push({ type: 'gap', gapId: seg.gapId, count: seg.dayIndices.length, dayIndices: seg.dayIndices });
        }
      }
    }
    return cols;
  }, [ganttData, expandedGaps]);

  useEffect(() => {
    if (ganttData && scrollRef.current) {
      const today = startOfDay(new Date());
      const daysSinceStart = differenceInDays(today, ganttData.minDate);
      // Find column position of today
      let pos = 0;
      for (const col of visibleColumns) {
        if (col.type === 'day' && col.dayIndex === daysSinceStart) break;
        pos++;
      }
      setTodayPosition(daysSinceStart);
    }
  }, [ganttData, visibleColumns]);

  const handleToggleCompleted = async (task: EstablishmentTask) => {
    try {
      await updateEstablishmentTask(task.id, { completed: !task.completed });
      queryClient.invalidateQueries({ queryKey });
    } catch {
      toast.error("Kunde inte uppdatera status");
    }
  };

  const handleDeleteTask = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteEstablishmentTask(taskId);
      queryClient.invalidateQueries({ queryKey });
      toast.success("Aktivitet borttagen");
    } catch {
      toast.error("Kunde inte ta bort aktivitet");
    }
  };

  const invalidateTasks = () => {
    queryClient.invalidateQueries({ queryKey });
    setShowAddDialog(false);
  };

  const hasDates = isProjectMode ? (!!startDate || !!endDate) : (!!rigDate && !!eventDate);

  if (!hasDates) {
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
            {isProjectMode
              ? 'Ange projektperiod (start- och slutdatum) för att visa Gantt-schemat.'
              : 'Ingen rigg- eller eventdatum tillgängligt för denna bokning.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoadingTasks) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
        <CardContent className="text-center py-8 space-y-3">
          <p className="text-muted-foreground">Inga aktiviteter ännu.</p>
          <Button onClick={() => setShowAddDialog(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Lägg till aktivitet
          </Button>
        </CardContent>
      </Card>
    );
  }

  const dayWidth = 60;
  const rowHeight = 56;
  const headerHeight = 60;
  const taskLabelWidth = 360;
  const timelineWidth = ganttData.totalDays * dayWidth;
  const today = startOfDay(new Date());

  return (
    <>
      <Card className="flex flex-col">
        <CardHeader className="pb-2 flex-shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-primary" />
              Etablering - Gantt-schema
            </CardTitle>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4" />
              Lägg till aktivitet
            </Button>
          </div>

          {/* Compact booking summary - only in booking mode */}
          {!isProjectMode && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground pt-1">
              <span><strong className="text-foreground">{client}</strong></span>
              {address && <span>{address}</span>}
              {rigDate && <span>Rigg: {format(new Date(rigDate), 'd MMM', { locale: sv })}</span>}
              {eventDate && <span>Event: {format(new Date(eventDate), 'd MMM', { locale: sv })}</span>}
              {bookingData && (
                <span>{bookingData.products.filter(p => !p.isPackageComponent).length} produkter</span>
              )}
              {bookingData && bookingData.assignedStaff.length > 0 && (
                <span>{[...new Set(bookingData.assignedStaff.map(s => s.name))].length} personal</span>
              )}
            </div>
          )}
        </CardHeader>

        <CardContent className="p-0 flex flex-col">
          <div className="flex">
            {/* Task labels column */}
            <div className="flex-shrink-0 border-r bg-background z-10 flex flex-col" style={{ width: taskLabelWidth }}>
              <div
                className="border-b bg-muted/50 px-3 flex items-end pb-2 font-medium text-sm flex-shrink-0"
                style={{ height: headerHeight }}
              >
                Aktivitet
              </div>
              <div className="flex-1">
                {ganttData.taskDates.map((task) => {
                  const dbTask = tasks.find(t => t.id === task.id);
                  const IconComponent = CATEGORY_ICONS[task.category] || Wrench;
                  const status = (dbTask as any)?.status || 'not_started';
                  const readiness = (dbTask as any)?.readiness || 'missing_information';
                  const priority = (dbTask as any)?.priority || 'medium';
                  const hasBlockers = !!(dbTask as any)?.blockers;
                  const StatusIcon = STATUS_ICON_MAP[status] || Circle;
                  const statusConfig = STATUS_COLORS[status] || STATUS_COLORS.not_started;
                  const PriorityIcon = PRIORITY_CONFIG[priority]?.icon || ArrowRight;
                  const assignedName = (dbTask as any)?.assigned_to
                    ? staffPool.find(s => s.id === (dbTask as any).assigned_to)?.name
                    : null;

                  return (
                    <div
                      key={task.id}
                      className={cn(
                        "flex items-center gap-2 px-3 border-b cursor-pointer hover:bg-muted/50 transition-colors group",
                        status === 'done' && "opacity-60",
                        status === 'cancelled' && "opacity-40"
                      )}
                      style={{ height: rowHeight }}
                      onClick={() =>
                        onTaskClick?.({
                          id: task.id,
                          title: task.title,
                          category: task.category,
                          startDate: task.startDate,
                          endDate: task.endDate,
                          completed: task.completed,
                        })
                      }
                    >
                      {/* Status icon */}
                      <button
                        onClick={(e) => { e.stopPropagation(); if (dbTask) handleToggleCompleted(dbTask); }}
                        className="flex-shrink-0"
                      >
                        <StatusIcon className={cn("h-4 w-4", statusConfig.text)} />
                      </button>

                      {/* Priority indicator */}
                      <span className="flex-shrink-0">
                        <PriorityIcon className={cn("h-3 w-3", PRIORITY_CONFIG[priority]?.className)} />
                      </span>

                      {/* Category icon */}
                      <IconComponent className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />

                      {/* Title + metadata */}
                      <div className={cn("flex flex-col min-w-0 flex-1", status === 'done' && "opacity-60")}>
                        <div className="flex items-center gap-1.5">
                          <span className={cn("text-sm truncate", status === 'done' && "line-through text-muted-foreground")}>
                            {task.title}
                          </span>
                          {hasBlockers && (
                            <span className="flex-shrink-0">
                              <AlertTriangle className="h-3 w-3 text-destructive" />
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px]">
                          {/* Readiness badge */}
                          <span className={cn(
                            "px-1 py-0 rounded text-[9px] font-medium",
                            readiness === 'ready' ? 'bg-emerald-500/10 text-emerald-600' :
                            readiness === 'waiting_for_decision' ? 'bg-violet-500/10 text-violet-600' :
                            readiness === 'waiting_for_external' ? 'bg-amber-500/10 text-amber-600' :
                            'bg-muted text-muted-foreground'
                          )}>
                            {READINESS_LABELS[readiness] || readiness}
                          </span>

                          {/* Assigned person */}
                          {assignedName && (
                            <span className="text-muted-foreground truncate flex items-center gap-0.5">
                              <User className="h-2.5 w-2.5" />
                              {assignedName}
                            </span>
                          )}

                          {/* Linked booking in project mode */}
                          {isProjectMode && (task as any).booking_id && (() => {
                            const linkedBooking = projectBookings.find(b => b.booking_id === (task as any).booking_id);
                            return linkedBooking ? (
                              <span className="text-muted-foreground truncate">
                                • {linkedBooking.display_name || linkedBooking.client || linkedBooking.booking_id}
                              </span>
                            ) : null;
                          })()}
                        </div>
                      </div>

                      <button
                        onClick={(e) => handleDeleteTask(task.id, e)}
                        className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-0.5 rounded hover:bg-destructive/10 transition-all"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Scrollable timeline */}
            <div className="flex-1 overflow-x-auto" ref={scrollRef}>
              <div style={{ width: timelineWidth, minWidth: '100%' }}>
                {/* Date headers */}
                <div className="flex border-b bg-muted/50 sticky top-0 z-10" style={{ height: headerHeight }}>
                  {ganttData.days.map((day, index) => {
                    const isToday = differenceInDays(day, today) === 0;
                    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                    return (
                      <div
                        key={index}
                        className={cn(
                          "flex-shrink-0 flex flex-col items-center justify-end pb-1 border-r text-xs relative",
                          isWeekend && "bg-muted/70",
                          isToday && "bg-primary/15 font-bold"
                        )}
                        style={{ width: dayWidth }}
                      >
                        {isToday && (
                          <span className="absolute top-1 text-[9px] font-bold text-primary uppercase tracking-wider">Idag</span>
                        )}
                        <span className={cn("font-medium text-base", isToday && "text-primary font-bold")}>{format(day, 'd')}</span>
                        <span className={cn("text-muted-foreground", isToday && "text-primary/70")}>{format(day, 'EEE', { locale: sv })}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Task bars */}
                {ganttData.taskDates.map((task) => {
                  const startOffset = differenceInDays(task.startDate, ganttData.minDate);
                  const duration = differenceInDays(task.endDate, task.startDate) + 1;
                  const dbTask = tasks.find(t => t.id === task.id);
                  const taskStatus = (dbTask as any)?.status || 'not_started';
                  const assignedTo = (dbTask as any)?.assigned_to || null;
                  const assignedName = assignedTo ? staffPool.find(s => s.id === assignedTo)?.name : null;
                  const noOwner = !assignedTo && taskStatus !== 'done' && taskStatus !== 'cancelled';
                  const taskDecisionNeeded = (dbTask as any)?.decision_needed || false;
                  const taskReadiness = (dbTask as any)?.readiness || 'missing_information';
                  const isOverdue = taskStatus !== 'done' && taskStatus !== 'cancelled' && task.end_date && isBefore(startOfDay(new Date(task.end_date)), today);
                  const barWidth = Math.max(duration * dayWidth - 8, 32);

                  // Overlap detection: same person, overlapping dates
                  const hasPersonOverlap = assignedTo && ganttData.taskDates.some(other =>
                    other.id !== task.id &&
                    (tasks.find(t => t.id === other.id) as any)?.assigned_to === assignedTo &&
                    other.startDate <= task.endDate && other.endDate >= task.startDate
                  );

                  // Bar color based on status
                  const barColor = taskStatus === 'blocked' ? 'bg-destructive'
                    : taskStatus === 'done' ? 'bg-emerald-500'
                    : taskStatus === 'cancelled' ? 'bg-muted-foreground'
                    : isOverdue ? 'bg-destructive'
                    : taskStatus === 'in_progress' ? 'bg-primary'
                    : CATEGORY_COLORS[task.category] || 'bg-primary';

                  // Border style for warnings
                  const borderStyle = taskStatus === 'blocked' ? 'ring-2 ring-destructive/50 ring-offset-1 ring-offset-background'
                    : isOverdue ? 'ring-2 ring-destructive/40 ring-offset-1 ring-offset-background'
                    : noOwner ? 'ring-2 ring-amber-400/50 ring-offset-1 ring-offset-background'
                    : hasPersonOverlap ? 'ring-2 ring-orange-400/50 ring-offset-1 ring-offset-background'
                    : '';

                  return (
                    <div key={task.id} className="relative border-b" style={{ height: rowHeight }}>
                      {/* Day grid cells */}
                      <div className="absolute inset-0 flex">
                        {ganttData.days.map((day, dayIndex) => {
                          const isDayToday = differenceInDays(day, today) === 0;
                          const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                          return (
                            <div
                              key={dayIndex}
                              className={cn("flex-shrink-0 border-r", isWeekend && "bg-muted/30", isDayToday && "bg-primary/5")}
                              style={{ width: dayWidth }}
                            />
                          );
                        })}
                      </div>

                      {/* Strong today line */}
                      {todayPosition >= 0 && todayPosition < ganttData.totalDays && (
                        <div
                          className="absolute top-0 bottom-0 z-20 pointer-events-none"
                          style={{ left: todayPosition * dayWidth + dayWidth / 2 - 1 }}
                        >
                          <div className="w-0.5 h-full bg-primary" />
                        </div>
                      )}

                      {/* Task bar */}
                      <div
                        className={cn(
                          "absolute top-1.5 bottom-1.5 rounded-md cursor-pointer transition-all hover:brightness-110 shadow-sm flex flex-col justify-center overflow-hidden",
                          taskStatus === 'done' && "opacity-50",
                          taskStatus === 'cancelled' && "opacity-30",
                          barColor,
                          borderStyle,
                        )}
                        style={{ left: startOffset * dayWidth + 4, width: barWidth }}
                        onClick={() =>
                          onTaskClick?.({
                            id: task.id,
                            title: task.title,
                            category: task.category,
                            startDate: task.startDate,
                            endDate: task.endDate,
                            completed: task.completed,
                          })
                        }
                      >
                        {/* Task name + assigned user */}
                        <div className="px-2 flex items-center gap-1 min-w-0">
                          {taskStatus === 'blocked' && <Ban className="h-3 w-3 text-white/90 flex-shrink-0" />}
                          {isOverdue && taskStatus !== 'blocked' && <AlertTriangle className="h-3 w-3 text-white/90 flex-shrink-0" />}
                          {noOwner && !taskDecisionNeeded && <User className="h-3 w-3 text-white/70 flex-shrink-0" />}
                          {taskDecisionNeeded && <HelpCircle className="h-3 w-3 text-white/90 flex-shrink-0" />}
                          <span className="text-xs text-white font-semibold truncate leading-tight">
                            {task.title}
                          </span>
                          {subtasksByTask[task.id] && (
                            <span className="text-[10px] text-white/70 flex-shrink-0">
                              ({subtasksByTask[task.id].completed}/{subtasksByTask[task.id].total})
                            </span>
                          )}
                        </div>
                        {/* Second row: assigned name + status */}
                        <div className="px-2 flex items-center gap-1.5 min-w-0">
                          {assignedName ? (
                            <span className="text-[10px] text-white/80 truncate leading-tight">
                              {assignedName}
                            </span>
                          ) : noOwner ? (
                            <span className="text-[10px] text-white/60 italic leading-tight">
                              Ej tilldelad
                            </span>
                          ) : null}
                          {hasPersonOverlap && (
                            <span className="text-[9px] text-white/70 bg-white/15 rounded px-0.5 flex-shrink-0">
                              ⚠ Överlapp
                            </span>
                          )}
                          {taskDecisionNeeded && (
                            <span className="text-[9px] text-white/80 bg-white/15 rounded px-0.5 flex-shrink-0">
                              Beslut
                            </span>
                          )}
                          {taskReadiness === 'missing_information' && taskStatus !== 'done' && !taskDecisionNeeded && (
                            <span className="text-[9px] text-white/70 bg-white/10 rounded px-0.5 flex-shrink-0">
                              Saknar info
                            </span>
                          )}
                        </div>

                        {/* Subtask progress bar */}
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
          <div className="flex flex-wrap items-center gap-4 p-3 border-t text-xs text-muted-foreground flex-shrink-0">
            <div className="flex items-center gap-1">
              <div className="w-0.5 h-4 bg-primary" />
              <span>Idag</span>
            </div>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <div key={key} className="flex items-center gap-1">
                <div className={cn("w-4 h-3 rounded", CATEGORY_COLORS[key])} />
                <span>{label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1">
              <div className="w-4 h-3 rounded bg-destructive" />
              <span>Blockerad / Försenad</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-3 rounded bg-emerald-500" />
              <span>Klar</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-3 rounded ring-2 ring-amber-400/50 ring-offset-1 bg-muted" />
              <span>Saknar ägare</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-3 rounded ring-2 ring-orange-400/50 ring-offset-1 bg-muted" />
              <span>Överlapp</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <AddEstablishmentTaskDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        bookingId={bookingId || undefined}
        largeProjectId={largeProjectId || undefined}
        products={bookingData?.products || []}
        defaultDate={effectiveStartDate || null}
        onTaskCreated={invalidateTasks}
        projectBookings={projectBookings}
        staffPool={staffPool}
      />
    </>
  );
};

export default EstablishmentGanttChart;
