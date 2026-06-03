/**
 * StaffTimeWeekMatrix — admin Tid & Lön huvudvy.
 *
 * Premium-layout: KPI-rad · toolbar (week-nav + sök + filter) · grid · legend.
 * Visar Namn + Mån–Sön + Åtgärd för ALLA aktiva personer som ett brett CSS-grid
 * (sticky namnkolumn + horisontell scroll vid behov). Varje dagcell är minst
 * 240px bred så att GPS-satellitens reportRows får plats.
 *
 * Filter/sök sker LOKALT mot existerande data — ingen ny backend-anrop.
 */
import { useMemo, useState } from "react";
import { addDays, addWeeks, format, startOfWeek, subWeeks } from "date-fns";
import { sv } from "date-fns/locale";
import { Loader2 } from "lucide-react";
import { useStaffTimeWeekMatrix } from "@/hooks/staffTimeFlow/useStaffTimeWeekMatrix";
import StaffTimeWeekMatrixRow from "./StaffTimeWeekMatrixRow";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import StaffGpsSatelliteMap from "@/components/staff/StaffGpsSatelliteMap";
import StaffTimeMatrixDayQuickView from "./StaffTimeMatrixDayQuickView";
import StaffTimeKpiBar from "./StaffTimeKpiBar";
import StaffTimeToolbar, { type StatusFilter } from "./StaffTimeToolbar";
import StaffTimeLegend from "./StaffTimeLegend";

const WEEK_HEADERS = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"] as const;

// Grid: namn(140) · 7 dagar(min 240) · åtgärd(110).
export const MATRIX_GRID_TEMPLATE =
  "minmax(120px, 140px) repeat(7, minmax(240px, 1fr)) minmax(90px, 110px)";

export default function StaffTimeWeekMatrix() {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [openDay, setOpenDay] = useState<{ staffId: string; date: string } | null>(null);
  const [satelliteFor, setSatelliteFor] = useState<{ staffId: string; date: string } | null>(null);

  // Lokala filter (påverkar bara presentation, inte data).
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [onlyAnomalies, setOnlyAnomalies] = useState(false);

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const weekEnd = addDays(weekStart, 6);

  const { matrix, isLoading } = useStaffTimeWeekMatrix({ weekDates });

  const filteredIds = useMemo(() => {
    const rows = matrix?.rows ?? [];
    const q = query.trim().toLowerCase();
    const ids = new Set<string>();
    for (const r of rows) {
      if (q && !r.staffName.toLowerCase().includes(q)) continue;
      if (statusFilter !== "all") {
        const hit = r.days.some((d) => d.status === statusFilter);
        if (!hit) continue;
      }
      if (onlyAnomalies) {
        const hasAnomaly = r.days.some(
          (d) =>
            d.status === "correction_requested" ||
            (d.rows ?? []).some((x) => x.kind === "unknown_place" || x.kind === "gps_gap"),
        );
        if (!hasAnomaly) continue;
      }
      ids.add(r.staffId);
    }
    return ids;
  }, [matrix, query, statusFilter, onlyAnomalies]);
  const filteredCount = filteredIds.size;

  const openCell = useMemo(() => {
    if (!openDay || !matrix) return null;
    const row = matrix.rows.find((r) => r.staffId === openDay.staffId);
    const cell = row?.days.find((d) => d.date === openDay.date) ?? null;
    return cell ? { cell, staffName: row!.staffName } : null;
  }, [openDay, matrix]);

  return (
    <div className="flex flex-col">
      <StaffTimeKpiBar matrix={matrix} />

      <StaffTimeToolbar
        weekStart={weekStart}
        weekEnd={weekEnd}
        onPrev={() => setWeekStart(subWeeks(weekStart, 1))}
        onNext={() => setWeekStart(addWeeks(weekStart, 1))}
        onToday={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
        query={query}
        setQuery={setQuery}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        onlyAnomalies={onlyAnomalies}
        setOnlyAnomalies={setOnlyAnomalies}
        rowCountFiltered={filteredRows.length}
        rowCountTotal={matrix?.rows.length ?? 0}
      />

      {isLoading && !matrix && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-6 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Laddar veckomatrisen…
        </div>
      )}

      {matrix && (
        <div className="px-4 pt-3">
          <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto max-h-[calc(100vh-360px)] overflow-y-auto">
              {/* Huvudraden: en grid med 9 kolumner — täcker hela bredden men minsta dagkolumn = 240px → naturlig horisontell scroll på smala skärmar. */}
              <div className="min-w-[1860px]">
                {/* Header */}
                <div
                  className="grid items-end border-b border-border/60 text-[11px] uppercase tracking-wide bg-gradient-to-b from-muted/40 to-card text-foreground/70 sticky top-0 z-[3]"
                  style={{ gridTemplateColumns: MATRIX_GRID_TEMPLATE }}
                >
                  <div className="px-3 py-2.5 text-left font-semibold sticky left-0 z-[1] bg-gradient-to-b from-muted/40 to-card border-r border-border/60">
                    Namn
                  </div>
                  {weekDates.map((d, i) => {
                    const isToday = format(d, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
                    return (
                      <div
                        key={d.toISOString()}
                        className={
                          isToday
                            ? "px-2 py-2.5 text-center font-bold text-primary"
                            : "px-2 py-2.5 text-center font-semibold"
                        }
                      >
                        <div className="leading-none">{WEEK_HEADERS[i]}</div>
                        <div className="text-[10px] font-normal text-muted-foreground/80 tabular-nums mt-1">
                          {format(d, "d MMM", { locale: sv })}
                        </div>
                      </div>
                    );
                  })}
                  <div className="px-2 py-2.5 text-right font-semibold">Åtgärd</div>
                </div>

                {filteredRows.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    {matrix.rows.length === 0
                      ? "Inga aktiva personer i organisationen."
                      : "Inga personer matchar dina filter."}
                  </div>
                ) : (
                  filteredRows.map((row, idx) => (
                    <StaffTimeWeekMatrixRow
                      key={row.staffId}
                      row={row}
                      gridTemplate={MATRIX_GRID_TEMPLATE}
                      zebra={idx % 2 === 1}
                      onOpenDay={(staffId, date) => setOpenDay({ staffId, date })}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <StaffTimeLegend />

      {/* Snabbvy: renderar cellens egna rows direkt (single-pipeline). */}
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

      {/* Sekundär: faktisk GPS-satellitkarta, bara om användaren ber om det. */}
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
