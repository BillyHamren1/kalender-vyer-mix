/**
 * StaffPayrollReport — Lön-tabben som ren tidrapport.
 *
 * Samma block som Tid-tabben (useStaffTimeWeekMatrix) men presenterat som
 * en utskrivbar lönerapport: ett "papper" per anställd, tydlig summa,
 * inga färgglada chips, fungerar i print/PDF.
 *
 * Toolbar (utanför själva rapporten): veckoväljare, exportera CSV,
 * skriv ut / PDF, godkänn alla väntande.
 */
import { useMemo, useState } from "react";
import { addDays, addWeeks, format, startOfWeek, subWeeks } from "date-fns";
import { sv } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Download, Printer, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import StaffGpsSatelliteMap from "@/components/staff/StaffGpsSatelliteMap";
import StaffTimeMatrixDayQuickView from "@/components/staff-time/StaffTimeMatrixDayQuickView";
import { useStaffTimeWeekMatrix } from "@/hooks/staffTimeFlow/useStaffTimeWeekMatrix";
import { useApproveStaffDay } from "@/hooks/staff/useApproveStaffDay";
import { downloadPayrollCsv } from "@/lib/staff-payroll/payrollCsvExport";
import StaffPayrollReportSheet from "./StaffPayrollReportSheet";
import "@/styles/payroll-print.css";

export default function StaffPayrollReport() {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [openDay, setOpenDay] = useState<{ staffId: string; date: string } | null>(null);
  const [satelliteFor, setSatelliteFor] = useState<{ staffId: string; date: string } | null>(null);
  const [approvingAll, setApprovingAll] = useState(false);
  const qc = useQueryClient();
  const approveDay = useApproveStaffDay();

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

  // Visa endast personer som faktiskt har registrerat tid den här veckan.
  // (Personer utan en enda rapporterad dag göms helt — de ska inte ligga som
  // tomma papper i ekonomins rapport.)
  const visibleRows = useMemo(() => {
    if (!matrix) return [];
    return matrix.rows.filter((r) => r.days.some((d) => d.status !== "empty"));
  }, [matrix]);

  const pendingTotal = useMemo(
    () => visibleRows.reduce((s, r) => s + r.pendingSubmissionIds.length, 0),
    [visibleRows],
  );

  const hiddenEmptyCount = useMemo(() => {
    if (!matrix) return 0;
    return matrix.rows.length - visibleRows.length;
  }, [matrix, visibleRows]);

  async function handleApproveAllPending() {
    if (!matrix || pendingTotal === 0) return;
    const ok = window.confirm(`Godkänn ${pendingTotal} väntande ${pendingTotal === 1 ? "dag" : "dagar"} för hela veckan?`);
    if (!ok) return;
    setApprovingAll(true);
    let approved = 0;
    let failed = 0;
    for (const row of visibleRows) {
      for (const id of row.pendingSubmissionIds) {
        try {
          await approveDay.mutateAsync({ submission_id: id, action: "approved" });
          approved++;
        } catch {
          failed++;
        }
      }
    }
    setApprovingAll(false);
    qc.invalidateQueries({ queryKey: ["staff-time-week-matrix"] });
    if (failed === 0) toast.success(`Godkände ${approved} ${approved === 1 ? "dag" : "dagar"}`);
    else toast.error(`Godkände ${approved}, ${failed} misslyckades`);
  }

  function handleExportCsv() {
    if (!matrix) return;
    const name = `lonerapport-v${format(weekStart, "I")}-${format(weekStart, "yyyy")}.csv`;
    downloadPayrollCsv(matrix, name);
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="payroll-report-root flex flex-col">
      {/* Toolbar — dölj i print */}
      <div className="payroll-no-print flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border/60 bg-card/40">
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
          {pendingTotal > 0 && (
            <Button
              variant="default"
              size="sm"
              onClick={handleApproveAllPending}
              disabled={approvingAll}
              className="gap-1.5"
            >
              {approvingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Godkänn alla ({pendingTotal})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={!matrix} className="gap-1.5">
            <Download className="h-3.5 w-3.5" />
            Exportera CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint} disabled={!matrix} className="gap-1.5">
            <Printer className="h-3.5 w-3.5" />
            Skriv ut / PDF
          </Button>
        </div>
      </div>

      {isLoading && !matrix && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-6 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Laddar veckan…
        </div>
      )}

      {matrix && visibleRows.length === 0 && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Ingen personal har registrerat tid den här veckan.
        </div>
      )}

      {matrix && visibleRows.length > 0 && (
        <div className="bg-neutral-100 print:bg-white py-6 print:py-0 px-4 print:px-0">
          {hiddenEmptyCount > 0 && (
            <div className="payroll-no-print max-w-[820px] mx-auto mb-3 text-[11px] text-muted-foreground text-right">
              {hiddenEmptyCount} {hiddenEmptyCount === 1 ? "person" : "personer"} utan registrerad tid göms
            </div>
          )}
          {visibleRows.map((row) => (
            <StaffPayrollReportSheet
              key={row.staffId}
              row={row}
              weekStart={weekStart}
              weekEnd={weekEnd}
              onOpenDay={(staffId, date) => setOpenDay({ staffId, date })}
            />
          ))}
        </div>
      )}

      <Dialog open={!!openDay} onOpenChange={(o) => !o && setOpenDay(null)}>
        <DialogContent className="payroll-no-print max-w-3xl w-[92vw] p-0 flex flex-col overflow-hidden">
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
        <DialogContent className="payroll-no-print max-w-[95vw] w-[95vw] h-[90vh] max-h-[90vh] p-0 flex flex-col overflow-hidden">
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
