import React from "react";
import { Link } from "react-router-dom";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import {
  formatMinutes,
  type PayrollMonthStaffSummary,
  type PayrollMonthRow,
} from "@/hooks/staff/usePayrollMonthReport";

interface Props {
  summary: PayrollMonthStaffSummary | null;
  open: boolean;
  onClose: () => void;
}

function StatusBadge({ status }: { status: PayrollMonthRow["status"] }) {
  if (status === "payroll_approved") {
    return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300">Utbetalning godkänd</Badge>;
  }
  return <Badge variant="outline" className="border-sky-500/40 text-sky-700 dark:text-sky-300">Godkänd</Badge>;
}

function fmtStart(r: PayrollMonthRow): string {
  const iso = r.computedStartIso;
  if (!iso) return "—";
  try { return format(parseISO(iso), "HH:mm"); } catch { return iso.slice(11, 16); }
}
function fmtEnd(r: PayrollMonthRow): string {
  const iso = r.computedEndIso;
  if (!iso) return "—";
  try { return format(parseISO(iso), "HH:mm"); } catch { return iso.slice(11, 16); }
}

const PayrollMonthStaffDetailDrawer: React.FC<Props> = ({ summary, open, onClose }) => {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[860px] p-0 flex flex-col">
        {summary && (
          <>
            <div className="px-5 pt-5 pb-3 border-b">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{summary.staffName}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {summary.approvedDayCount} godkända dagar ·{" "}
                    <span className="font-medium text-foreground">
                      {formatMinutes(summary.totalWorkMinutes)}
                    </span>{" "}
                    arbetstid · {formatMinutes(summary.totalBreakMinutes)} rast
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
              {summary.rows.length === 0 && (
                <p className="text-sm text-muted-foreground">Inga godkända dagar.</p>
              )}
              {summary.rows.map((r) => {
                const dateLabel = (() => {
                  try { return format(parseISO(r.date), "EEE d MMM yyyy", { locale: sv }); }
                  catch { return r.date; }
                })();
                return (
                  <div key={r.id} className="rounded-lg border border-border/40 bg-card p-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="font-medium capitalize">{dateLabel}</span>
                        <StatusBadge status={r.status} />
                      </div>
                      <Link
                        to={`/staff-management/time-reports/${r.staff_id}/${r.date}`}
                        className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                      >
                        Öppna originaldag <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                    <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                      <Field label="Start" value={fmtStart(r)} />
                      <Field label="Slut" value={fmtEnd(r)} />
                      <Field label="Rast" value={formatMinutes(r.break_minutes)} />
                      <Field label="Arbetstid" value={formatMinutes(r.workMinutes)} bold />
                    </div>
                    {r.comment && (
                      <div className="mt-2 text-xs">
                        <span className="text-muted-foreground">Personal: </span>
                        <span className="whitespace-pre-wrap">{r.comment}</span>
                      </div>
                    )}
                    {r.review_comment && (
                      <div className="mt-1 text-xs">
                        <span className="text-muted-foreground">Admin: </span>
                        <span className="whitespace-pre-wrap">{r.review_comment}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

const Field: React.FC<{ label: string; value: string; bold?: boolean }> = ({ label, value, bold }) => (
  <div className="flex flex-col">
    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
    <span className={`tabular-nums ${bold ? "font-semibold" : ""}`}>{value}</span>
  </div>
);

export default PayrollMonthStaffDetailDrawer;
