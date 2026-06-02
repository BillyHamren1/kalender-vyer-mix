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
import { CalendarDays, Table as TableIcon, ClipboardList, Layers, Building2 } from "lucide-react";
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

  const tabs: Array<{ id: "calendar" | "excel"; label: string; icon: typeof CalendarDays; hint: string }> = [
    { id: "calendar", label: "Kalender & planering", icon: CalendarDays, hint: "Tidsöversikt" },
    { id: "excel", label: "Excel-vy", icon: TableIcon, hint: "Tabell & produkter" },
  ];

  const bookingsCount = (project as any)?.bookings?.length ?? 0;
  const projectTitle = (project as any)?.title || (project as any)?.name || "Stort projekt";
  const projectNumber = (project as any)?.project_number || null;

  return (
    <div className="space-y-4">
      {/* Minimal segmented control — header finns redan högst upp på sidan */}
      <div
        role="tablist"
        aria-label="Vyläge"
        className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = pageMode === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={active}
              onClick={() => setPageMode(tab.id)}
              className={[
                "inline-flex items-center gap-2 rounded-md px-3 h-8 text-[13px] font-medium transition-colors outline-none",
                "focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Innehåll */}
      <div>
        {pageMode === "excel" ? (
          <LargeProjectExcelView bookings={(project as any)?.bookings || []} />
        ) : (
          <LargeProjectBookingPlannerCalendar largeProjectId={project.id} />
        )}
      </div>



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
