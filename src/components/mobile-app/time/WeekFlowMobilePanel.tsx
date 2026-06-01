/**
 * WeekFlowMobilePanel — mobilens veckovy på /m/report.
 *
 * EN dataväg:
 *   staff_location_history
 *     → Time Engine / cache-builder
 *     → staff_day_report_cache
 *     → resolveStaffDayReportsBatch (samma resolver som Tid & Lön)
 *     → get-staff-time-week-matrix (dual-auth, mobile token = self only)
 *     → useStaffSelfWeekMatrix → denna komponent.
 *
 * Submit → MobileDaySubmitSheet → submit-staff-day-v3 → staff_day_submissions.
 *
 * Får ALDRIG anropa:
 *   - useStaffTimeWeekFlow / useStaffGpsWeekSummary
 *   - get-staff-gps-week-summary / buildCanonicalStaffDayGpsResult
 *   - get-mobile-gps-day-view / submit-mobile-gps-day-v2
 *   - staff_location_history (raw GPS — endast Time Engine)
 */
import { useMemo, useState } from "react";
import { addDays, addWeeks, format, parseISO, startOfWeek, subWeeks } from "date-fns";
import { sv } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useStaffSelfWeekMatrix } from "@/hooks/staffTimeFlow/useStaffSelfWeekMatrix";
import { useMobileAuth } from "@/contexts/MobileAuthContext";
import MobileDaySubmitSheet from "./MobileDaySubmitSheet";
import WeekFlowDayCard from "@/components/staff-time/week-flow/WeekFlowDayCard";
import type { WeekFlowDay, WeekFlowStatus } from "@/lib/staffTimeFlow/types";
import type { StaffTimeMatrixCell } from "@/hooks/staffTimeFlow/useStaffTimeWeekMatrix";

/** Mappa matris-cell → WeekFlowDay så vi återanvänder samma kortrendering som admin. */
function cellToWeekFlowDay(cell: StaffTimeMatrixCell): WeekFlowDay {
  const status: WeekFlowStatus =
    cell.status === "empty" ? "gps_proposal" : cell.status;
  const canSubmit =
    !(status === "approved" || status === "submitted_waiting_approval");
  return {
    date: cell.date,
    status,
    startTime: cell.startTime,
    endTime: cell.endTime,
    workMinutes: cell.workMinutes,
    travelMinutes: cell.travelMinutes,
    totalMinutes: cell.totalMinutes,
    normalMinutes: cell.normalMinutes,
    overtimeMinutes: cell.overtimeMinutes,
    rows: cell.rows.map((r, i) => ({
      key: `${cell.date}:${i}`,
      kind: r.kind,
      label: r.label,
      startIso: r.startIso,
      endIso: r.endIso,
      minutes: r.minutes,
      fromLabel: r.fromLabel,
      toLabel: r.toLabel,
    })),
    source: cell.source,
    submissionId: cell.submissionId,
    gpsAvailable: cell.gpsAvailable,
    canSubmit,
    canApprove: false,
    canRequestCorrection: false,
    submittedAt: null,
    approvedAt: null,
    approvedBy: null,
    reviewComment: cell.reviewComment,
    pingCount: cell.pingCount,
  };
}

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

  const { cellsByDate, isLoading } = useStaffSelfWeekMatrix({ staffId, weekDates });

  const days: WeekFlowDay[] = useMemo(
    () => weekDates.map((d) => {
      const date = format(d, "yyyy-MM-dd");
      const cell = cellsByDate.get(date);
      if (cell) return cellToWeekFlowDay(cell);
      return cellToWeekFlowDay({
        date, status: "empty", source: "empty",
        startTime: null, endTime: null,
        workMinutes: 0, travelMinutes: 0, totalMinutes: 0,
        normalMinutes: 0, overtimeMinutes: 0,
        submissionId: null, reviewComment: null,
        pingCount: 0, gpsAvailable: false, rows: [],
      });
    }),
    [weekDates, cellsByDate],
  );

  const openCell = openDate ? cellsByDate.get(openDate) ?? null : null;

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

      {days.map((day) => (
        <WeekFlowDayCard
          key={day.date}
          day={day}
          onSubmit={(date) => setOpenDate(date)}
          onOpenGps={(date) => navigate(`/m/gps?date=${date}`)}
        />
      ))}

      <MobileDaySubmitSheet
        date={openDate}
        reviewComment={openCell?.reviewComment ?? null}
        onClose={() => setOpenDate(null)}
        onSubmitted={() => {
          qc.invalidateQueries({ queryKey: ["staff-self-week-matrix"] });
          qc.invalidateQueries({ queryKey: ["staff-time-week-matrix"] });
        }}
      />
    </div>
  );
}
