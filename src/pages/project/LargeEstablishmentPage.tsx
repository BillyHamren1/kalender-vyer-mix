import { useState, useMemo, useCallback, useEffect } from "react";
import { useOutletContext, useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { CalendarDays, Table as TableIcon } from "lucide-react";
import EstablishmentTaskDetailSheet from "@/components/project/EstablishmentTaskDetailSheet";
import ProjectCalendarView from "@/components/project/ProjectCalendarView";
import LargeProjectExcelView from "@/components/project/LargeProjectExcelView";
import LargeProjectPlannerPanel from "@/components/project/large-planner/LargeProjectPlannerPanel";
import { useLargeProjectPlannerCalendarEvents } from "@/components/project/large-planner/useLargeProjectPlannerCalendarEvents";
import { supabase } from "@/integrations/supabase/client";
import type { useLargeProjectDetail } from "@/hooks/useLargeProjectDetail";
import { getLargeProjectBookingLabel } from "@/lib/largeProjectBookingLabel";
import type { CalendarEvent } from "@/components/Calendar/ResourceData";

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
  const [pageMode, setPageMode] = useState<"calendar" | "excel">("calendar");

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

  const bookingIds = useMemo(() => {
    return (project?.bookings || [])
      .map((b) => b.booking_id)
      .filter(Boolean);
  }, [project?.bookings]);

  useQuery({
    queryKey: ['large-project-staff-pool', project?.id, bookingIds],
    queryFn: async () => {
      let staffIds: string[] = [];
      if (bookingIds.length > 0) {
        const { data } = await supabase
          .from('booking_staff_assignments')
          .select('staff_id')
          .in('booking_id', bookingIds);
        staffIds = [...new Set((data || []).map((d) => d.staff_id))];
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

  const handleOpenInChat = useCallback((_taskId: string, _taskTitle: string) => {
    setSheetOpen(false);
    navigate("..");
  }, [navigate]);

  // Mappa planner-items till kalender-events så de visas i CustomCalendar.
  const { events: plannerCalendarEvents } = useLargeProjectPlannerCalendarEvents(project?.id);

  // Klick på planner-item-event i kalendern → öppna quick-edit i panelen.
  const handleCalendarEventClick = useCallback((evt: CalendarEvent) => {
    const isPlanner = (evt as any)?.extendedProps?.isPlannerItem;
    const plannerItemId = (evt as any)?.extendedProps?.plannerItemId;
    if (isPlanner && plannerItemId) {
      window.dispatchEvent(
        new CustomEvent('lp-planner-item-open', { detail: { itemId: plannerItemId } }),
      );
    }
  }, []);

  if (!project) return null;

  const projectBookings = (project.bookings || []).map((b) => ({
    booking_id: b.booking_id,
    display_name: getLargeProjectBookingLabel(b as any),
    client: (b as any).booking?.client || null,
  }));

  return (
    <div className="space-y-3">
      {/* Top toggle: Kalender (unified planera+kalender) vs Excel-vy */}
      <div className="flex items-center justify-center">
        <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
          <Button
            variant={pageMode === "calendar" ? "default" : "ghost"}
            size="sm"
            className="h-9 px-6 text-sm gap-2"
            onClick={() => setPageMode("calendar")}
          >
            <CalendarDays className="h-4 w-4" />
            Kalender & planering
          </Button>
          <Button
            variant={pageMode === "excel" ? "default" : "ghost"}
            size="sm"
            className="h-9 px-6 text-sm gap-2"
            onClick={() => setPageMode("excel")}
          >
            <TableIcon className="h-4 w-4" />
            Excel-vy
          </Button>
        </div>
      </div>

      {pageMode === "excel" ? (
        <LargeProjectExcelView bookings={(project as any)?.bookings || []} />
      ) : (
        <ProjectCalendarView
          projectId={project.id}
          isLargeProject
          compactHeader
          extraEvents={plannerCalendarEvents}
          onEventClick={handleCalendarEventClick}
          rightPanel={<LargeProjectPlannerPanel largeProjectId={project.id} />}
        />
      )}

      <EstablishmentTaskDetailSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        task={selectedTask}
        bookingId={null}
        largeProjectId={project.id}
        staffPool={[]}
        projectBookings={projectBookings}
        onOpenInChat={handleOpenInChat}
      />
    </div>
  );
};

export default LargeEstablishmentPage;
