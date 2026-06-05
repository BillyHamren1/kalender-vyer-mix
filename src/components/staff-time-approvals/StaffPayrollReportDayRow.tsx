/**
 * StaffPayrollReportDayRow — en datumrad i lönerapporten.
 *
 * Layout: en enda CSS-grid per dagblock med kolumnerna
 *   [Datum | Aktivitet | Start | Slut | Tim | Status]
 * Datum + Status spänner alla rader i blocket via inline gridRow,
 * så att varje aktivitet (label/start/slut/tim) tvingas på SAMMA
 * radhöjd → raka horisontella linjer även när "Belastar"-chip eller
 * "from → to"-detalj gör labelraden högre.
 *
 * Premium admin-attest direkt i raden:
 *  - statusbadge per dag
 *  - Godkänn / Begär komplettering direkt för submitted_waiting_approval
 *  - klick på datumkolumnen öppnar dag-detalj; knappar stopPropagatar
 *  - correction_requested visar admin-kommentaren inline
 */
import { Fragment, type CSSProperties } from "react";
import { format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  MessageSquareWarning,
  Eye,
  Sparkles,
} from "lucide-react";
import type {
  StaffTimeMatrixCell,
  StaffTimeMatrixRowItem,
} from "@/hooks/staffTimeFlow/useStaffTimeWeekMatrix";
import { resolveTravelAllocation } from "@/lib/staff-payroll/travelAllocation";
import TimeApprovalStatusBadge from "./TimeApprovalStatusBadge";
import { Button } from "@/components/ui/button";
import { useUnknownPlaceLabel } from "@/hooks/staff-time/useUnknownPlaceLabel";

function UnknownPlaceLabel({
  staffId,
  date,
  startIso,
  endIso,
  fallback,
}: {
  staffId: string;
  date: string;
  startIso: string | null;
  endIso: string | null;
  fallback: string;
}) {
  const { data } = useUnknownPlaceLabel({
    enabled: true,
    staffId,
    date,
    startIso,
    endIso,
  });
  const label = data?.label?.trim() ? data.label : fallback;
  const hasAi = !!data?.label?.trim();
  return (
    <span className="inline-flex items-center gap-1 min-w-0 text-foreground">
      <span className="truncate">{label}</span>
      {hasAi && (
        <Sparkles
          className="h-3 w-3 shrink-0 text-muted-foreground/70"
          aria-label="AI-förslag"
        />
      )}
    </span>
  );
}

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtH(min: number): string {
  if (!min || min <= 0) return "0:00";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function kindLabel(item: StaffTimeMatrixRowItem): string {
  if (item.label && item.label.trim()) return item.label;
  switch (item.kind) {
    case "work": return "Arbete";
    case "travel": return "Resa";
    case "private": return "Privat";
    case "unknown_place": return "Okänd plats";
    case "gps_gap": return "GPS-glapp";
    default: return "Övrigt";
  }
}

function badgeStatusFor(cellStatus: string): string {
  switch (cellStatus) {
    case "gps_proposal": return "pending_staff_attest";
    case "submitted_waiting_approval": return "pending_admin_attest";
    case "correction_requested": return "correction_requested";
    case "approved": return "approved";
    case "empty": return "no_report";
    default: return cellStatus;
  }
}

interface Props {
  cell: StaffTimeMatrixCell;
  staffId: string;
  onClick: () => void;
  onApprove?: (submissionId: string) => void;
  onRequestCorrection?: (submissionId: string) => void;
  approvingId?: string | null;
}

function TravelBadge({ cell, item }: { cell: StaffTimeMatrixCell; item: StaffTimeMatrixRowItem }) {
  const alloc = resolveTravelAllocation(cell, item);
  if (alloc.kind === "linked") {
    return (
      <span
        className="inline-flex items-center gap-1 max-w-full rounded-full bg-sky-50 border border-sky-200 text-sky-800 px-2 py-0.5 text-[10.5px] font-medium"
        title={`Belastar: ${alloc.label}`}
      >
        <ArrowRight className="h-2.5 w-2.5 shrink-0" />
        <span className="truncate">{alloc.label}</span>
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center rounded-full border border-border bg-muted/50 text-muted-foreground px-2 py-0.5 text-[10.5px]"
      title="Restidens projekt/plats kunde inte bestämmas från rapportdatan"
    >
      Belastning okänd
    </span>
  );
}

const GRID_CLASS =
  "grid grid-cols-[112px_minmax(0,1fr)_60px_60px_64px_minmax(140px,180px)_minmax(176px,220px)] gap-x-3";

const ROW_MIN_H = "min-h-[28px]";

export default function StaffPayrollReportDayRow({
  cell,
  staffId,
  onClick,
  onApprove,
  onRequestCorrection,
  approvingId,
}: Props) {
  const date = parseISO(cell.date);
  const dayLabel = format(date, "EEE d MMM", { locale: sv });
  const hasRows = cell.rows && cell.rows.length > 0;
  const isEmpty = cell.status === "empty" && !hasRows && !cell.startTime;
  const submissionId = cell.submissionId;
  const isApproving = approvingId && submissionId && approvingId === submissionId;

  // ---- Tom dag ----
  if (isEmpty) {
    return (
      <div
        className={`payroll-day-row ${GRID_CLASS} py-2 px-4 border-b border-border last:border-b-0 text-[11.5px] text-muted-foreground/70 items-center`}
      >
        <div className="capitalize font-medium">{dayLabel}</div>
        <div className="col-span-5">—</div>
        <div className="payroll-no-print flex justify-end">
          <TimeApprovalStatusBadge status="no_report" />
        </div>
      </div>
    );
  }

  const rowsForRender: StaffTimeMatrixRowItem[] = hasRows
    ? cell.rows
    : [
        {
          kind: "work",
          label: "Arbetsdag",
          startIso: null,
          endIso: null,
          minutes: cell.totalMinutes,
          fromLabel: null,
          toLabel: null,
        } as StaffTimeMatrixRowItem,
      ];

  const showTotalsRow = hasRows && cell.rows.length > 1;
  const showCorrectionRow =
    cell.status === "correction_requested" && !!cell.reviewComment;

  // Rader: aktivitetsrader (N) + ev. totalsumma (1) + ev. correction-kommentar (1)
  const activityRowCount = rowsForRender.length;
  const totalRowsInBlock =
    activityRowCount + (showTotalsRow ? 1 : 0) + (showCorrectionRow ? 1 : 0);

  const spanAllRows: CSSProperties = {
    gridRow: `1 / span ${totalRowsInBlock}`,
  };

  const handleRowClick = () => onClick();

  return (
    <div
      className={`payroll-day-row ${GRID_CLASS} gap-y-0 px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted/20 print:hover:bg-transparent text-[12.5px] leading-snug transition-colors`}
    >
      {/* Datum — spänner hela blocket, klickbart */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleRowClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleRowClick();
          }
        }}
        style={spanAllRows}
        className={`font-semibold text-foreground capitalize pt-0.5 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded ${ROW_MIN_H} flex items-start`}
      >
        {dayLabel}
      </div>

      {/* Aktivitetsrader */}
      {rowsForRender.map((r, i) => {
        const gridRow = i + 1;
        return (
          <Fragment key={`act-${i}`}>
            <div
              style={{ gridRow, gridColumn: 2 }}
              className={`flex items-center gap-2 min-w-0 ${ROW_MIN_H}`}
            >
              {r.kind === "unknown_place" ? (
                <UnknownPlaceLabel
                  staffId={staffId}
                  date={cell.date}
                  startIso={r.startIso}
                  endIso={r.endIso}
                  fallback={kindLabel(r)}
                />
              ) : (
                <span className="truncate text-foreground">{kindLabel(r)}</span>
              )}
              {r.kind === "travel" && (r.fromLabel || r.toLabel) && (
                <span className="text-[10.5px] text-muted-foreground truncate">
                  {r.fromLabel ?? "?"} → {r.toLabel ?? "?"}
                </span>
              )}
            </div>
            <div
              style={{ gridRow, gridColumn: 3 }}
              className={`text-right tabular-nums text-muted-foreground flex items-center justify-end ${ROW_MIN_H}`}
            >
              {hasRows ? fmtTime(r.startIso) : cell.startTime ?? ""}
            </div>
            <div
              style={{ gridRow, gridColumn: 4 }}
              className={`text-right tabular-nums text-muted-foreground flex items-center justify-end ${ROW_MIN_H}`}
            >
              {hasRows ? fmtTime(r.endIso) : cell.endTime ?? ""}
            </div>
            <div
              style={{ gridRow, gridColumn: 5 }}
              className={`text-right tabular-nums font-semibold text-foreground flex items-center justify-end ${ROW_MIN_H}`}
            >
              {fmtH(hasRows ? r.minutes : cell.totalMinutes)}
            </div>
            <div
              style={{ gridRow, gridColumn: 6 }}
              className={`flex items-center min-w-0 ${ROW_MIN_H}`}
            >
              {r.kind === "travel" && <TravelBadge cell={cell} item={r} />}
            </div>
          </Fragment>
        );
      })}

      {/* Totalsumma per dag (när flera aktivitetsrader) */}
      {showTotalsRow && (
        <div
          style={{
            gridRow: activityRowCount + 1,
            gridColumn: "3 / span 3",
          }}
          className="border-t border-border/60 mt-1 pt-1 text-right tabular-nums text-[11.5px] text-muted-foreground"
        >
          <span className="font-semibold text-foreground">
            Σ {fmtH(cell.totalMinutes)}
          </span>
        </div>
      )}

      {/* Admin-kommentar vid komplettering */}
      {showCorrectionRow && (
        <div
          style={{
            gridRow: activityRowCount + (showTotalsRow ? 1 : 0) + 1,
            gridColumn: "2 / span 4",
          }}
          className="payroll-no-print mt-2 flex items-start gap-1.5 rounded-md border border-rose-200 bg-rose-50/70 px-2 py-1.5 text-[11px] text-rose-800"
        >
          <MessageSquareWarning className="h-3 w-3 mt-0.5 shrink-0" />
          <span className="leading-snug">{cell.reviewComment}</span>
        </div>
      )}

      {/* Status + per-dag actions — spänner hela blocket */}
      <div
        style={spanAllRows}
        className="payroll-no-print flex flex-col items-end gap-1.5 pt-0.5 col-start-6"
      >
        <TimeApprovalStatusBadge status={badgeStatusFor(cell.status)} />

        {cell.status === "submitted_waiting_approval" && submissionId && (
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="default"
              className="h-7 px-2 text-[11px] gap-1"
              disabled={!!isApproving}
              onClick={(e) => {
                e.stopPropagation();
                onApprove?.(submissionId);
              }}
            >
              {isApproving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
              Godkänn
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px] gap-1 text-rose-700 border-rose-200 hover:bg-rose-50"
              disabled={!!isApproving}
              onClick={(e) => {
                e.stopPropagation();
                onRequestCorrection?.(submissionId);
              }}
            >
              <MessageSquareWarning className="h-3 w-3" />
              Komplettera
            </Button>
          </div>
        )}

        {cell.status !== "empty" && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            className="text-[10.5px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <Eye className="h-3 w-3" />
            Öppna
          </button>
        )}
      </div>
    </div>
  );
}
