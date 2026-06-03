import { useState } from "react";
import { CheckCircle2, AlertTriangle, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import type { StaffTimeMatrixRow } from "@/hooks/staffTimeFlow/useStaffTimeWeekMatrix";
import { useApproveStaffDay } from "@/hooks/staff/useApproveStaffDay";
import StaffTimeWeekMatrixCell from "./StaffTimeWeekMatrixCell";
import StaffTimeAvatar from "./StaffTimeAvatar";

interface Props {
  row: StaffTimeMatrixRow;
  gridTemplate: string;
  zebra?: boolean;
  onOpenDay: (staffId: string, date: string) => void;
}

export default function StaffTimeWeekMatrixRow({ row, gridTemplate, zebra, onOpenDay }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const approveDay = useApproveStaffDay();
  const [busy, setBusy] = useState(false);

  const pendingCount = row.pendingSubmissionIds.length;
  const correctionCount = row.days.filter((d) => d.status === "correction_requested").length;
  const approvedCount = row.days.filter((d) => d.status === "approved").length;
  const dataDays = row.days.filter((d) => d.status !== "empty");
  const anyData = dataDays.length > 0;
  const firstDate = row.days[0]?.date;
  const totalMin = row.days.reduce((acc, d) => acc + (d.totalMinutes || 0), 0);
  const hasAnomaly = row.days.some(
    (d) =>
      d.status === "correction_requested" ||
      (d.rows ?? []).some((r) => r.kind === "unknown_place" || r.kind === "gps_gap"),
  );

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
          "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[11px] font-semibold w-full justify-center shadow-sm",
          "bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors",
        )}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
        Godkänn {pendingCount} {pendingCount === 1 ? "dag" : "dagar"}
      </button>
    );
  } else if (correctionCount > 0) {
    action = (
      <span
        className="inline-flex items-center gap-1 h-8 px-2 rounded-lg text-[10.5px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 w-full justify-center"
        title="Väntar komplettering"
      >
        <AlertTriangle className="h-3 w-3" /> Komplettera
      </span>
    );
  } else if (approvedCount > 0 && approvedCount === dataDays.length) {
    action = (
      <span className="inline-flex items-center gap-1 h-8 px-2 rounded-lg text-[10.5px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 w-full justify-center">
        <CheckCircle2 className="h-3 w-3" /> Klar
      </span>
    );
  } else if (!anyData) {
    action = (
      <button
        type="button"
        onClick={handleReview}
        className="inline-flex items-center gap-1 h-8 px-2 rounded-lg text-[10.5px] text-muted-foreground hover:bg-muted w-full justify-center"
      >
        <Eye className="h-3 w-3" /> Ingen data
      </button>
    );
  } else {
    action = (
      <button
        type="button"
        onClick={handleReview}
        className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[11px] font-semibold w-full justify-center border border-violet-200 text-violet-700 bg-violet-50 hover:bg-violet-100 transition-colors"
      >
        <Eye className="h-3.5 w-3.5" /> Granska
      </button>
    );
  }

  return (
    <div
      className={cn(
        "grid items-stretch border-b border-border/60 transition-colors group/row",
        zebra ? "bg-muted/20" : "bg-transparent",
        "hover:bg-primary/[0.03]",
      )}
      style={{ gridTemplateColumns: gridTemplate }}
    >
      {/* Sticky namnkolumn */}
      <div
        className={cn(
          "px-3 py-2 flex items-center gap-2.5 sticky left-0 z-[1] border-r border-border/60 min-w-0",
          zebra ? "bg-muted/40" : "bg-card",
          "group-hover/row:bg-primary/[0.04]",
        )}
        title={row.staffName}
      >
        <StaffTimeAvatar name={row.staffName} />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold truncate text-foreground leading-tight">
            {row.staffName}
          </div>
          <div className="text-[10px] text-muted-foreground leading-tight tabular-nums">
            {totalMin > 0
              ? `${Math.floor(totalMin / 60)}h ${totalMin % 60}m totalt`
              : "Ingen tid"}
          </div>
        </div>
        {hasAnomaly && (
          <span
            className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0"
            title="Avvikelse denna vecka"
            aria-label="Avvikelse"
          />
        )}
      </div>
      {row.days.map((cell) => (
        <div key={cell.date} className="p-1.5">
          <StaffTimeWeekMatrixCell cell={cell} onClick={() => onOpenDay(row.staffId, cell.date)} />
        </div>
      ))}
      <div className="px-2 py-2 flex items-center justify-end">{action}</div>
    </div>
  );
}
