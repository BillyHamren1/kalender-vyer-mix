/**
 * StaffTimeWeekMatrix — admin Tid & Lön huvudvy.
 *
 * Visar Namn + Mån–Sön + Åtgärd för ALLA aktiva personer i organisationen
 * som ett brett CSS-grid (horisontell scroll om det inte får plats), inte
 * en kollapserad tabell. Varje dagcell är minst 240px bred så att
 * GPS-satellitens reportRows får plats.
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

// Grid: namn(140) · 7 dagar(min 240) · åtgärd(110)
export const MATRIX_GRID_TEMPLATE =
  "minmax(120px, 140px) repeat(7, minmax(240px, 1fr)) minmax(90px, 110px)";

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
          {/* Huvudraden: en grid med 9 kolumner — täcker hela bredden men minsta dagkolumn = 240px → naturlig horisontell scroll på smala skärmar. */}
          <div className="min-w-[1860px]">
            {/* Header */}
            <div
              className="grid items-end border-b text-[11px] uppercase tracking-wide text-muted-foreground bg-background sticky top-0 z-[2]"
              style={{ gridTemplateColumns: MATRIX_GRID_TEMPLATE }}
            >
              <div className="px-3 py-2 text-left font-medium">Namn</div>
              {weekDates.map((d, i) => (
                <div key={d.toISOString()} className="px-2 py-2 text-center font-medium">
                  <div>{WEEK_HEADERS[i]}</div>
                  <div className="text-[10px] font-normal text-muted-foreground/80 tabular-nums">
                    {format(d, "d/M", { locale: sv })}
                  </div>
                </div>
              ))}
              <div className="px-2 py-2 text-right font-medium">Åtgärd</div>
            </div>

            {matrix.rows.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Inga aktiva personer i organisationen.
              </div>
            ) : (
              matrix.rows.map((row) => (
                <StaffTimeWeekMatrixRow
                  key={row.staffId}
                  row={row}
                  gridTemplate={MATRIX_GRID_TEMPLATE}
                  onOpenDay={(staffId, date) => setOpenDay({ staffId, date })}
                />
              ))
            )}
          </div>
        </div>
      )}

      <StaffTimeMatrixDayDetailSheet
        open={openDay}
        onClose={() => setOpenDay(null)}
      />
    </div>
  );
}
