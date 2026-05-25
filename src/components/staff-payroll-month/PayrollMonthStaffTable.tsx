import React from "react";
import { Table, TableHead, TableHeader, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";
import { format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import {
  formatMinutes,
  type PayrollMonthStaffSummary,
} from "@/hooks/staff/usePayrollMonthReport";

interface Props {
  summaries: PayrollMonthStaffSummary[];
  onOpen: (staffId: string) => void;
  isLoading?: boolean;
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  try { return format(parseISO(d), "d MMM", { locale: sv }); } catch { return d; }
}

function StateBadge({ state }: { state: PayrollMonthStaffSummary["state"] }) {
  if (state === "klar") {
    return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300">Klar</Badge>;
  }
  if (state === "partial") {
    return <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300">Delvis klar</Badge>;
  }
  return <Badge variant="outline" className="border-rose-500/40 text-rose-700 dark:text-rose-300">Saknar godkända dagar</Badge>;
}

const PayrollMonthStaffTable: React.FC<Props> = ({ summaries, onOpen, isLoading }) => {
  if (isLoading) {
    return <div className="px-4 py-8 text-sm text-muted-foreground">Laddar månadsdata…</div>;
  }
  if (!summaries.length) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Inga godkända dagar i vald månad.
        </p>
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
              <TableHead>Första dag</TableHead>
              <TableHead>Sista dag</TableHead>
              <TableHead className="text-right">Arbetstid</TableHead>
              <TableHead className="text-right">Rast</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[120px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {summaries.map((s) => (
              <TableRow key={s.staffId} className="hover:bg-muted/30">
                <TableCell className="font-medium">{s.staffName}</TableCell>
                <TableCell className="text-right tabular-nums">{s.approvedDayCount}</TableCell>
                <TableCell>{fmtDate(s.firstWorkedDate)}</TableCell>
                <TableCell>{fmtDate(s.lastWorkedDate)}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">
                  {formatMinutes(s.totalWorkMinutes)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatMinutes(s.totalBreakMinutes)}
                </TableCell>
                <TableCell><StateBadge state={s.state} /></TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={() => onOpen(s.staffId)}>
                    <Eye className="h-3.5 w-3.5" /> Detaljer
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default PayrollMonthStaffTable;
