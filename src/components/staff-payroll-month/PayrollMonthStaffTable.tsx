import React from "react";
import {
  Table,
  TableHead,
  TableHeader,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Eye, Wallet } from "lucide-react";
import { format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import {
  formatMinutes,
  type PayrollMonthGroup,
} from "@/hooks/staff/usePayrollMonthReport";

interface Props {
  groups: PayrollMonthGroup[];
  onOpen: (staffId: string) => void;
  isLoading?: boolean;
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  try {
    return format(parseISO(d), "d MMM", { locale: sv });
  } catch {
    return d;
  }
}

function periodLabel(g: PayrollMonthGroup): string {
  if (!g.first_date || !g.last_date) return "—";
  if (g.first_date === g.last_date) return fmtDate(g.first_date);
  return `${fmtDate(g.first_date)} – ${fmtDate(g.last_date)}`;
}

type GroupState = "ready_for_payroll" | "approved" | "none";

function statusOf(g: PayrollMonthGroup): GroupState {
  if (g.days_count === 0) return "none";
  if (g.payroll_approved_days_count === g.days_count) return "ready_for_payroll";
  return "approved";
}

function StatusBadge({ state }: { state: GroupState }) {
  if (state === "ready_for_payroll") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300">
        Klar för lön
      </Badge>
    );
  }
  if (state === "approved") {
    return (
      <Badge
        variant="outline"
        className="border-amber-500/40 text-amber-700 dark:text-amber-300"
      >
        Godkänd
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-rose-500/40 text-rose-700 dark:text-rose-300"
    >
      Ingen godkänd tid
    </Badge>
  );
}

const SkeletonRow: React.FC = () => (
  <TableRow>
    {Array.from({ length: 7 }).map((_, i) => (
      <TableCell key={i}>
        <div className="h-4 w-full max-w-[120px] bg-muted/60 rounded animate-pulse" />
      </TableCell>
    ))}
  </TableRow>
);

const PayrollMonthStaffTable: React.FC<Props> = ({ groups, onOpen, isLoading }) => {
  if (isLoading) {
    return (
      <div className="px-4 pb-6">
        <Card className="rounded-lg border border-border/40 overflow-hidden bg-card p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Personal</TableHead>
                <TableHead className="text-right">Godkända dagar</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Arbetstid</TableHead>
                <TableHead className="text-right">Rast</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    );
  }

  if (!groups.length) {
    return (
      <div className="px-4 pb-10">
        <Card className="border-dashed border-2 border-violet-500/20 bg-violet-500/[0.03] p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/10 text-violet-600 mb-3">
            <Wallet className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold">Ingen godkänd tid för vald månad.</h3>
          <p className="mt-1.5 text-sm text-muted-foreground max-w-md mx-auto">
            När dagar godkänns i Tidrapport-attest visas de här som löneunderlag.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-4 pb-6">
      <div className="rounded-lg border border-border/40 overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Personal</TableHead>
              <TableHead className="text-right">Godkända dagar</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Arbetstid</TableHead>
              <TableHead className="text-right">Rast</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[120px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => {
              const state = statusOf(g);
              return (
                <TableRow
                  key={g.staff_id}
                  className="hover:bg-muted/30 cursor-pointer"
                  onClick={() => onOpen(g.staff_id)}
                >
                  <TableCell className="font-medium">{g.staff_name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {g.days_count}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {periodLabel(g)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {formatMinutes(g.total_minutes)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatMinutes(g.total_break_minutes)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge state={state} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(g.staff_id);
                      }}
                    >
                      <Eye className="h-3.5 w-3.5" /> Detaljer
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default PayrollMonthStaffTable;
