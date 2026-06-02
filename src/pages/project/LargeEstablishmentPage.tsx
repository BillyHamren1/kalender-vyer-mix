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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-center">
        <div
          role="tablist"
          aria-label="Vyläge"
          className="relative inline-flex items-center gap-1 rounded-2xl border border-border/60 bg-gradient-to-b from-muted/70 to-muted/40 p-1 shadow-[0_1px_2px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.6)] backdrop-blur-sm"
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
                  "group relative inline-flex items-center gap-2 rounded-xl px-5 h-10 text-sm font-medium",
                  "transition-all duration-200 ease-out outline-none",
                  "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                  active
                    ? "bg-background text-foreground shadow-[0_2px_8px_-2px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-border/70"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50",
                ].join(" ")}
              >
                <Icon className={["h-4 w-4 transition-colors", active ? "text-primary" : "text-muted-foreground/80 group-hover:text-foreground"].join(" ")} />
                <span className="tracking-tight">{tab.label}</span>
                <span
                  className={[
                    "hidden sm:inline-block text-[10px] uppercase tracking-[0.08em] font-semibold px-1.5 py-0.5 rounded-md transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "bg-muted-foreground/10 text-muted-foreground/70",
                  ].join(" ")}
                >
                  {tab.hint}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl">
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
