/**
 * EstablishmentPage — enkel operativ planering för vanliga single-booking-projekt.
 *
 * UX-princip:
 * - Tidslinjen är standardvyn: vad händer, när och vem ansvarar.
 * - Kalendern är en alternativ vy av samma genomförande och behåller befintlig kalenderfunktionalitet.
 * - Personal ligger separat och ska inte dominera den dagliga projektplaneringen.
 * - Bokningens produkter kan användas som underlag för verkliga bygg-/etableringsmoment.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, GanttChart, HardHat, PackagePlus, Plus, Users, Truck } from "lucide-react";
import EstablishmentTaskDetailSheet from "@/components/project/EstablishmentTaskDetailSheet";
import PeopleOverview from "@/components/project/planning/PeopleOverview";
import ProjectPlanningHeader from "@/components/project/ProjectPlanningHeader";
import SimplePlanningTimeline from "@/components/project/planning/SimplePlanningTimeline";
import { LargeProjectGanttChart, type GanttStep } from "@/components/project/LargeProjectGanttChart";
import QuickPlanningItemDialog, { type QuickPlanningMode } from "@/components/project/planning/QuickPlanningItemDialog";
import ActivityPlannerSheet from "@/components/project/ActivityPlannerSheet";
import TransportPlanningDialog from "@/components/logistics/TransportPlanningDialog";
import { useBookingTaskAnalytics } from "@/hooks/useBookingTaskAnalytics";
import { fetchEstablishmentBookingData } from "@/services/establishmentPlanningService";
import { supabase } from "@/integrations/supabase/client";
import type { EstablishmentTask } from "@/services/establishmentTaskService";
import type { useProjectDetail } from "@/hooks/useProjectDetail";

 type ViewMode = "timeline" | "gantt" | "people";

interface SelectedTask {
  id: string;
  title: string;
  category: string;
  startDate: Date;
  endDate: Date;
  completed: boolean;
}

const EstablishmentPage = () => {
  const detail = useOutletContext<ReturnType<typeof useProjectDetail>>();
  const { project } = detail;
  const booking = project?.booking;
  const bookingId = booking?.id || project?.booking_id || null;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  const [viewMode, setViewMode] = useState<ViewMode>("timeline");
  const [selectedTask, setSelectedTask] = useState<SelectedTask | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [quickDialogOpen, setQuickDialogOpen] = useState(false);
  const [quickMode, setQuickMode] = useState<QuickPlanningMode>("moment");
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [transportOpen, setTransportOpen] = useState(false);

  const defaultDate = booking?.rigdaydate || booking?.eventdate || null;

  const { data: staffPool = [] } = useQuery({
    queryKey: ["booking-staff-pool", bookingId],
    queryFn: async () => {
      const { data } = await supabase
        .from("booking_staff_assignments")
        .select("staff_id")
        .eq("booking_id", bookingId!);
      const uniqueIds = [...new Set((data || []).map((r) => r.staff_id))];
      if (uniqueIds.length === 0) return [];
      const { data: staffData } = await supabase
        .from("staff_members")
        .select("id, name")
        .in("id", uniqueIds)
        .order("name");
      return staffData || [];
    },
    enabled: !!bookingId,
  });

  const { data: bookingPlanningData } = useQuery({
    queryKey: ["establishment-booking-data", bookingId],
    queryFn: () => fetchEstablishmentBookingData(bookingId!),
    enabled: !!bookingId,
    staleTime: 60_000,
  });

  const { analytics } = useBookingTaskAnalytics(bookingId);

  const refreshPlanning = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["establishment-tasks-analytics-booking", bookingId] });
    queryClient.invalidateQueries({ queryKey: ["establishment-tasks", bookingId] });
    queryClient.invalidateQueries({ queryKey: ["project-task-calendar-events"] });
    queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
  }, [bookingId, queryClient]);

  const openTask = useCallback((task: EstablishmentTask | SelectedTask) => {
    setSelectedTask({
      id: task.id,
      title: task.title,
      category: task.category,
      startDate: new Date((task as EstablishmentTask).start_date || (task as SelectedTask).startDate),
      endDate: new Date((task as EstablishmentTask).end_date || (task as SelectedTask).endDate),
      completed: task.completed,
    });
    setSheetOpen(true);
  }, []);

  useEffect(() => {
    const tid = (location.state as any)?.highlightTaskId;
    if (!tid) return;
    window.history.replaceState({}, document.title);
    supabase
      .from("establishment_tasks")
      .select("id, title, category, start_date, end_date, completed")
      .eq("id", tid)
      .single()
      .then(({ data }) => {
        if (data) openTask(data as any);
      });
  }, [location.state, openTask]);

  const handleOpenInChat = useCallback((taskId: string, taskTitle: string) => {
    setSheetOpen(false);
    navigate("..", { state: { linkedTaskRef: { taskId, taskTitle } } });
  }, [navigate]);

  const openQuick = (mode: QuickPlanningMode) => {
    setQuickMode(mode);
    setQuickDialogOpen(true);
  };

  const ganttProductLabel = useCallback((task: any): string | null => {
    const all = (bookingPlanningData?.products || []) as Array<{ id: string; name: string; quantity?: number | null }>;
    const ids: string[] = task.source_product_ids?.length
      ? task.source_product_ids
      : task.source_product_id
        ? [task.source_product_id]
        : [];
    const names = ids
      .map((id) => all.find((p) => p.id === id))
      .filter(Boolean)
      .map((p) => `${p!.name}${p!.quantity && p!.quantity > 1 ? ` ×${p!.quantity}` : ""}`);
    return names.length ? names.join(" · ") : null;
  }, [bookingPlanningData?.products]);

  const progressText = useMemo(() => {
    if (analytics.total === 0) return "Ingen planering skapad";
    return `${analytics.completed} av ${analytics.total} klara`;
  }, [analytics.completed, analytics.total]);

  if (!project) return null;

  return (
    <div className="space-y-4">
      <ProjectPlanningHeader
        title="Planering"
        description="Planera etablering, byggmoment, tider och kalenderhändelser. Börja enkelt i tidslinjen och öppna kalender eller personal först när du behöver det."
        bookingCount={1}
        taskCount={analytics.total}
        completedCount={analytics.completed}
        modeLabel="Enskild leverans"
      />

      <Card className="border-border/60 shadow-sm">
        <div className="flex flex-col gap-3 p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => openQuick("moment")} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Nytt moment
            </Button>
            <Button variant="outline" onClick={() => setPlannerOpen(true)} className="gap-1.5">
              <PackagePlus className="h-4 w-4" />
              Planera från bokningen
            </Button>
            <Button variant="outline" onClick={() => openQuick("calendar")} className="gap-1.5">
              <CalendarDays className="h-4 w-4" />
              Kalenderhändelse
            </Button>
            <Button variant="outline" onClick={() => setTransportOpen(true)} className="gap-1.5" disabled={!bookingId}>
              <Truck className="h-4 w-4" />
              Planera transport
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="h-8 px-3 font-normal text-muted-foreground">{progressText}</Badge>
            <div className="flex rounded-lg border border-border/60 bg-muted/25 p-1">
              <Button
                variant={viewMode === "timeline" ? "default" : "ghost"}
                size="sm"
                className="h-8 gap-1.5 px-3"
                onClick={() => setViewMode("timeline")}
              >
                <HardHat className="h-3.5 w-3.5" /> Tidslinje
              </Button>
              <Button
                variant={viewMode === "gantt" ? "default" : "ghost"}
                size="sm"
                className="h-8 gap-1.5 px-3"
                onClick={() => setViewMode("gantt")}
              >
                <GanttChart className="h-3.5 w-3.5" /> Gantt
              </Button>
              <Button
                variant={viewMode === "people" ? "default" : "ghost"}
                size="sm"
                className="h-8 gap-1.5 px-3"
                onClick={() => setViewMode("people")}
              >
                <Users className="h-3.5 w-3.5" /> Personal
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {viewMode === "timeline" && (
        <SimplePlanningTimeline
          tasks={analytics.tasks}
          staffPool={staffPool}
          products={bookingPlanningData?.products || []}
          onTaskClick={openTask}
          onCreateMoment={() => openQuick("moment")}
          onPlanFromBooking={() => setPlannerOpen(true)}
        />
      )}

      {viewMode === "gantt" && (
        <div className="space-y-2">
          <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            Gantt-vyn visar aktiviteternas datum och tider över projektets period.
          </div>
          <LargeProjectGanttChart
            steps={analytics.tasks
              .filter((t) => t.start_date && t.end_date)
              .map((t): GanttStep => ({
                id: t.id,
                key: `task-${t.id}`,
                name: t.title,
                subtitle: ganttProductLabel(t),
                start_date: t.start_date,
                end_date: t.end_date,
                start_time: t.start_time,
                end_time: t.end_time,
                is_milestone: false,
                sort_order: t.sort_order,
              }))}
          />
        </div>
      )}

      {viewMode === "people" && (
        <Card className="border-border/60 p-3 sm:p-4 shadow-sm">
          <div className="mb-3">
            <h3 className="text-sm font-semibold">Personal</h3>
            <p className="text-xs text-muted-foreground">Se vem som ansvarar för vad. Själva bemanningen fortsätter följa projektets befintliga personalregler.</p>
          </div>
          <PeopleOverview
            analytics={analytics}
            staffPool={staffPool}
            onTaskClick={(taskId) => {
              const task = analytics.tasks.find((t) => t.id === taskId);
              if (task) openTask(task);
            }}
          />
        </Card>
      )}

      <QuickPlanningItemDialog
        open={quickDialogOpen}
        onOpenChange={setQuickDialogOpen}
        mode={quickMode}
        bookingId={bookingId}
        defaultDate={defaultDate}
        staffPool={staffPool}
        onCreated={refreshPlanning}
      />

      <TransportPlanningDialog
        bookingId={bookingId}
        open={transportOpen}
        onOpenChange={setTransportOpen}
        defaultDate={defaultDate}
        onSaved={refreshPlanning}
      />

      <ActivityPlannerSheet
        open={plannerOpen}
        onOpenChange={setPlannerOpen}
        bookingId={bookingId || undefined}
        bookingName={booking?.booking_number || booking?.client || undefined}
        products={bookingPlanningData?.products || []}
        defaultDate={defaultDate}
        staffPool={staffPool}
        existingTasks={analytics.tasks}
        onTaskCreated={refreshPlanning}
      />

      <EstablishmentTaskDetailSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        task={selectedTask}
        bookingId={bookingId}
        staffPool={staffPool}
        projectId={project.id}
        onOpenInChat={handleOpenInChat}
      />
    </div>
  );
};

export default EstablishmentPage;
