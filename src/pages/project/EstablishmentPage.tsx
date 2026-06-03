/**
 * EstablishmentPage — vanliga single-booking-projekt.
 * --------------------------------------------------------------------------
 * Använder LEGACY `ProjectCalendarView` (single-booking only). Stora projekt
 * har en separat sida: `LargeEstablishmentPage` med
 * `LargeProjectBookingPlannerCalendar`. Blanda inte ihop dem — projekt-
 * kalendern och personalkalendern är hårt separerade.
 */
import { useState, useMemo, useCallback, useEffect } from "react";
import { useOutletContext, useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { List, Users, ListChecks } from "lucide-react";
import EstablishmentTaskDetailSheet from "@/components/project/EstablishmentTaskDetailSheet";
import ProjectCalendarView from "@/components/project/ProjectCalendarView";
import PlanningTaskList from "@/components/project/planning/PlanningTaskList";
import PlanningFilterBar, { applyFilters, hasActiveFilters, EMPTY_FILTERS, type PlanningFilters } from "@/components/project/planning/PlanningFilterBar";
import PeopleOverview from "@/components/project/planning/PeopleOverview";
import { useBookingTaskAnalytics } from "@/hooks/useBookingTaskAnalytics";
import { supabase } from "@/integrations/supabase/client";
import type { useProjectDetail } from "@/hooks/useProjectDetail";

type ViewMode = "list" | "people";

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
  const [selectedTask, setSelectedTask] = useState<SelectedTask | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const tid = (location.state as any)?.highlightTaskId;
    if (tid) {
      window.history.replaceState({}, document.title);
      supabase
        .from("establishment_tasks")
        .select("id, title, category, start_date, end_date, completed")
        .eq("id", tid)
        .single()
        .then(({ data }) => {
          if (data) {
            setSelectedTask({
              id: data.id,
              title: data.title,
              category: data.category,
              startDate: new Date(data.start_date),
              endDate: new Date(data.end_date),
              completed: data.completed ?? false,
            });
            setSheetOpen(true);
          }
        });
    }
  }, [location.state]);

  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [filters, setFilters] = useState<PlanningFilters>(EMPTY_FILTERS);

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

  const { analytics } = useBookingTaskAnalytics(bookingId);

  const filteredTasks = useMemo(() => {
    if (!hasActiveFilters(filters)) return analytics.tasks;
    return applyFilters(analytics.tasks, filters);
  }, [analytics.tasks, filters]);

  const handleTaskClick = useCallback((task: SelectedTask) => {
    setSelectedTask(task);
    setSheetOpen(true);
  }, []);

  const handleOpenInChat = useCallback(
    (taskId: string, taskTitle: string) => {
      setSheetOpen(false);
      navigate("..", { state: { linkedTaskRef: { taskId, taskTitle } } });
    },
    [navigate]
  );

  const handleControlPanelTaskClick = useCallback(
    (taskId: string) => {
      const task = analytics.tasks.find((t) => t.id === taskId);
      if (task) {
        setSelectedTask({
          id: task.id,
          title: task.title,
          category: task.category,
          startDate: new Date(task.start_date),
          endDate: new Date(task.end_date),
          completed: task.completed,
        });
        setSheetOpen(true);
      }
    },
    [analytics.tasks]
  );

  if (!project) return null;

  const planningPanel = (
    <Card className="flex h-full min-h-[600px] flex-col overflow-hidden border-border/60">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-primary/5 px-3 py-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <ListChecks className="h-4 w-4 text-primary" />
          Planera projektet
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
          <Button
            variant={viewMode === "list" ? "default" : "ghost"}
            size="sm"
            className="h-7 px-2.5 text-xs gap-1"
            onClick={() => setViewMode("list")}
          >
            <List className="h-3.5 w-3.5" />
            Lista
          </Button>
          <Button
            variant={viewMode === "people" ? "default" : "ghost"}
            size="sm"
            className="h-7 px-2.5 text-xs gap-1"
            onClick={() => setViewMode("people")}
          >
            <Users className="h-3.5 w-3.5" />
            Personal
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-2 space-y-2">
        <PlanningFilterBar
          tasks={analytics.tasks}
          filters={filters}
          onFiltersChange={setFilters}
          staffPool={staffPool}
          filteredCount={filteredTasks.length}
        />
        {viewMode === "list" ? (
          <PlanningTaskList
            tasks={filteredTasks}
            staffPool={staffPool}
            onTaskClick={handleTaskClick}
            bookingId={bookingId}
          />
        ) : (
          <PeopleOverview
            analytics={analytics}
            staffPool={staffPool}
            onTaskClick={handleControlPanelTaskClick}
          />
        )}
      </div>
    </Card>
  );

  return (
    <div className="space-y-3">
      <ProjectCalendarView
        projectId={project.id}
        bookingId={bookingId}
        isLargeProject={false}
        compactHeader
        rightPanel={planningPanel}
      />

      <EstablishmentTaskDetailSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        task={selectedTask}
        bookingId={bookingId}
        staffPool={staffPool}
        projectId={project?.id}
        onOpenInChat={handleOpenInChat}
      />
    </div>
  );
};

export default EstablishmentPage;
