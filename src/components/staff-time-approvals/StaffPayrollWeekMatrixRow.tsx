/**
 * StaffPayrollWeekMatrixRow — klinisk rad för Lön-tabben.
 *
 * Återanvänder samma godkännandelogik (useApproveStaffDay) som
 * StaffTimeWeekMatrixRow men presentationen är stramare: monokromt namn,
 * neutrala kanter, åtgärdsknappen är primary/outline utan färgfyllning där
 * det inte krävs.
 */
import { useState } from "react";
import { CheckCircle2, AlertTriangle, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import type { StaffTimeMatrixRow } from "@/hooks/staffTimeFlow/useStaffTimeWeekMatrix";
import { useApproveStaffDay } from "@/hooks/staff/useApproveStaffDay";
import StaffPayrollWeekMatrixCell from "./StaffPayrollWeekMatrixCell";

interface Props {
  row: StaffTimeMatrixRow;
  gridTemplate: string;
  onOpenDay: (staffId: string, date: string) => void;
}

export default function StaffPayrollWeekMatrixRow({ row, gridTemplate, onOpenDay }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const approveDay = useApproveStaffDay();
  const [busy, setBusy] = useState(false);

  const pendingCount = row.pendingSubmissionIds.length;
  const correctionCount = row.days.filter((d) => d.status === "correction_requested").length;
  const reportedDays = row.days.filter((d) => d.status !== "empty");
  const approvedCount = row.days.filter((d) => d.status === "approved").length;
  const totalMinutes = row.days.reduce((s, d) => s + (d.totalMinutes || 0), 0);
  const firstDate = row.days[0]?.date;

  async function handleApproveAll() {
    if (pendingCount === 0) return;
    const ok = window.confirm(
      `Godkänn ${pendingCount} ${pendingCount === 1 ? "dag" : "dagar"} för ${row.staffName}?`,
    );
    if (!ok) return;
    setBusy(true);
    let approved = 0;
    const failed: string[] = [];
    for (const id of row.pendingSubmissionIds) {
      try {
        await approveDay.mutateAsync({ submission_id: id, action: "approved" });
        approved++;
      } catch (e: any) {
        failed.push(e?.message ?? "Okänt fel");
      }
    }
    setBusy(false);
    qc.invalidateQueries({ queryKey: ["staff-time-week-matrix"] });
    qc.invalidateQueries({ queryKey: ["staff-time-matrix-subs"] });
    qc.invalidateQueries({ queryKey: ["staff-time-flow-submissions"] });
    if (failed.length === 0) {
      toast.success(`Godkände ${approved} ${approved === 1 ? "dag" : "dagar"} för ${row.staffName}`);
    } else {
      toast.error(`Godkände ${approved}, ${failed.length} misslyckades`, { description: failed[0] });
    }
  }

  function handleReview() {
    const date = row.days.find((d) => d.status === "submitted_waiting_approval")?.date
      ?? row.days.find((d) => d.status !== "empty")?.date
      ?? firstDate;
    if (!date) return;
    navigate(`/staff-management/gps-satellite-map?staffId=${encodeURIComponent(row.staffId)}&date=${encodeURIComponent(date)}`);
  }

  function fmtH(min: number): string {
    if (!min || min <= 0) return "0h";
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }

  let action: React.ReactNode;
  if (pendingCount > 0) {
    action = (
      <button
        type="button"
        onClick={handleApproveAll}
        disabled={busy}
        className={cn(
          "inline-flex items-center gap-1 h-7 px-2 rounded-sm text-[11px] font-semibold w-full justify-center",
          "bg-foreground text-background hover:bg-foreground/85 disabled:opacity-60",
        )}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
        Godkänn {pendingCount}
      </button>
    );
  } else if (correctionCount > 0) {
    action = (
      <span className="inline-flex items-center gap-1 h-7 px-2 rounded-sm text-[10.5px] text-rose-700 border border-rose-300 bg-background w-full justify-center">
        <AlertTriangle className="h-3 w-3" /> Komplettera
      </span>
    );
  } else if (approvedCount > 0 && approvedCount === reportedDays.length) {
    action = (
      <span className="inline-flex items-center gap-1 h-7 px-2 rounded-sm text-[10.5px] text-emerald-700 border border-emerald-300 bg-background w-full justify-center">
        <CheckCircle2 className="h-3 w-3" /> Klar för lön
      </span>
    );
  } else if (reportedDays.length === 0) {
    action = (
      <span className="inline-flex items-center gap-1 h-7 px-2 rounded-sm text-[10.5px] text-muted-foreground w-full justify-center">
        —
      </span>
    );
  } else {
    action = (
      <button
        type="button"
        onClick={handleReview}
        className="inline-flex items-center gap-1 h-7 px-2 rounded-sm text-[10.5px] font-medium text-foreground border border-border hover:bg-muted/40 w-full justify-center"
      >
        <Eye className="h-3 w-3" /> Granska
      </button>
    );
  }

  return (
    <div
      className="grid items-stretch border-b border-border/40 hover:bg-muted/10"
      style={{ gridTemplateColumns: gridTemplate }}
    >
      <div className="px-3 py-2 bg-card flex flex-col justify-center min-w-0" title={row.staffName}>
        <span className="text-xs font-semibold truncate">{row.staffName}</span>
        <span className="text-[10px] tabular-nums text-muted-foreground">{fmtH(totalMinutes)} totalt</span>
      </div>
      {row.days.map((cell) => (
        <div key={cell.date} className="p-1">
          <StaffPayrollWeekMatrixCell cell={cell} onClick={() => onOpenDay(row.staffId, cell.date)} />
        </div>
      ))}
      <div className="px-2 py-1.5 flex items-center justify-end">{action}</div>
    </div>
  );
}
