/**
 * StaffPayrollReportSheet — premiumkort per anställd för veckan.
 *
 * Layout: bred container, vänsterkolumn = tidslinje + per-dag-attest,
 * högerkolumn = "Tid per projekt och dag".
 * Print: payroll-print.css kollapsar till smalt A4-papper utan högerpanel/actions.
 *
 * Attest sker direkt i kortet via useApproveStaffDay — ingen separat inbox.
 */
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { StaffTimeMatrixRow } from "@/hooks/staffTimeFlow/useStaffTimeWeekMatrix";
import { Button } from "@/components/ui/button";
import { useApproveStaffDay } from "@/hooks/staff/useApproveStaffDay";
import StaffPayrollReportDayRow from "./StaffPayrollReportDayRow";
import ReportKpiBadges from "./ReportKpiBadges";
import ReportProjectDayPanel from "./ReportProjectDayPanel";
import RequestCorrectionDialog from "./RequestCorrectionDialog";
import TimeApprovalStatusBadge from "./TimeApprovalStatusBadge";
import { countWeekStats } from "@/lib/staff-payroll/payrollCsvExport";
import { buildReportProjectDaySummary } from "@/lib/staff-payroll/reportProjectDaySummary";

interface Props {
  row: StaffTimeMatrixRow;
  weekStart: Date;
  weekEnd: Date;
  onOpenDay: (staffId: string, date: string) => void;
}

/** Härleda kort vecko-statusbadge (mappad till TimeApprovalStatusBadge-status). */
function weekBadgeStatus(row: StaffTimeMatrixRow): string {
  const reported = row.days.filter((d) => d.status !== "empty");
  if (reported.length === 0) return "no_report";
  if (reported.some((d) => d.status === "correction_requested")) return "correction_requested";
  if (row.pendingSubmissionIds.length > 0) return "pending_admin_attest";
  if (reported.every((d) => d.status === "approved")) return "approved";
  return "pending_admin_attest";
}

export default function StaffPayrollReportSheet({ row, weekStart, weekEnd, onOpenDay }: Props) {
  const stats = countWeekStats(row);
  const summary = useMemo(() => buildReportProjectDaySummary(row), [row]);
  const weekStatus = weekBadgeStatus(row);

  const qc = useQueryClient();
  const approveDay = useApproveStaffDay();
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approvingAll, setApprovingAll] = useState(false);
  const [correctionFor, setCorrectionFor] = useState<{ submissionId: string; date: string } | null>(null);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["staff-time-week-matrix"] });
  }

  async function handleApprove(submissionId: string) {
    setApprovingId(submissionId);
    try {
      await approveDay.mutateAsync({ submission_id: submissionId, action: "approved" });
      toast.success("Dagen godkänd");
      invalidate();
    } catch (e: any) {
      toast.error("Kunde inte godkänna", { description: e?.message });
    } finally {
      setApprovingId(null);
    }
  }

  async function handleSubmitCorrection(comment: string) {
    if (!correctionFor) return;
    setApprovingId(correctionFor.submissionId);
    try {
      await approveDay.mutateAsync({
        submission_id: correctionFor.submissionId,
        action: "correction_requested",
        review_comment: comment,
      });
      toast.success("Komplettering skickad");
      setCorrectionFor(null);
      invalidate();
    } catch (e: any) {
      toast.error("Kunde inte begära komplettering", { description: e?.message });
    } finally {
      setApprovingId(null);
    }
  }

  async function handleApproveAllForRow() {
    if (row.pendingSubmissionIds.length === 0) return;
    setApprovingAll(true);
    let ok = 0;
    let failed = 0;
    for (const id of row.pendingSubmissionIds) {
      try {
        await approveDay.mutateAsync({ submission_id: id, action: "approved" });
        ok++;
      } catch {
        failed++;
      }
    }
    setApprovingAll(false);
    invalidate();
    if (failed === 0) toast.success(`Godkände ${ok} ${ok === 1 ? "dag" : "dagar"}`);
    else toast.error(`Godkände ${ok}, ${failed} misslyckades`);
  }

  const pendingForRow = row.pendingSubmissionIds.length;

  return (
    <article className="payroll-sheet bg-card border border-border/60 rounded-2xl lg:rounded-3xl shadow-sm hover:shadow-md transition-shadow print:shadow-none print:border-neutral-300 print:rounded-none w-full mb-6 print:mb-0 overflow-hidden">
      {/* Header */}
      <header className="px-5 sm:px-6 pt-5 pb-4 border-b border-border/60 bg-gradient-to-b from-violet-500/[0.04] to-transparent">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
              Tidrapport
            </div>
            <h2 className="text-xl sm:text-[22px] font-bold text-foreground mt-0.5 leading-tight">
              {row.staffName}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
              <span className="font-medium text-foreground">
                Vecka {format(weekStart, "I", { locale: sv })} · {format(weekStart, "yyyy")}
              </span>
              <span className="opacity-50">·</span>
              <span className="tabular-nums">
                {format(weekStart, "d MMM", { locale: sv })} – {format(weekEnd, "d MMM yyyy", { locale: sv })}
              </span>
              <TimeApprovalStatusBadge status={weekStatus} size="sm" />
              {pendingForRow > 0 && (
                <span className="text-[11px] text-amber-700">
                  {pendingForRow} {pendingForRow === 1 ? "dag" : "dagar"} väntar attest
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <ReportKpiBadges
              normal={stats.normal}
              overtime={stats.overtime}
              travel={stats.travel}
              total={stats.total}
            />
            {pendingForRow > 0 && (
              <Button
                type="button"
                size="sm"
                className="payroll-no-print gap-1.5"
                onClick={handleApproveAllForRow}
                disabled={approvingAll}
              >
                {approvingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Godkänn alla väntande ({pendingForRow})
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Body grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] gap-0 lg:gap-6 lg:p-6">
        {/* Tidslinje + attest */}
        <section className="min-w-0">
          <div className="grid grid-cols-[112px_minmax(0,1fr)_60px_60px_64px_minmax(176px,220px)] gap-3 px-4 py-2 border-b border-border/60 text-[10.5px] uppercase tracking-wider text-muted-foreground font-semibold bg-muted/30 lg:rounded-t-xl">
            <div>Datum</div>
            <div>Aktivitet</div>
            <div className="text-right">Start</div>
            <div className="text-right">Slut</div>
            <div className="text-right">Tim</div>
            <div className="payroll-no-print text-right">Status</div>
          </div>
          <div className="lg:rounded-b-xl lg:border lg:border-t-0 lg:border-border/60 overflow-hidden">
            {row.days.map((cell) => (
              <StaffPayrollReportDayRow
                key={cell.date}
                cell={cell}
                staffId={row.staffId}
                onClick={() => onOpenDay(row.staffId, cell.date)}
                onApprove={handleApprove}
                onRequestCorrection={(submissionId) =>
                  setCorrectionFor({ submissionId, date: cell.date })
                }
                approvingId={approvingId}
              />
            ))}
          </div>
        </section>

        {/* Projekt-summering */}
        <div className="px-4 py-4 lg:p-0">
          <ReportProjectDayPanel days={summary} />
        </div>
      </div>

      {/* Footer */}
      <footer className="px-5 sm:px-6 py-3 border-t border-border/60 bg-muted/20 flex flex-wrap items-baseline justify-between gap-2 text-[11.5px]">
        <span className="text-muted-foreground">
          {stats.reportedDays} {stats.reportedDays === 1 ? "rapporterad dag" : "rapporterade dagar"}
        </span>
        <span className="text-muted-foreground">
          Totalt arbete <span className="tabular-nums font-semibold text-foreground">{Math.floor((stats.normal + stats.overtime) / 60)}:{String((stats.normal + stats.overtime) % 60).padStart(2, "0")}</span>
          {" · "}
          Resa <span className="tabular-nums font-semibold text-foreground">{Math.floor(stats.travel / 60)}:{String(stats.travel % 60).padStart(2, "0")}</span>
        </span>
      </footer>

      <RequestCorrectionDialog
        open={!!correctionFor}
        onOpenChange={(o) => !o && setCorrectionFor(null)}
        staffName={row.staffName}
        date={correctionFor?.date ?? ""}
        submitting={!!approvingId && approvingId === correctionFor?.submissionId}
        onSubmit={handleSubmitCorrection}
      />
    </article>
  );
}
