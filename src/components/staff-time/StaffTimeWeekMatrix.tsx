/**
 * StaffTimeWeekMatrix — admin Tid & Lön huvudvy.
 *
 * Visar Namn + Mån–Sön + Åtgärd för ALLA aktiva personer i organisationen.
 * Använder samma WeekFlow-statusvokabulär som personalappen (mapDbStatusToFlow).
 *
 * Klick på cell → öppnar dag-detalj (StaffTimeMatrixDayDetailSheet) som
 * mountar WeekFlowDayCard via useStaffTimeWeekFlow för EN staff/EN dag.
 * Klick på "Granska" → /staff-management/gps-satellite-map (befintlig vy).
 * Klick på "Godkänn N dagar" → loop update-staff-day-submission-status.
 */
import { useMemo, useState } from "react";
import { addDays, addWeeks, format, startOfWeek, subWeeks } from "date-fns";
import { sv } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStaffTimeWeekMatrix } from "@/hooks/staffTimeFlow/useStaffTimeWeekMatrix";
import StaffTimeWeekMatrixRow from "./StaffTimeWeekMatrixRow";
import StaffTimeMatrixDayDetailSheet from "./StaffTimeMatrixDayDetailSheet";

const WEEK_HEADERS = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"] as const;

export default function StaffTimeWeekMatrix() {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [openDay, setOpenDay] = useState<{ staffId: string; date: string } | null>(null);

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const weekEnd = addDays(weekStart, 6);

  const { matrix, isLoading } = useStaffTimeWeekMatrix({ weekDates });

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b bg-card/50">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setWeekStart(subWeeks(weekStart, 1))} aria-label="Föregående vecka">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold px-2 tabular-nums whitespace-nowrap">
            Vecka {format(weekStart, "I")} · {format(weekStart, "d MMM", { locale: sv })} – {format(weekEnd, "d MMM", { locale: sv })}
          </span>
          <Button variant="ghost" size="icon" onClick={() => setWeekStart(addWeeks(weekStart, 1))} aria-label="Nästa vecka">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
            Idag
          </Button>
        </div>
        <div className="ml-auto text-[11px] text-muted-foreground">
          {matrix?.rows.length ?? 0} personer · samma vokabulär som /m/report
        </div>
      </div>

      {isLoading && !matrix && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-6 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Laddar veckomatrisen…
        </div>
      )}

      {matrix && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-muted-foreground border-b">
                <th className="px-3 py-2 text-left font-medium sticky left-0 bg-background z-[2] min-w-[160px]">
                  Namn
                </th>
                {weekDates.map((d, i) => (
                  <th key={d.toISOString()} className="px-1.5 py-2 text-center font-medium min-w-[92px]">
                    <div>{WEEK_HEADERS[i]}</div>
                    <div className="text-[10px] font-normal text-muted-foreground/80 tabular-nums">
                      {format(d, "d/M", { locale: sv })}
                    </div>
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium min-w-[180px]">Åtgärd</th>
              </tr>
            </thead>
            <tbody>
              {matrix.rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-sm text-muted-foreground">
                    Inga aktiva personer i organisationen.
                  </td>
                </tr>
              ) : (
                matrix.rows.map((row) => (
                  <StaffTimeWeekMatrixRow
                    key={row.staffId}
                    row={row}
                    onOpenDay={(staffId, date) => setOpenDay({ staffId, date })}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <StaffTimeMatrixDayDetailSheet
        open={openDay}
        onClose={() => setOpenDay(null)}
      />
    </div>
  );
}
