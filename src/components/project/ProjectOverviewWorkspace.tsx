import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import {
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  HardHat,
  MapPin,
  PackagePlus,
  Plus,
  ListTodo,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ProjectTask } from "@/types/project";
import type { ProjectWithBooking } from "@/types/project";
import QuickPlanningItemDialog, { type QuickPlanningMode } from "@/components/project/planning/QuickPlanningItemDialog";
import ActivityPlannerSheet from "@/components/project/ActivityPlannerSheet";
import { useBookingTaskAnalytics } from "@/hooks/useBookingTaskAnalytics";
import { fetchEstablishmentBookingData } from "@/services/establishmentPlanningService";
import { supabase } from "@/integrations/supabase/client";

interface ProjectOverviewWorkspaceProps {
  project: ProjectWithBooking;
  tasks: ProjectTask[];
  bookingId: string | null;
  onAddTask: (task: { title: string; description?: string; deadline?: string | null }) => void;
  onUpdateTask: (args: { id: string; updates: Partial<ProjectTask> }) => void;
}

const dateLabel = (value?: string | null) => {
  if (!value) return "—";
  try {
    return format(parseISO(value.slice(0, 10)), "d MMM", { locale: sv });
  } catch {
    return value.slice(0, 10);
  }
};

const ProjectOverviewWorkspace = ({ project, tasks, bookingId, onAddTask, onUpdateTask }: ProjectOverviewWorkspaceProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const quickInput = useRef<HTMLInputElement>(null);
  const [todoTitle, setTodoTitle] = useState("");
  const [quickDialogOpen, setQuickDialogOpen] = useState(false);
  const [quickMode, setQuickMode] = useState<QuickPlanningMode>("moment");
  const [plannerOpen, setPlannerOpen] = useState(false);

  const booking = project.booking;
  const rigDate = project.rigdaydate || booking?.rigdaydate || null;
  const eventDate = project.eventdate || booking?.eventdate || null;
  const rigDownDate = project.rigdowndate || booking?.rigdowndate || null;
  const address = project.deliveryaddress || booking?.deliveryaddress || "Ingen adress angiven";

  const openTasks = useMemo(
    () => tasks.filter((task) => !task.completed && !task.is_info_only),
    [tasks],
  );
  const completedCount = useMemo(
    () => tasks.filter((task) => task.completed && !task.is_info_only).length,
    [tasks],
  );

  const { analytics } = useBookingTaskAnalytics(bookingId);

  const { data: staffPool = [] } = useQuery({
    queryKey: ["booking-staff-pool", bookingId],
    queryFn: async () => {
      const { data } = await supabase
        .from("booking_staff_assignments")
        .select("staff_id")
        .eq("booking_id", bookingId!);
      const ids = [...new Set((data || []).map((row) => row.staff_id))];
      if (!ids.length) return [];
      const { data: staff } = await supabase
        .from("staff_members")
        .select("id, name")
        .in("id", ids)
        .order("name");
      return staff || [];
    },
    enabled: !!bookingId,
  });

  const { data: bookingPlanningData } = useQuery({
    queryKey: ["establishment-booking-data", bookingId],
    queryFn: () => fetchEstablishmentBookingData(bookingId!),
    enabled: !!bookingId,
    staleTime: 60_000,
  });

  const planningTasks = useMemo(
    () => [...analytics.tasks].sort((a, b) => {
      const av = `${a.start_date || "9999-12-31"}T${a.start_time || "23:59"}`;
      const bv = `${b.start_date || "9999-12-31"}T${b.start_time || "23:59"}`;
      return av.localeCompare(bv) || a.sort_order - b.sort_order;
    }),
    [analytics.tasks],
  );

  const planningPreview = planningTasks.slice(0, 6);

  const addTodo = () => {
    const title = todoTitle.trim();
    if (!title) return;
    onAddTask({ title });
    setTodoTitle("");
    requestAnimationFrame(() => quickInput.current?.focus());
  };

  const openQuick = (mode: QuickPlanningMode) => {
    setQuickMode(mode);
    setQuickDialogOpen(true);
  };

  const refreshPlanning = () => {
    queryClient.invalidateQueries({ queryKey: ["establishment-tasks-analytics-booking", bookingId] });
    queryClient.invalidateQueries({ queryKey: ["establishment-tasks", bookingId] });
    queryClient.invalidateQueries({ queryKey: ["project-task-calendar-events"] });
    queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
  };

  const staffName = (ids?: string[] | null, fallback?: string | null) => {
    const id = ids?.[0] || fallback;
    if (!id) return null;
    return staffPool.find((person) => person.id === id)?.name || null;
  };

  return (
    <div className="space-y-4">
      {/* Actual project overview: only facts the PM needs at a glance. */}
      <Card className="overflow-hidden border-border/60 shadow-sm">
        <div className="grid grid-cols-2 divide-x divide-y divide-border/50 md:grid-cols-4 md:divide-y-0">
          <OverviewFact icon={HardHat} label="Etablering" value={dateLabel(rigDate)} />
          <OverviewFact icon={CalendarDays} label="Event" value={dateLabel(eventDate)} />
          <OverviewFact icon={HardHat} label="Nedrigg" value={dateLabel(rigDownDate)} />
          <OverviewFact icon={MapPin} label="Plats" value={address} compact />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
        {/* TODOS */}
        <Card className="overflow-hidden border-border/60 shadow-sm">
          <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
            <div>
              <div className="flex items-center gap-2">
                <ListTodo className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">Att göra</h2>
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{openTasks.length}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">Projektets enkla todo-lista.</p>
            </div>
          </div>

          <div className="flex items-center gap-2 border-b border-border/40 bg-muted/15 p-3">
            <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              ref={quickInput}
              value={todoTitle}
              onChange={(event) => setTodoTitle(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && addTodo()}
              placeholder="Skriv en uppgift och tryck Enter…"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {todoTitle.trim() && (
              <Button size="sm" className="h-8" onClick={addTodo}>Lägg till</Button>
            )}
          </div>

          <div className="max-h-[430px] overflow-y-auto">
            {openTasks.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <Check className="mx-auto mb-2 h-6 w-6 text-emerald-600" />
                <p className="text-sm font-medium">Inget öppet just nu</p>
                <p className="mt-1 text-xs text-muted-foreground">Lägg till nästa sak som behöver göras ovan.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {openTasks.map((task) => (
                  <div key={task.id} className="flex items-start gap-3 px-4 py-3">
                    <button
                      type="button"
                      aria-label={`Markera ${task.title} som klar`}
                      onClick={() => onUpdateTask({ id: task.id, updates: { completed: true } })}
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border transition-colors hover:border-primary hover:bg-primary/5"
                    >
                      <Check className="h-3 w-3 opacity-0 hover:opacity-100" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug">{task.title}</p>
                      {(task.deadline || task.assigned_to) && (
                        <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                          {task.deadline && <span>{dateLabel(task.deadline)}</span>}
                          {task.assigned_to && <span>{task.assigned_to}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {completedCount > 0 && (
            <div className="border-t border-border/40 px-4 py-2 text-xs text-muted-foreground">
              {completedCount} klara uppgifter
            </div>
          )}
        </Card>

        {/* ESTABLISHMENT / BUILD SCHEDULE */}
        <Card className="overflow-hidden border-border/60 shadow-sm">
          <div className="flex flex-col gap-3 border-b border-border/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <HardHat className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">Etableringsschema</h2>
                {analytics.total > 0 && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{analytics.total} moment</Badge>}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">Vad byggs, när det sker och i vilken ordning.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => openQuick("moment")} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Moment
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPlannerOpen(true)} className="gap-1.5">
                <PackagePlus className="h-3.5 w-3.5" /> Från bokningen
              </Button>
              <Button size="sm" variant="outline" onClick={() => openQuick("calendar")} className="gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" /> Händelse
              </Button>
            </div>
          </div>

          {planningPreview.length === 0 ? (
            <div className="flex min-h-[310px] flex-col items-center justify-center px-6 text-center">
              <HardHat className="mb-3 h-7 w-7 text-primary" />
              <h3 className="text-sm font-semibold">Ingen etablering planerad ännu</h3>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">
                Skapa ett eget byggmoment eller välj delar direkt från bokningen. Du behöver bara ange vad, datum och tid.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button size="sm" onClick={() => openQuick("moment")}>+ Första momentet</Button>
                <Button size="sm" variant="outline" onClick={() => setPlannerOpen(true)}>Planera från bokningen</Button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {planningPreview.map((task) => {
                const person = staffName(task.assigned_to_ids, task.assigned_to);
                const calendarEvent = task.source === "calendar_manual" || task.category?.toLowerCase() === "kalender";
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => navigate("execution", { state: { highlightTaskId: task.id } })}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
                  >
                    <div className="w-[74px] shrink-0">
                      <p className="text-xs font-medium">{dateLabel(task.start_date)}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                        <Clock3 className="h-3 w-3" /> {task.start_time?.slice(0, 5) || "—"}{task.end_time ? `–${task.end_time.slice(0, 5)}` : ""}
                      </p>
                    </div>
                    <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", calendarEvent ? "bg-muted" : "bg-primary/10")}>
                      {calendarEvent ? <CalendarDays className="h-4 w-4 text-muted-foreground" /> : <HardHat className="h-4 w-4 text-primary" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={cn("truncate text-sm font-medium", task.status === "done" && "text-muted-foreground line-through")}>{task.title}</p>
                        {task.source === "product" && <Badge variant="outline" className="h-5 text-[9px]">Bokning</Badge>}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {[task.category, person].filter(Boolean).join(" · ") || "Planerat moment"}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={() => navigate("execution")}
            className="flex w-full items-center justify-between border-t border-border/50 px-4 py-3 text-sm font-medium text-primary transition-colors hover:bg-primary/5"
          >
            Öppna hela etableringsplaneringen
            <ChevronRight className="h-4 w-4" />
          </button>
        </Card>
      </div>

      <QuickPlanningItemDialog
        open={quickDialogOpen}
        onOpenChange={setQuickDialogOpen}
        mode={quickMode}
        bookingId={bookingId}
        defaultDate={rigDate || eventDate}
        staffPool={staffPool}
        onCreated={refreshPlanning}
      />

      <ActivityPlannerSheet
        open={plannerOpen}
        onOpenChange={setPlannerOpen}
        bookingId={bookingId || undefined}
        bookingName={booking?.booking_number || booking?.client || project.client || undefined}
        products={bookingPlanningData?.products || []}
        defaultDate={rigDate || eventDate}
        staffPool={staffPool}
        existingTasks={analytics.tasks}
        onTaskCreated={refreshPlanning}
      />
    </div>
  );
};

const OverviewFact = ({ icon: Icon, label, value, compact }: { icon: React.ElementType; label: string; value: string; compact?: boolean }) => (
  <div className="min-w-0 p-4">
    <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      <Icon className="h-3.5 w-3.5" /> {label}
    </div>
    <p className={cn("font-semibold", compact ? "truncate text-sm" : "text-base")}>{value}</p>
  </div>
);

export default ProjectOverviewWorkspace;
