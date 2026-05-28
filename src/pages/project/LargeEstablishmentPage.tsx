/**
 * LargeEstablishmentPage — stort projekt: "Kalender & planering".
 * --------------------------------------------------------------------------
 * STRIKT SEPARATION:
 *  - Projektkalendern (LargeProjectBookingPlannerCalendar) skriver ENDAST till
 *    `large_project_booking_plan_items`. Den får ALDRIG röra calendar_events,
 *    bookings.<phase>_*, staff_assignments eller large_project_team_assignments.
 *  - Personalkalendern äger calendar_events + bookings-datumen.
 *  - Endast UX/beteende ska speglas mellan kalendrarna — inte backend.
 */
import { useState, useCallback, useEffect } from "react";
import { useOutletContext, useNavigate, useLocation } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { CalendarDays, Table as TableIcon } from "lucide-react";
import EstablishmentTaskDetailSheet from "@/components/project/EstablishmentTaskDetailSheet";
import LargeProjectExcelView from "@/components/project/LargeProjectExcelView";
import LargeProjectBookingPlannerCalendar from "@/components/project/large-planner/LargeProjectBookingPlannerCalendar";
import { supabase } from "@/integrations/supabase/client";
import type { useLargeProjectDetail } from "@/hooks/useLargeProjectDetail";
import { getLargeProjectBookingLabel } from "@/lib/largeProjectBookingLabel";

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

  const handleOpenInChat = useCallback((_taskId: string, _taskTitle: string) => {
    setSheetOpen(false);
    navigate("..");
  }, [navigate]);

  if (!project) return null;

  const projectBookings = (project.bookings || []).map((b) => ({
    booking_id: b.booking_id,
    display_name: getLargeProjectBookingLabel(b as any),
    client: (b as any).booking?.client || null,
  }));

  return (
    <div className="space-y-3">
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
