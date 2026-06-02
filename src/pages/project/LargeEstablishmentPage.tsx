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
    <div className="space-y-5">
      {/* Premium lila header — booking-likt utseende */}
      <div className="relative overflow-hidden rounded-[24px] border border-planner/20 bg-[image:var(--gradient-planner)] text-white shadow-[var(--shadow-planner)]">
        {/* Dekorativa highlights */}
        <div className="pointer-events-none absolute -top-24 -right-16 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-10 h-60 w-60 rounded-full bg-black/10 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.06)_0%,transparent_40%)]" />

        <div className="relative flex flex-wrap items-center gap-4 px-6 py-5 md:px-8 md:py-6">
          <div className="h-14 w-14 rounded-2xl bg-white/95 ring-1 ring-white/40 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.35)] flex items-center justify-center shrink-0">
            <ClipboardList className="h-6 w-6 text-planner" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-[0.18em] font-semibold text-white/75">
              Planering
            </div>
            <h1 className="mt-1 text-[22px] md:text-[24px] font-semibold leading-tight tracking-tight truncate">
              {projectTitle}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {projectNumber && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-mono font-semibold px-2 py-1 rounded-md bg-white/15 text-white/95 ring-1 ring-white/20 backdrop-blur-sm">
                  #{projectNumber}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-md bg-white/15 text-white/95 ring-1 ring-white/20 backdrop-blur-sm">
                <Building2 className="h-3 w-3" />
                {bookingsCount} {bookingsCount === 1 ? "bokning" : "bokningar"}
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-md bg-white/15 text-white/95 ring-1 ring-white/20 backdrop-blur-sm">
                <Layers className="h-3 w-3" />
                Operations planning
              </span>
            </div>
          </div>
        </div>

        {/* Tabs inbäddade i headern — premium segmented control */}
        <div className="relative px-4 pb-4 md:px-6 md:pb-5">
          <div
            role="tablist"
            aria-label="Vyläge"
            className="inline-flex items-center gap-1 rounded-2xl bg-white/15 ring-1 ring-white/25 p-1 backdrop-blur-md shadow-[0_4px_16px_-8px_rgba(0,0,0,0.3)]"
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
                    "group relative inline-flex items-center gap-2 rounded-xl px-4 md:px-5 h-9 text-[13px] font-semibold tracking-tight",
                    "transition-all duration-200 ease-out outline-none",
                    "focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-planner",
                    active
                      ? "bg-white text-planner shadow-[0_4px_12px_-4px_rgba(0,0,0,0.25)]"
                      : "text-white/85 hover:text-white hover:bg-white/10",
                  ].join(" ")}
                >
                  <Icon className={["h-4 w-4 transition-colors", active ? "text-planner" : "text-white/85 group-hover:text-white"].join(" ")} />
                  <span>{tab.label}</span>
                  <span
                    className={[
                      "hidden sm:inline-block text-[9.5px] uppercase tracking-[0.1em] font-bold px-1.5 py-0.5 rounded-md transition-colors",
                      active
                        ? "bg-planner/10 text-planner"
                        : "bg-white/15 text-white/85",
                    ].join(" ")}
                  >
                    {tab.hint}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
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
