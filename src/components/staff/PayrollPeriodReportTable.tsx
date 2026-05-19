import { Fragment, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  usePayrollPeriodReport,
  type PayrollPeriodReportGroup,
  type PayrollPeriodReportRow,
} from "@/hooks/staff/usePayrollPeriods";
import { useApprovePayrollPeriodDays } from "@/hooks/staff/useApprovePayrollPeriodDays";
import { PayrollPeriodApprovalPanel } from "./PayrollPeriodApprovalPanel";

function fmtDuration(min: number | null | undefined): string {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function timeStr(t: string | null, isoFallback: string | null): string {
  if (t && t.length >= 5) return t.slice(0, 5);
  if (isoFallback) {
    try {
      const d = new Date(isoFallback);
      return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
    } catch {
      return "—";
    }
  }
  return "—";
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    submitted: { label: "Inskickad", cls: "bg-blue-500/15 text-blue-600 border-blue-500/30" },
    edited: { label: "Inskickad (ändrad)", cls: "bg-blue-500/15 text-blue-600 border-blue-500/30" },
    needs_control: { label: "Kontroll", cls: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30" },
    approved: { label: "OK", cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
    payroll_approved: { label: "Godkänd", cls: "bg-violet-500/15 text-violet-600 border-violet-500/30" },
    ai_flagged: { label: "AI flaggad", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
    needs_user_attention: { label: "Behöver svar", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  };
  const e = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground border-border" };
  return <Badge variant="outline" className={e.cls}>{e.label}</Badge>;
}

interface Props {
  periodId: string | null;
}

export function PayrollPeriodReportTable({ periodId }: Props) {
  const q = usePayrollPeriodReport(periodId);
  const [openStaff, setOpenStaff] = useState<Record<string, boolean>>({});

  if (!periodId) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        Välj eller skapa en löneperiod för att se underlaget.
      </Card>
    );
  }
  if (q.isLoading) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
        Laddar period…
      </Card>
    );
  }
  if (q.error) {
    return (
      <Card className="p-6 text-sm text-destructive">
        Kunde inte ladda: {(q.error as any)?.message ?? "okänt fel"}
      </Card>
    );
  }
  if (!q.data) return null;

  const { period, totals, groups } = q.data;

  const counts = useMemo(() => {
    let needsControl = 0;
    let eligible = 0;
    let payrollApproved = 0;
    for (const g of groups) {
      for (const r of g.rows) {
        if (r.status === "needs_control") needsControl++;
        else if (r.status === "payroll_approved") payrollApproved++;
        else if (r.status === "submitted" || r.status === "edited" || r.status === "approved") eligible++;
      }
    }
    return { needsControl, eligible, payrollApproved };
  }, [groups]);

  const isLocked = period.status === "approved_for_payout";
  const approve = useApprovePayrollPeriodDays();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleApprove = async () => {
    try {
      const s = await approve.mutateAsync(period.id);
      toast.success(
        `Godkände ${s.includedDays} dagar för ${s.staffCount} personal` +
          (s.excludedNeedsControl > 0
            ? ` (${s.excludedNeedsControl} kontrollmarkerade ingår inte)`
            : ""),
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Kunde inte godkänna perioden");
    } finally {
      setConfirmOpen(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm text-muted-foreground">Period</div>
          <div className="text-lg font-semibold flex items-center gap-2">
            {period.name}
            {isLocked ? (
              <Badge variant="outline" className="bg-violet-500/15 text-violet-600 border-violet-500/30">
                Godkänd för utbetalning
              </Badge>
            ) : null}
          </div>
          <div className="text-sm text-muted-foreground">
            {period.period_start} → {period.period_end}
          </div>
        </div>
        <div className="flex gap-6 text-sm">
          <div>
            <div className="text-muted-foreground">Personal</div>
            <div className="font-semibold text-base">{totals.staff_count}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Dagrapporter</div>
            <div className="font-semibold text-base">{totals.submissions_count}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Total tid</div>
            <div className="font-semibold text-base">{fmtDuration(totals.total_minutes)}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={isLocked || approve.isPending || counts.eligible === 0}
            className="gap-2"
          >
            {approve.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Godkänn alla dagar i perioden
          </Button>
        </div>
      </Card>

      {counts.needsControl > 0 && !isLocked ? (
        <Card className="p-3 border-yellow-500/40 bg-yellow-500/10 text-yellow-800 dark:text-yellow-200 flex items-start gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            {counts.needsControl} dagar är markerade för kontroll och ingår inte förrän de är åtgärdade.
          </div>
        </Card>
      ) : null}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Godkänn alla dagar i perioden?</AlertDialogTitle>
            <AlertDialogDescription>
              {counts.eligible} dagar markeras som Godkänd för utbetalning.
              {counts.needsControl > 0
                ? ` ${counts.needsControl} kontrollmarkerade dagar ingår inte.`
                : ""}
              {counts.payrollApproved > 0
                ? ` ${counts.payrollApproved} dagar är redan godkända.`
                : ""}
              {" "}Detta kan inte ångras från listan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleApprove}>Godkänn</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PayrollPeriodApprovalPanel
        periodId={period.id}
        isLocked={isLocked}
        approvedAt={(period as any).approved_for_payout_at ?? null}
      />



      {groups.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          Inga inskickade dagrapporter i perioden.
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Personal</TableHead>
                <TableHead className="text-right">Dagar</TableHead>
                <TableHead className="text-right">Total tid</TableHead>
                <TableHead className="text-right">Total rast</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g: PayrollPeriodReportGroup) => {
                const isOpen = openStaff[g.staff_id] ?? false;
                return (
                  <Fragment key={g.staff_id}>
                    <TableRow
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() =>
                        setOpenStaff((s) => ({ ...s, [g.staff_id]: !isOpen }))
                      }
                    >
                      <TableCell>
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{g.staff_name}</TableCell>
                      <TableCell className="text-right font-mono">{g.days_reported}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {fmtDuration(g.total_minutes)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {g.total_break_minutes} min
                      </TableCell>
                    </TableRow>
                    {isOpen ? (
                      <TableRow>
                        <TableCell colSpan={5} className="p-0 bg-muted/30">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Datum</TableHead>
                                <TableHead>Start</TableHead>
                                <TableHead>Slut</TableHead>
                                <TableHead>Rast</TableHead>
                                <TableHead>Total tid</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Kommentar</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {g.rows.map((r: PayrollPeriodReportRow) => (
                                <TableRow key={r.id}>
                                  <TableCell className="font-mono text-xs">{r.date}</TableCell>
                                  <TableCell className="font-mono">
                                    {timeStr(r.start_time, r.requested_start_at)}
                                  </TableCell>
                                  <TableCell className="font-mono">
                                    {timeStr(r.end_time, r.requested_end_at)}
                                  </TableCell>
                                  <TableCell className="font-mono">{r.break_minutes} min</TableCell>
                                  <TableCell className="font-mono font-semibold">
                                    {fmtDuration(r.total_minutes)}
                                  </TableCell>
                                  <TableCell>{statusBadge(r.status)}</TableCell>
                                  <TableCell className="text-sm text-muted-foreground max-w-[320px] truncate">
                                    {r.comment ?? "—"}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
