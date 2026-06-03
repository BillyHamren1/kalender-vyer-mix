/**
 * StaffPayrollReportDayRow — en datumrad i lönerapporten.
 *
 * Premium admin-attest direkt i raden:
 *  - statusbadge per dag
 *  - Godkänn / Begär komplettering direkt för submitted_waiting_approval
 *  - klick på radens datadel öppnar dag-detalj; knappar stopPropagatar
 *  - correction_requested visar admin-kommentaren inline
 */
import { format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  MessageSquareWarning,
  Eye,
} from "lucide-react";
import type {
  StaffTimeMatrixCell,
  StaffTimeMatrixRowItem,
} from "@/hooks/staffTimeFlow/useStaffTimeWeekMatrix";
import { resolveTravelAllocation } from "@/lib/staff-payroll/travelAllocation";
import TimeApprovalStatusBadge from "./TimeApprovalStatusBadge";
import { Button } from "@/components/ui/button";

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

/**
 * Mappa rapportstatus → TimeApprovalStatusBadge-status.
 * Behåller "Ingen rapport" för tomma dagar.
 */
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
        className="inline-flex items-center gap-1 max-w-[260px] rounded-full bg-sky-50 border border-sky-200 text-sky-800 px-2 py-0.5 text-[10.5px] font-medium"
        title={`Belastar: ${alloc.label}`}
      >
        <ArrowRight className="h-2.5 w-2.5 shrink-0" />
        <span className="truncate">Belastar: {alloc.label}</span>
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

  const gridClass =
    "grid grid-cols-[112px_minmax(0,1fr)_60px_60px_64px_minmax(176px,220px)] gap-3 px-4";

  if (isEmpty) {
    return (
      <div
        className={`payroll-day-row ${gridClass} py-1.5 border-b border-border/40 text-[11.5px] text-muted-foreground/70`}
      >
        <div className="capitalize">{dayLabel}</div>
        <div className="col-span-4">—</div>
        <div className="payroll-no-print flex justify-end">
          <TimeApprovalStatusBadge status="no_report" />
        </div>
      </div>
    );
  }

  const handleRowClick = () => onClick();

  return (
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
      className={`payroll-day-row ${gridClass} py-2.5 text-left border-b border-border/40 hover:bg-muted/40 print:hover:bg-transparent text-[12.5px] leading-snug transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/40`}
    >
      <div className="font-semibold text-foreground capitalize pt-0.5">{dayLabel}</div>

      <div className="flex flex-col gap-1 min-w-0">
        {hasRows ? (
          cell.rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2 min-w-0 flex-wrap">
              <span className="truncate text-foreground">{kindLabel(r)}</span>
              {r.kind === "travel" && <TravelBadge cell={cell} item={r} />}
              {r.kind === "travel" && (r.fromLabel || r.toLabel) && (
                <span className="text-[10.5px] text-muted-foreground truncate">
                  {r.fromLabel ?? "?"} → {r.toLabel ?? "?"}
                </span>
              )}
            </div>
          ))
        ) : (
          <span className="text-foreground/80">Arbetsdag</span>
        )}

        {cell.status === "correction_requested" && cell.reviewComment && (
          <div className="payroll-no-print mt-1.5 flex items-start gap-1.5 rounded-md border border-rose-200 bg-rose-50/70 px-2 py-1.5 text-[11px] text-rose-800">
            <MessageSquareWarning className="h-3 w-3 mt-0.5 shrink-0" />
            <span className="leading-snug">{cell.reviewComment}</span>
          </div>
        )}
      </div>

      <div className="text-right tabular-nums text-muted-foreground pt-0.5">
        {hasRows
          ? cell.rows.map((r, i) => <div key={i}>{fmtTime(r.startIso)}</div>)
          : <div>{cell.startTime ?? ""}</div>}
      </div>

      <div className="text-right tabular-nums text-muted-foreground pt-0.5">
        {hasRows
          ? cell.rows.map((r, i) => <div key={i}>{fmtTime(r.endIso)}</div>)
          : <div>{cell.endTime ?? ""}</div>}
      </div>

      <div className="text-right tabular-nums font-semibold text-foreground pt-0.5">
        {hasRows
          ? cell.rows.map((r, i) => <div key={i}>{fmtH(r.minutes)}</div>)
          : <div>{fmtH(cell.totalMinutes)}</div>}
        {hasRows && cell.rows.length > 1 && (
          <div className="mt-1 pt-1 border-t border-border/50 text-[11px] text-muted-foreground">
            {fmtH(cell.totalMinutes)}
          </div>
        )}
      </div>

      {/* Status + per-dag actions — döljs i print */}
      <div className="payroll-no-print flex flex-col items-end gap-1.5 pt-0.5">
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
