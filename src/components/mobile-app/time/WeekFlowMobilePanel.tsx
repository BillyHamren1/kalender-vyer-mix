// Mobil-spegel av WeekFlow. Använder samma `useStaffTimeWeekFlow` + samma
// DayCard som admin → samma rader, samma status, samma datum-summor.
// Lägg in i toppen av TimeReportTab (eller var som helst i mobilen).

import { useMemo, useState } from "react";
import { addDays, startOfWeek } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useStaffTimeWeekFlow } from "@/hooks/staffTimeFlow/useStaffTimeWeekFlow";
import WeekFlowDayCard from "@/components/staff-time/week-flow/WeekFlowDayCard";
import { useCurrentStaffId } from "@/hooks/useCurrentStaffId";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { format, subWeeks, addWeeks } from "date-fns";
import { sv } from "date-fns/locale";

export default function WeekFlowMobilePanel() {
  const navigate = useNavigate();
  const staffId = useCurrentStaffId();
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const { flow, isLoading } = useStaffTimeWeekFlow({
    staffId: staffId ?? null,
    weekDates,
    viewer: "staff",
  });

  if (!staffId) {
    return (
      <div className="text-sm text-muted-foreground p-4 text-center">
        Logga in som personal för att se din tidrapport.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <button onClick={() => setWeekStart(subWeeks(weekStart, 1))} className="p-1.5 rounded hover:bg-muted">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-xs font-semibold tabular-nums">
          Vecka {format(weekStart, "I")} · {format(weekStart, "d MMM", { locale: sv })}
        </div>
        <button onClick={() => setWeekStart(addWeeks(weekStart, 1))} className="p-1.5 rounded hover:bg-muted">
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
          onSubmit={(date) => navigate(`/m/day-review?date=${date}`)}
          onOpenGps={(date) => navigate(`/m/report?date=${date}`)}
        />
      ))}
    </div>
  );
}
