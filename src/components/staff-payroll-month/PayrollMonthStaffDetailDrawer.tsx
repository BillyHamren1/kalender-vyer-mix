import React from "react";
import { Link } from "react-router-dom";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExternalLink, X, Wallet, ClipboardCheck } from "lucide-react";
import { format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import {
  formatMinutes,
  type PayrollMonthGroup,
  type PayrollMonthRow,
} from "@/hooks/staff/usePayrollMonthReport";

interface Props {
  group: PayrollMonthGroup | null;
  month: string; // YYYY-MM
  open: boolean;
  onClose: () => void;
}

function StatusBadge({ status }: { status: PayrollMonthRow["status"] }) {
  if (status === "payroll_approved") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300">
        Utbetalning godkänd
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-sky-500/40 text-sky-700 dark:text-sky-300"
    >
      Godkänd
    </Badge>
  );
}

function fmtStart(r: PayrollMonthRow): string {
  if (r.requested_start_at) {
    try {
      return format(parseISO(r.requested_start_at), "HH:mm");
    } catch {
      /* fall through */
    }
  }
  return r.start_time?.slice(0, 5) ?? "—";
}

function fmtEnd(r: PayrollMonthRow): string {
  if (r.requested_end_at) {
    try {
      return format(parseISO(r.requested_end_at), "HH:mm");
    } catch {
      /* fall through */
    }
  }
  return r.end_time?.slice(0, 5) ?? "—";
}

function formatMonth(month: string): string {
  try {
    return format(new Date(`${month}-01T00:00:00`), "LLLL yyyy", { locale: sv });
  } catch {
    return month;
  }
}

function formatDayDate(date: string): string {
  try {
    return format(parseISO(date), "d MMM yyyy", { locale: sv });
  } catch {
    return date;
  }
}

function formatWeekday(date: string): string {
  try {
    return format(parseISO(date), "EEEE", { locale: sv });
  } catch {
    return "";
  }
}

const PayrollMonthStaffDetailDrawer: React.FC<Props> = ({
  group,
  month,
  open,
  onClose,
}) => {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[920px] p-0 flex flex-col"
      >
        {group && (
          <>
            <div className="px-5 pt-5 pb-3 border-b">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold capitalize">
                    {group.staff_name} ·{" "}
                    <span className="text-muted-foreground font-normal">
                      {formatMonth(month)}
                    </span>
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Underlag för löneutbetalning – godkänd tid i månaden.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={onClose}
                  aria-label="Stäng"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Summary chips */}
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <SummaryChip
                  label="Total arbetstid"
                  value={formatMinutes(group.total_minutes)}
                  emphasized
                />
                <SummaryChip label="Antal dagar" value={String(group.days_count)} />
                <SummaryChip
                  label="Total rast"
                  value={formatMinutes(group.total_break_minutes)}
                />
                <SummaryChip
                  label="Klar för lön / Godkänd"
                  value={`${group.payroll_approved_days_count} / ${group.approved_days_count}`}
                  icon={
                    group.payroll_approved_days_count === group.days_count ? (
                      <Wallet className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <ClipboardCheck className="h-3.5 w-3.5 text-amber-600" />
                    )
                  }
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {group.rows.length === 0 ? (
                <p className="px-5 py-8 text-sm text-muted-foreground">
                  Inga godkända dagar.
                </p>
              ) : (
                <Table>
                  <TableHeader className="sticky top-0 bg-card">
                    <TableRow>
                      <TableHead>Datum</TableHead>
                      <TableHead>Dag</TableHead>
                      <TableHead className="text-right">Start</TableHead>
                      <TableHead className="text-right">Slut</TableHead>
                      <TableHead className="text-right">Rast</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Kommentar</TableHead>
                      <TableHead>Admin</TableHead>
                      <TableHead className="w-[110px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.rows.map((r) => (
                      <TableRow key={r.id} className="align-top">
                        <TableCell className="font-medium whitespace-nowrap">
                          {formatDayDate(r.date)}
                        </TableCell>
                        <TableCell className="capitalize text-muted-foreground">
                          {formatWeekday(r.date)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtStart(r)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtEnd(r)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatMinutes(r.break_minutes)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {formatMinutes(r.total_minutes)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={r.status} />
                        </TableCell>
                        <TableCell className="text-xs max-w-[180px] whitespace-pre-wrap">
                          {r.comment ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-xs max-w-[180px] whitespace-pre-wrap">
                          {r.review_comment ?? (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Link
                            to={`/staff-management/time-reports/${r.staff_id}/${r.date}`}
                            className="text-xs text-primary hover:underline inline-flex items-center gap-1 whitespace-nowrap"
                          >
                            Öppna dag <ExternalLink className="h-3 w-3" />
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

const SummaryChip: React.FC<{
  label: string;
  value: string;
  icon?: React.ReactNode;
  emphasized?: boolean;
}> = ({ label, value, icon, emphasized }) => (
  <div className="rounded-md border border-border/40 bg-card px-2.5 py-1.5">
    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
      {icon}
      <span>{label}</span>
    </div>
    <div
      className={`mt-0.5 tabular-nums ${emphasized ? "text-base font-semibold" : "text-sm font-medium"}`}
    >
      {value}
    </div>
  </div>
);

export default PayrollMonthStaffDetailDrawer;
