import { useState } from "react";
import { CheckCircle2, AlertTriangle, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import type { StaffTimeMatrixRow } from "@/hooks/staffTimeFlow/useStaffTimeWeekMatrix";
import { useApproveStaffDay } from "@/hooks/staff/useApproveStaffDay";
import StaffTimeWeekMatrixCell from "./StaffTimeWeekMatrixCell";

interface Props {
  row: StaffTimeMatrixRow;
  gridTemplate: string;
  onOpenDay: (staffId: string, date: string) => void;
}

export default function StaffTimeWeekMatrixRow({ row, gridTemplate, onOpenDay }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const approveDay = useApproveStaffDay();
  const [busy, setBusy] = useState(false);

  const pendingCount = row.pendingSubmissionIds.length;
  const correctionCount = row.days.filter((d) => d.status === "correction_requested").length;
  const approvedCount = row.days.filter((d) => d.status === "approved").length;
  const anyData = row.days.some((d) => d.status !== "empty");
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
    const date = row.days.find((d) => d.status === "gps_proposal")?.date
      ?? row.days.find((d) => d.status !== "empty")?.date
      ?? firstDate;
    if (!date) return;
    navigate(`/staff-management/gps-satellite-map?staffId=${encodeURIComponent(row.staffId)}&date=${encodeURIComponent(date)}`);
  }

  let action: React.ReactNode;
  if (pendingCount > 0) {
    action = (
      <button
        type="button"
        onClick={handleApproveAll}
        disabled={busy}
        className={cn(
          "inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11px] font-semibold w-full justify-center",
          "bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60",
        )}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
        Godkänn {pendingCount} {pendingCount === 1 ? "dag" : "dagar"}
      </button>
    );
  } else if (correctionCount > 0) {
    action = (
      <span className="inline-flex items-center gap-1 h-7 px-1.5 rounded-md text-[10px] text-rose-700 bg-rose-50 border border-rose-200 w-full justify-center">
        <AlertTriangle className="h-3 w-3" /> Komplettera
      </span>
    );
  } else if (approvedCount > 0 && approvedCount === row.days.filter((d) => d.status !== "empty").length) {
    action = (
      <span className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[10.5px] text-emerald-700 bg-emerald-50 border border-emerald-200 w-full justify-center">
        <CheckCircle2 className="h-3 w-3" /> Klar
      </span>
    );
  } else if (!anyData) {
    action = (
      <button
        type="button"
        onClick={handleReview}
        className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[10.5px] text-muted-foreground hover:bg-muted w-full justify-center"
      >
        <Eye className="h-3 w-3" /> Ingen data
      </button>
    );
  } else {
    action = (
      <button
        type="button"
        onClick={handleReview}
        className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[10.5px] font-medium text-primary hover:bg-primary/10 w-full justify-center"
      >
        <Eye className="h-3 w-3" /> Granska
      </button>
    );
  }

  return (
    <div
      className="grid items-stretch border-b border-border/60 hover:bg-muted/20"
      style={{ gridTemplateColumns: gridTemplate }}
    >
      <div className="px-3 py-1.5 text-xs font-medium flex items-center bg-card truncate" title={row.staffName}>
        <span className="truncate">{row.staffName}</span>
      </div>
      {row.days.map((cell) => (
        <div key={cell.date} className="p-1">
          <StaffTimeWeekMatrixCell cell={cell} onClick={() => onOpenDay(row.staffId, cell.date)} />
        </div>
      ))}
      <div className="px-2 py-1.5 flex items-center justify-end">{action}</div>
    </div>
  );
}
