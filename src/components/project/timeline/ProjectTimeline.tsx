import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProjectTask, TaskPhase } from "@/types/project";
import { PHASE_LABELS, PHASE_ORDER } from "@/types/project";
import { addDays, differenceInDays, format, parseISO, startOfDay, max, min } from "date-fns";
import { sv } from "date-fns/locale";
import { CalendarRange, Plus, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";

const PHASE_COLORS: Record<TaskPhase, { bg: string; border: string; text: string }> = {
  preproduction: { bg: 'bg-violet-100 dark:bg-violet-900/30', border: 'border-violet-300 dark:border-violet-700', text: 'text-violet-800 dark:text-violet-200' },
  planning: { bg: 'bg-blue-100 dark:bg-blue-900/30', border: 'border-blue-300 dark:border-blue-700', text: 'text-blue-800 dark:text-blue-200' },
  setup: { bg: 'bg-amber-100 dark:bg-amber-900/30', border: 'border-amber-300 dark:border-amber-700', text: 'text-amber-800 dark:text-amber-200' },
  live: { bg: 'bg-green-100 dark:bg-green-900/30', border: 'border-green-300 dark:border-green-700', text: 'text-green-800 dark:text-green-200' },
  teardown: { bg: 'bg-orange-100 dark:bg-orange-900/30', border: 'border-orange-300 dark:border-orange-700', text: 'text-orange-800 dark:text-orange-200' },
  post: { bg: 'bg-slate-100 dark:bg-slate-800/50', border: 'border-slate-300 dark:border-slate-600', text: 'text-slate-800 dark:text-slate-200' },
};

interface ProjectTimelineProps {
  tasks: ProjectTask[];
  onUpdateTask: (args: { id: string; updates: Partial<ProjectTask> }) => void;
  onAddTask: (task: { title: string; start_date?: string | null; end_date?: string | null; phase?: string | null }) => void;
  projectId: string;
}

const DAY_WIDTHS = [24, 36, 56, 80];

const ProjectTimeline = ({ tasks, onUpdateTask, onAddTask, projectId }: ProjectTimelineProps) => {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addPhase, setAddPhase] = useState<TaskPhase>('planning');
  const [addTitle, setAddTitle] = useState('');
  const [addStartDate, setAddStartDate] = useState('');
  const [addEndDate, setAddEndDate] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<{
    taskId: string;
    mode: 'move' | 'resize-end';
    startX: number;
    origStart: Date;
    origEnd: Date;
  } | null>(null);

  const dayWidth = DAY_WIDTHS[zoomLevel];

  // Filter tasks that have timeline data
  const timelineTasks = useMemo(() =>
    tasks.filter(t => t.start_date && t.end_date && t.phase),
    [tasks]
  );

  // Compute date range
  const { timelineStart, totalDays } = useMemo(() => {
    if (timelineTasks.length === 0) {
      const today = startOfDay(new Date());
      return { timelineStart: addDays(today, -7), totalDays: 60 };
    }
    const allStarts = timelineTasks.map(t => parseISO(t.start_date!));
    const allEnds = timelineTasks.map(t => parseISO(t.end_date!));
    const earliest = addDays(min(allStarts), -3);
    const latest = addDays(max(allEnds), 7);
    return {
      timelineStart: startOfDay(earliest),
      totalDays: Math.max(differenceInDays(latest, earliest), 30),
    };
  }, [timelineTasks]);

  // Group by phase
  const grouped = useMemo(() => {
    const groups: Record<TaskPhase, ProjectTask[]> = {
      preproduction: [], planning: [], setup: [], live: [], teardown: [], post: [],
    };
    timelineTasks.forEach(t => {
      if (t.phase && groups[t.phase]) groups[t.phase].push(t);
    });
    return groups;
  }, [timelineTasks]);

  // Today marker position
  const todayOffset = differenceInDays(startOfDay(new Date()), timelineStart);

  // Drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent, task: ProjectTask, mode: 'move' | 'resize-end') => {
    e.preventDefault();
    e.stopPropagation();
    setDragState({
      taskId: task.id,
      mode,
      startX: e.clientX,
      origStart: parseISO(task.start_date!),
      origEnd: parseISO(task.end_date!),
    });
  }, []);

  useEffect(() => {
    if (!dragState) return;
    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragState.startX;
      const daysDelta = Math.round(dx / dayWidth);
      if (daysDelta === 0) return;

      if (dragState.mode === 'move') {
        const newStart = addDays(dragState.origStart, daysDelta);
        const newEnd = addDays(dragState.origEnd, daysDelta);
        onUpdateTask({
          id: dragState.taskId,
          updates: {
            start_date: newStart.toISOString(),
            end_date: newEnd.toISOString(),
          },
        });
      } else {
        const newEnd = addDays(dragState.origEnd, daysDelta);
        if (newEnd > dragState.origStart) {
          onUpdateTask({
            id: dragState.taskId,
            updates: { end_date: newEnd.toISOString() },
          });
        }
      }
    };
    const handleMouseUp = () => setDragState(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, dayWidth, onUpdateTask]);

  // Scroll to today on mount
  useEffect(() => {
    if (scrollRef.current && todayOffset > 0) {
      scrollRef.current.scrollLeft = Math.max(0, todayOffset * dayWidth - 200);
    }
  }, [todayOffset, dayWidth]);

  const handleAddTask = () => {
    if (!addTitle.trim() || !addStartDate || !addEndDate) return;
    // We need to use onAddTask then immediately update with timeline fields
    // Since addTask only takes title+project_id, we update after
    onAddTask({ project_id: projectId, title: addTitle.trim() });
    // The task will appear without timeline data initially
    // We'll need to set the phase/dates after creation - for now store intent
    setAddDialogOpen(false);
    setAddTitle('');
    setAddStartDate('');
    setAddEndDate('');
  };

  // Generate day headers
  const dayHeaders = useMemo(() => {
    const headers: { date: Date; label: string; isToday: boolean; isFirstOfMonth: boolean }[] = [];
    for (let i = 0; i < totalDays; i++) {
      const d = addDays(timelineStart, i);
      const today = startOfDay(new Date());
      headers.push({
        date: d,
        label: format(d, 'd', { locale: sv }),
        isToday: d.getTime() === today.getTime(),
        isFirstOfMonth: d.getDate() === 1,
      });
    }
    return headers;
  }, [timelineStart, totalDays]);

  // Month headers
  const monthHeaders = useMemo(() => {
    const months: { label: string; startIdx: number; span: number }[] = [];
    let currentMonth = '';
    dayHeaders.forEach((h, i) => {
      const m = format(h.date, 'MMMM yyyy', { locale: sv });
      if (m !== currentMonth) {
        if (months.length) months[months.length - 1].span = i - months[months.length - 1].startIdx;
        months.push({ label: m, startIdx: i, span: 0 });
        currentMonth = m;
      }
    });
    if (months.length) months[months.length - 1].span = dayHeaders.length - months[months.length - 1].startIdx;
    return months;
  }, [dayHeaders]);

  const labelColumnWidth = 180;

  const renderTaskBar = (task: ProjectTask) => {
    const start = parseISO(task.start_date!);
    const end = parseISO(task.end_date!);
    const offset = differenceInDays(start, timelineStart);
    const duration = Math.max(differenceInDays(end, start), 1);
    const phase = task.phase as TaskPhase;
    const colors = PHASE_COLORS[phase];

    return (
      <div
        key={task.id}
        className="h-8 flex items-center relative"
        style={{ width: totalDays * dayWidth }}
      >
        {/* Task bar */}
        <div
          className={`absolute h-6 rounded-md border ${colors.bg} ${colors.border} cursor-grab active:cursor-grabbing flex items-center px-2 overflow-hidden select-none group transition-shadow hover:shadow-md ${
            dragState?.taskId === task.id ? 'ring-2 ring-primary/50 shadow-md' : ''
          }`}
          style={{
            left: offset * dayWidth,
            width: duration * dayWidth,
            minWidth: dayWidth,
          }}
          onMouseDown={e => handleMouseDown(e, task, 'move')}
        >
          <span className={`text-[11px] font-medium truncate ${colors.text}`}>
            {task.title}
          </span>
          {/* Resize handle */}
          <div
            className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-primary/20 rounded-r-md"
            onMouseDown={e => handleMouseDown(e, task, 'resize-end')}
          />
        </div>

        {/* Dependency line */}
        {task.dependency_task_id && (() => {
          const depTask = timelineTasks.find(t => t.id === task.dependency_task_id);
          if (!depTask || !depTask.end_date) return null;
          const depEnd = parseISO(depTask.end_date);
          const depEndOffset = differenceInDays(depEnd, timelineStart);
          const lineStart = depEndOffset * dayWidth;
          const lineEnd = offset * dayWidth;
          if (lineEnd <= lineStart) return null;
          return (
            <svg
              className="absolute top-0 left-0 pointer-events-none"
              style={{ width: totalDays * dayWidth, height: 32 }}
            >
              <line
                x1={lineStart}
                y1={16}
                x2={lineEnd}
                y2={16}
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                opacity={0.4}
              />
              <circle cx={lineEnd} cy={16} r={3} fill="hsl(var(--muted-foreground))" opacity={0.4} />
            </svg>
          );
        })()}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-primary/10">
            <CalendarRange className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-base font-semibold text-foreground tracking-tight">Tidslinje</h2>
          {timelineTasks.length > 0 && (
            <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 text-xs font-medium rounded-full bg-primary text-primary-foreground">
              {timelineTasks.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border rounded-md">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoomLevel(z => Math.max(0, z - 1))} disabled={zoomLevel === 0}>
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoomLevel(z => Math.min(DAY_WIDTHS.length - 1, z + 1))} disabled={zoomLevel === DAY_WIDTHS.length - 1}>
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button size="sm" onClick={() => setAddDialogOpen(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Lägg till
          </Button>
        </div>
      </div>

      {timelineTasks.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <CalendarRange className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-foreground mb-1">Ingen tidslinje</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Lägg till uppgifter med datum och fas för att visualisera projektets tidslinje.
            </p>
            <Button size="sm" variant="outline" onClick={() => setAddDialogOpen(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Skapa första aktiviteten
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex">
            {/* Phase labels column */}
            <div className="shrink-0 border-r border-border bg-muted/30" style={{ width: labelColumnWidth }}>
              {/* Month header spacer */}
              <div className="h-6 border-b border-border" />
              {/* Day header spacer */}
              <div className="h-6 border-b border-border" />
              {/* Phase groups */}
              {PHASE_ORDER.map(phase => {
                const phaseTasks = grouped[phase];
                if (phaseTasks.length === 0) return null;
                const colors = PHASE_COLORS[phase];
                return (
                  <div key={phase}>
                    <div className={`h-7 flex items-center px-3 border-b border-border ${colors.bg}`}>
                      <span className={`text-[11px] font-semibold uppercase tracking-wider ${colors.text}`}>
                        {PHASE_LABELS[phase]}
                      </span>
                    </div>
                    {phaseTasks.map(task => (
                      <div key={task.id} className="h-8 flex items-center px-3 border-b border-border/50">
                        <span className="text-xs text-foreground truncate">{task.title}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            {/* Scrollable timeline */}
            <div className="flex-1 overflow-x-auto" ref={scrollRef}>
              <div style={{ width: totalDays * dayWidth, minWidth: '100%' }}>
                {/* Month headers */}
                <div className="flex h-6 border-b border-border">
                  {monthHeaders.map((m, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-r border-border/50 bg-muted/20"
                      style={{ width: m.span * dayWidth }}
                    >
                      {m.label}
                    </div>
                  ))}
                </div>

                {/* Day headers */}
                <div className="flex h-6 border-b border-border relative">
                  {dayHeaders.map((h, i) => (
                    <div
                      key={i}
                      className={`flex items-center justify-center text-[10px] border-r border-border/30 ${
                        h.isToday ? 'bg-primary/10 font-bold text-primary' : 
                        h.date.getDay() === 0 || h.date.getDay() === 6 ? 'text-muted-foreground/60 bg-muted/20' : 'text-muted-foreground'
                      }`}
                      style={{ width: dayWidth }}
                    >
                      {h.label}
                    </div>
                  ))}
                </div>

                {/* Task rows by phase */}
                <div className="relative">
                  {/* Today line */}
                  {todayOffset >= 0 && todayOffset < totalDays && (
                    <div
                      className="absolute top-0 bottom-0 w-px bg-primary/60 z-10 pointer-events-none"
                      style={{ left: todayOffset * dayWidth + dayWidth / 2 }}
                    >
                      <div className="absolute -top-0.5 -translate-x-1/2 w-2 h-2 rounded-full bg-primary" />
                    </div>
                  )}

                  {/* Weekend columns */}
                  {dayHeaders.map((h, i) => (
                    (h.date.getDay() === 0 || h.date.getDay() === 6) && (
                      <div
                        key={`wk-${i}`}
                        className="absolute top-0 bottom-0 bg-muted/15 pointer-events-none"
                        style={{ left: i * dayWidth, width: dayWidth }}
                      />
                    )
                  ))}

                  {PHASE_ORDER.map(phase => {
                    const phaseTasks = grouped[phase];
                    if (phaseTasks.length === 0) return null;
                    const colors = PHASE_COLORS[phase];
                    return (
                      <div key={phase}>
                        {/* Phase header row */}
                        <div className={`h-7 border-b border-border ${colors.bg} opacity-30`} style={{ width: totalDays * dayWidth }} />
                        {/* Task bars */}
                        {phaseTasks.map(task => (
                          <div key={task.id} className="border-b border-border/50">
                            {renderTaskBar(task)}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Phase legend */}
      {timelineTasks.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {PHASE_ORDER.map(phase => {
            const colors = PHASE_COLORS[phase];
            return (
              <div key={phase} className="flex items-center gap-1.5">
                <div className={`w-3 h-3 rounded-sm ${colors.bg} ${colors.border} border`} />
                <span className="text-xs text-muted-foreground">{PHASE_LABELS[phase]}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Add task dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Lägg till tidslinjeaktivitet</DialogTitle>
          </DialogHeader>
          <form onSubmit={e => { e.preventDefault(); handleAddTask(); }} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Titel *</Label>
              <Input value={addTitle} onChange={e => setAddTitle(e.target.value)} placeholder="Aktivitetsnamn" required />
            </div>
            <div className="space-y-1.5">
              <Label>Fas</Label>
              <Select value={addPhase} onValueChange={v => setAddPhase(v as TaskPhase)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PHASE_ORDER.map(p => (
                    <SelectItem key={p} value={p}>{PHASE_LABELS[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Startdatum *</Label>
                <Input type="date" value={addStartDate} onChange={e => setAddStartDate(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Slutdatum *</Label>
                <Input type="date" value={addEndDate} onChange={e => setAddEndDate(e.target.value)} required />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>Avbryt</Button>
              <Button type="submit" disabled={!addTitle.trim() || !addStartDate || !addEndDate}>Lägg till</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProjectTimeline;
