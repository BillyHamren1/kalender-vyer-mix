import { useState } from "react";
import { format } from "date-fns";
import { Check, AlertTriangle, MessageSquare, ExternalLink, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { StaffDaySubmissionRow } from "@/hooks/staff/useStaffDaySubmissions";
import {
  useUpdateStaffDaySubmissionStatus,
  type AdminDayStatusUpdate,
} from "@/hooks/staff/useUpdateStaffDaySubmissionStatus";
import { toast } from "sonner";

interface Props {
  row: StaffDaySubmissionRow;
  staffName: string;
}

function formatTime(t: string | null, fallbackIso: string | null): string {
  if (t && t.length >= 5) return t.slice(0, 5);
  if (fallbackIso) {
    try {
      return format(new Date(fallbackIso), "HH:mm");
    } catch {
      return "—";
    }
  }
  return "—";
}

function totalMinutes(row: StaffDaySubmissionRow): number | null {
  let startMs: number | null = null;
  let endMs: number | null = null;
  if (row.requested_start_at) startMs = new Date(row.requested_start_at).getTime();
  if (row.requested_end_at) endMs = new Date(row.requested_end_at).getTime();
  if (startMs == null && row.start_time && row.end_time) {
    const [sh, sm] = row.start_time.split(":").map((n) => parseInt(n, 10));
    const [eh, em] = row.end_time.split(":").map((n) => parseInt(n, 10));
    if ([sh, sm, eh, em].every((v) => Number.isFinite(v))) {
      const base = new Date(row.date + "T00:00:00");
      startMs = base.getTime() + (sh * 60 + sm) * 60_000;
      endMs = base.getTime() + (eh * 60 + em) * 60_000;
    }
  }
  if (startMs == null || endMs == null) return null;
  const minutes = Math.max(0, Math.round((endMs - startMs) / 60_000) - (row.break_minutes ?? 0));
  return minutes;
}

function fmtDuration(min: number | null): string {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    submitted: { label: "Inskickad", cls: "bg-blue-500/15 text-blue-600 border-blue-500/30" },
    edited: { label: "Inskickad (ändrad)", cls: "bg-blue-500/15 text-blue-600 border-blue-500/30" },
    ai_flagged: { label: "AI flaggad", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
    needs_user_attention: { label: "Behöver svar", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
    needs_control: { label: "Kontroll", cls: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30" },
    approved: { label: "OK", cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
    payroll_approved: { label: "Godkänd för utbetalning", cls: "bg-violet-500/15 text-violet-600 border-violet-500/30" },
  };
  const entry = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground border-border" };
  return (
    <Badge variant="outline" className={entry.cls}>
      {entry.label}
    </Badge>
  );
}

export function StaffDayReportRow({ row, staffName }: Props) {
  const update = useUpdateDaySubmissionStatus();
  const [busy, setBusy] = useState<DaySubmissionStatus | null>(null);

  const handle = async (status: DaySubmissionStatus) => {
    setBusy(status);
    try {
      await update.mutateAsync({ id: row.id, status });
      toast.success(
        status === "approved"
          ? "Dagrapport markerad som OK"
          : status === "needs_control"
          ? "Dagrapport markerad för kontroll"
          : "Status uppdaterad",
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Kunde inte uppdatera");
    } finally {
      setBusy(null);
    }
  };

  const isLocked = row.status === "payroll_approved";
  const total = totalMinutes(row);

  return (
    <TableRow>
      <TableCell className="font-mono text-xs whitespace-nowrap">{row.date}</TableCell>
      <TableCell className="font-medium">{staffName}</TableCell>
      <TableCell className="font-mono">{formatTime(row.start_time, row.requested_start_at)}</TableCell>
      <TableCell className="font-mono">{formatTime(row.end_time, row.requested_end_at)}</TableCell>
      <TableCell className="font-mono">{row.break_minutes ?? 0} min</TableCell>
      <TableCell className="font-mono font-semibold">{fmtDuration(total)}</TableCell>
      <TableCell className="max-w-[260px]">
        {row.comment ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 text-sm text-muted-foreground truncate">
                  <MessageSquare className="h-3 w-3 shrink-0" />
                  <span className="truncate">{row.comment}</span>
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm whitespace-pre-wrap">{row.comment}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <span className="text-muted-foreground/50">—</span>
        )}
      </TableCell>
      <TableCell>{statusBadge(row.status)}</TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
            disabled={isLocked || busy !== null}
            onClick={() => handle("approved")}
            title="Markera OK"
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-yellow-600 hover:text-yellow-700 hover:bg-yellow-500/10"
            disabled={isLocked || busy !== null}
            onClick={() => handle("needs_control")}
            title="Markera för kontroll"
          >
            <AlertTriangle className="h-4 w-4" />
          </Button>
          <Button asChild size="sm" variant="ghost" title="Öppna dag (referens)">
            <Link to={`/staff-management/time-reports/${row.staff_id}/${row.date}`}>
              <ExternalLink className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
