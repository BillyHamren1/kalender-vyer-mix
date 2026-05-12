import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useOutletContext, useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { List, Users, CalendarDays, ClipboardList, Table as TableIcon } from "lucide-react";
import EstablishmentTaskDetailSheet from "@/components/project/EstablishmentTaskDetailSheet";
import ProjectCalendarView from "@/components/project/ProjectCalendarView";
import LargeProjectExcelView from "@/components/project/LargeProjectExcelView";
import ProjectControlPanel from "@/components/project/planning/ProjectControlPanel";
import type { OverviewFilter } from "@/components/project/planning/ProjectControlPanel";

import PlanningTaskList from "@/components/project/planning/PlanningTaskList";
import PlanningFilterBar, { applyFilters, hasActiveFilters, EMPTY_FILTERS, type PlanningFilters } from "@/components/project/planning/PlanningFilterBar";
import PeopleOverview from "@/components/project/planning/PeopleOverview";
import { useTaskAnalytics } from "@/hooks/useTaskAnalytics";
import { supabase } from "@/integrations/supabase/client";
import type { useLargeProjectDetail } from "@/hooks/useLargeProjectDetail";
import { getLargeProjectBookingLabel } from "@/lib/largeProjectBookingLabel";

type ViewMode = "list" | "people";

interface SelectedTask {
  id: string;
  title: string;
  category: string;
  startDate: Date;
  endDate: Date;
  completed: boolean;
}

const LargeEstablishmentPage = () => {
  const detail = useOutletContext<ReturnType<typeof useLargeProjectDetail>>();
  const { project } = detail;
  const [selectedTask, setSelectedTask] = useState<SelectedTask | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Auto-open task from calendar navigation
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
  const [pageMode, setPageMode] = useState<"plan" | "calendar">("plan");
  const [filters, setFilters] = useState<PlanningFilters>(EMPTY_FILTERS);
  const workspaceRef = useRef<HTMLDivElement>(null);




  const bookingIds = useMemo(() => {
    return (project?.bookings || [])
      .map(b => b.booking_id)
      .filter(Boolean);
  }, [project?.bookings]);

  const { data: staffPool = [] } = useQuery({
    queryKey: ['large-project-staff-pool', project?.id, bookingIds],
    queryFn: async () => {
      let staffIds: string[] = [];
      if (bookingIds.length > 0) {
        const { data } = await supabase
          .from('booking_staff_assignments')
          .select('staff_id')
          .in('booking_id', bookingIds);
        staffIds = [...new Set((data || []).map(d => d.staff_id))];
      }
      if (staffIds.length === 0) return [];
      const { data: staffData } = await supabase
        .from('staff_members')
        .select('id, name')
        .eq('is_active', true)
        .in('id', staffIds)
        .order('name');
      return staffData || [];
    },
    enabled: !!project?.id,
  });

  const { analytics } = useTaskAnalytics(project?.id);

  const filteredTasks = useMemo(() => {
    if (!hasActiveFilters(filters)) return analytics.tasks;
    return applyFilters(analytics.tasks, filters);
  }, [analytics.tasks, filters]);

  const visibleTaskIds = useMemo(() => {
    if (!hasActiveFilters(filters)) return null;
    return new Set(filteredTasks.map(t => t.id));
  }, [filteredTasks, filters]);

  const handleTaskClick = useCallback((task: SelectedTask) => {
    setSelectedTask(task);
    setSheetOpen(true);
  }, []);

  const handleOpenInChat = useCallback((_taskId: string, _taskTitle: string) => {
    // Samarbete-fliken är borttagen — anslagstavlan ligger på Översikt.
    setSheetOpen(false);
    navigate("..");
  }, [navigate]);

  const handleControlPanelTaskClick = useCallback((taskId: string) => {
    const task = analytics.tasks.find(t => t.id === taskId);
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
  }, [analytics.tasks]);

  const handleOverviewFilter = useCallback((filter: OverviewFilter) => {
    // Map overview filter to PlanningFilters
    const newFilters: PlanningFilters = { ...EMPTY_FILTERS };
    if (filter.section === "overdue") newFilters.quickFilter = "overdue";
    else if (filter.section === "today") newFilters.quickFilter = "today";
    else if (filter.section === "unassigned") newFilters.quickFilter = "unassigned";
    else if (filter.status === "done") newFilters.quickFilter = "completed";
    else if (filter.status) newFilters.status = filter.status as any;
    if (filter.person) newFilters.assignedTo = filter.person;

    setFilters(newFilters);
    setViewMode("list");
    // Scroll to workspace
    setTimeout(() => workspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }, []);

  if (!project) return null;

  const projectBookings = (project.bookings || []).map(b => ({
    booking_id: b.booking_id,
    display_name: getLargeProjectBookingLabel(b as any),
    client: (b as any).booking?.client || null,
  }));

  // Derive fallback dates from bookings when project has no explicit dates
  const bookingDates = (project.bookings || [])
    .map(b => b.booking)
    .filter(Boolean)
    .flatMap(bk => [bk!.rigdaydate, bk!.eventdate, bk!.rigdowndate].filter(Boolean) as string[]);
  const sortedBookingDates = bookingDates.sort();
  const fallbackStart = project.start_date?.[0] || (sortedBookingDates.length > 0 ? sortedBookingDates[0] : null);
  const fallbackEnd = project.end_date?.[project.end_date.length - 1] || (sortedBookingDates.length > 0 ? sortedBookingDates[sortedBookingDates.length - 1] : null);

  return (
    <div className="space-y-3">
      {/* Top toggle: Planera vs Kalender */}
      <div className="flex items-center justify-center">
        <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
          <Button
            variant={pageMode === "plan" ? "default" : "ghost"}
            size="sm"
            className="h-9 px-6 text-sm gap-2"
            onClick={() => setPageMode("plan")}
          >
            <ClipboardList className="h-4 w-4" />
            Planera
          </Button>
          <Button
            variant={pageMode === "calendar" ? "default" : "ghost"}
            size="sm"
            className="h-9 px-6 text-sm gap-2"
            onClick={() => setPageMode("calendar")}
          >
            <CalendarDays className="h-4 w-4" />
            Kalender
          </Button>
        </div>
      </div>

      {pageMode === "calendar" ? (
        <ProjectCalendarView projectId={project.id} isLargeProject={true} />
      ) : (
        <Card ref={workspaceRef} className="border-border/50 shadow-sm overflow-hidden">
          <div className="border-b border-border/40 px-3 py-2 flex items-center justify-end">
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

          <div className="mt-0 p-3 space-y-2">
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
                largeProjectId={project.id}
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
      )}

      <EstablishmentTaskDetailSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        task={selectedTask}
        bookingId={null}
        largeProjectId={project.id}
        staffPool={staffPool}
        projectBookings={projectBookings}
        onOpenInChat={handleOpenInChat}
      />
    </div>
  );
};

export default LargeEstablishmentPage;
