/**
 * StaffPayrollWeekMatrix — admin Lön-vy.
 *
 * Speglar Tid-tabbens veckomatris (samma data: useStaffTimeWeekMatrix) men
 * presentationen är klinisk och strukturerad för löneattest:
 *  - Monokrom palett, tunna ramar, tabular siffror
 *  - Tydliga kolumner: Namn · Mån–Sön · Åtgärd
 *  - Status som etikett + tunn statusfärgad vänsterkant
 *  - Strukturerad sekundärsumma: Normal / Övertid / Resa per dag
 *  - Veckototal per person, "Klar för lön"-markering när allt är attesterat
 *
 * Samma blockdata (work/travel/...) som /staff-management/time-tabben.
 */
import { useMemo, useState } from "react";
import { addDays, addWeeks, format, startOfWeek, subWeeks } from "date-fns";
import { sv } from "date-fns/locale";
import { ChevronLeft, ChevronRight, FileText, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import StaffGpsSatelliteMap from "@/components/staff/StaffGpsSatelliteMap";
import StaffTimeMatrixDayQuickView from "@/components/staff-time/StaffTimeMatrixDayQuickView";
import { useStaffTimeWeekMatrix } from "@/hooks/staffTimeFlow/useStaffTimeWeekMatrix";
import StaffPayrollWeekMatrixRow from "./StaffPayrollWeekMatrixRow";

const WEEK_HEADERS = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"] as const;

// Lite stramare än Tid (smalare namn + åtgärd) — total bredd ~1820px.
const PAYROLL_GRID_TEMPLATE =
  "minmax(140px, 160px) repeat(7, minmax(230px, 1fr)) minmax(110px, 130px)";

export default function StaffPayrollWeekMatrix() {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [openDay, setOpenDay] = useState<{ staffId: string; date: string } | null>(null);
  const [satelliteFor, setSatelliteFor] = useState<{ staffId: string; date: string } | null>(null);

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const weekEnd = addDays(weekStart, 6);

  const { matrix, isLoading } = useStaffTimeWeekMatrix({ weekDates });

  const openCell = useMemo(() => {
    if (!openDay || !matrix) return null;
    const row = matrix.rows.find((r) => r.staffId === openDay.staffId);
    const cell = row?.days.find((d) => d.date === openDay.date) ?? null;
    return cell ? { cell, staffName: row!.staffName } : null;
  }, [openDay, matrix]);

  const summary = useMemo(() => {
    if (!matrix) return { persons: 0, pendingDays: 0, approvedDays: 0, correctionDays: 0, totalMinutes: 0 };
    let pendingDays = 0;
    let approvedDays = 0;
    let correctionDays = 0;
    let totalMinutes = 0;
    for (const r of matrix.rows) {
      pendingDays += r.pendingSubmissionIds.length;
      for (const d of r.days) {
        if (d.status === "approved") approvedDays++;
        if (d.status === "correction_requested") correctionDays++;
        totalMinutes += d.totalMinutes || 0;
      }
    }
    return { persons: matrix.rows.length, pendingDays, approvedDays, correctionDays, totalMinutes };
  }, [matrix]);

  function fmtH(min: number): string {
    if (!min || min <= 0) return "0h";
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }

  return (
    <div className="flex flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border/60 bg-card/40">
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

        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="h-7 gap-1.5">
            <Link to="/staff-management/payroll-month-report">
              <FileText className="h-3.5 w-3.5" />
              Månadsrapport lön
            </Link>
          </Button>
        </div>
      </div>

      {/* Klinisk summary-bar — text + tunna avgränsare, inga färgchips */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 border-b border-border/40 text-[11px] tabular-nums">
        <div className="flex items-center gap-1.5">
          <span className="uppercase tracking-wider text-muted-foreground">Personer</span>
          <span className="font-semibold">{summary.persons}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="uppercase tracking-wider text-muted-foreground">Väntar attest</span>
          <span className="font-semibold text-amber-700 dark:text-amber-300">{summary.pendingDays}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="uppercase tracking-wider text-muted-foreground">Attesterade dagar</span>
          <span className="font-semibold text-emerald-700 dark:text-emerald-300">{summary.approvedDays}</span>
        </div>
        {summary.correctionDays > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="uppercase tracking-wider text-muted-foreground">Komplettering</span>
            <span className="font-semibold text-rose-700 dark:text-rose-300">{summary.correctionDays}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="uppercase tracking-wider text-muted-foreground">Veckans tid</span>
          <span className="font-semibold">{fmtH(summary.totalMinutes)}</span>
        </div>
      </div>

      {isLoading && !matrix && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-6 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Laddar veckan…
        </div>
      )}

      {matrix && (
        <div className="overflow-x-auto">
          <div className="min-w-[1820px]">
            {/* Header */}
            <div
              className="grid items-end border-b border-border text-[10.5px] uppercase tracking-wider text-muted-foreground bg-background sticky top-0 z-[2]"
              style={{ gridTemplateColumns: PAYROLL_GRID_TEMPLATE }}
            >
              <div className="px-3 py-2 text-left font-semibold">Personal</div>
              {weekDates.map((d, i) => (
                <div key={d.toISOString()} className="px-2 py-2 text-center font-semibold">
                  <div>{WEEK_HEADERS[i]}</div>
                  <div className="text-[10px] font-normal text-muted-foreground/70 tabular-nums">
                    {format(d, "d/M", { locale: sv })}
                  </div>
                </div>
              ))}
              <div className="px-2 py-2 text-right font-semibold">Lönåtgärd</div>
            </div>

            {matrix.rows.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Inga aktiva personer i organisationen.
              </div>
            ) : (
              matrix.rows.map((row) => (
                <StaffPayrollWeekMatrixRow
                  key={row.staffId}
                  row={row}
                  gridTemplate={PAYROLL_GRID_TEMPLATE}
                  onOpenDay={(staffId, date) => setOpenDay({ staffId, date })}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* Snabbvy: samma som Tid */}
      <Dialog open={!!openDay} onOpenChange={(o) => !o && setOpenDay(null)}>
        <DialogContent className="max-w-3xl w-[92vw] p-0 flex flex-col overflow-hidden">
          <DialogHeader className="px-4 py-3 border-b shrink-0">
            <DialogTitle className="text-sm">
              Dag {openDay?.date} {openCell ? `· ${openCell.staffName}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4">
            {openCell ? (
              <StaffTimeMatrixDayQuickView
                cell={openCell.cell}
                staffName={openCell.staffName}
                onOpenSatellite={() => {
                  if (openDay) setSatelliteFor(openDay);
                  setOpenDay(null);
                }}
              />
            ) : (
              <div className="text-sm text-muted-foreground">Laddar…</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!satelliteFor} onOpenChange={(o) => !o && setSatelliteFor(null)}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] max-h-[90vh] p-0 flex flex-col overflow-hidden">
          <DialogHeader className="px-4 py-3 border-b shrink-0">
            <DialogTitle className="text-sm">GPS-karta · {satelliteFor?.date}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4">
            {satelliteFor && (
              <StaffGpsSatelliteMap
                key={`${satelliteFor.staffId}-${satelliteFor.date}`}
                initialStaffId={satelliteFor.staffId}
                initialDate={satelliteFor.date}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
