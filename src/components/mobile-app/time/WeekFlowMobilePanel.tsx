/**
 * WeekFlowMobilePanel — mobil-vyn för /m/report. Speglar admin Tid & Lön 1:1.
 *
 * - Auth: useMobileAuth (MobileAuthProvider). Den vanliga Supabase-baserade
 *   staff-id-hooken får INTE användas här — den läser AuthContext som är null
 *   i mobilappen.
 * - Använder samma `useStaffTimeWeekFlow` + `WeekFlowDayCard` som admin.
 *   Hooken kör viewer="staff" → går via mobile token / edge function.
 * - "Skicka in" öppnar DayReviewSheet (samma get-mobile-gps-day-view +
 *   submit-mobile-gps-day-v2 som tidigare).
 * - "Öppna GPS" → /m/gps?date=…
 */
import { useMemo, useState } from "react";
import { addDays, addWeeks, format, startOfWeek, subWeeks } from "date-fns";
import { sv } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useStaffTimeWeekFlow } from "@/hooks/staffTimeFlow/useStaffTimeWeekFlow";
import WeekFlowDayCard from "@/components/staff-time/week-flow/WeekFlowDayCard";
import DayReviewSheet from "@/features/mobile-time-v2/DayReviewSheet";
import { useMobileAuth } from "@/contexts/MobileAuthContext";

export default function WeekFlowMobilePanel() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { effectiveStaffId, isLoading: authLoading } = useMobileAuth();
  const staffId = effectiveStaffId ?? null;
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [openDate, setOpenDate] = useState<string | null>(null);

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const { flow, isLoading } = useStaffTimeWeekFlow({
    staffId,
    weekDates,
    viewer: "staff",
  });

  const weekEnd = addDays(weekStart, 6);

  if (authLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-4 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Laddar tidrapport…
      </div>
    );
  }

  if (!staffId) {
    return (
      <div className="text-sm text-muted-foreground p-4 text-center">
        Logga in som personal för att se din tidrapport.
      </div>
    );
  }

  const openDateRow = openDate
    ? flow?.days.find((d) => d.date === openDate) ?? null
    : null;

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <button
          onClick={() => setWeekStart(subWeeks(weekStart, 1))}
          className="p-1.5 rounded hover:bg-muted"
          aria-label="Föregående vecka"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-xs font-semibold tabular-nums text-center">
          Vecka {format(weekStart, "I")} ·{" "}
          {format(weekStart, "d MMM", { locale: sv })} –{" "}
          {format(weekEnd, "d MMM", { locale: sv })}
        </div>
        <button
          onClick={() => setWeekStart(addWeeks(weekStart, 1))}
          className="p-1.5 rounded hover:bg-muted"
          aria-label="Nästa vecka"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-3">
          <Loader2 className="h-4 w-4 animate-spin" /> Laddar veckans tid…
        </div>
      )}

      {flow?.days.map((day) => (
        <WeekFlowDayCard
          key={day.date}
          day={day}
          onSubmit={(date) => setOpenDate(date)}
          onOpenGps={(date) => navigate(`/m/gps?date=${date}`)}
        />
      ))}

      <DayReviewSheet
        staffId={staffId}
        date={openDate}
        reviewComment={openDateRow?.reviewComment ?? null}
        onClose={() => setOpenDate(null)}
        onSubmitted={() => {
          // Bred invalidation — träffar både admin- och staff-viewer key.
          qc.invalidateQueries({ queryKey: ["staff-time-flow-submissions"] });
          qc.invalidateQueries({ queryKey: ["staff-gps-week-summary"] });
        }}
      />
    </div>
  );
}
