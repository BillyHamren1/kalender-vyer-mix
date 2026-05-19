import { useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchStaffMembers } from "@/services/staffService";
import { useStaffDaySubmissions } from "@/hooks/staff/useStaffDaySubmissions";
import { StaffDayReportRow } from "./StaffDayReportRow";

const STATUS_OPTIONS = [
  { value: "all", label: "Alla statusar" },
  { value: "submitted", label: "Inskickad" },
  { value: "edited", label: "Inskickad (ändrad)" },
  { value: "needs_control", label: "Kontroll" },
  { value: "approved", label: "OK" },
  { value: "payroll_approved", label: "Godkänd för utbetalning" },
  { value: "ai_flagged", label: "AI flaggad" },
  { value: "needs_user_attention", label: "Behöver svar" },
];

export function StaffDayReportsList() {
  const today = format(new Date(), "yyyy-MM-dd");
  const defaultFrom = format(subDays(new Date(), 13), "yyyy-MM-dd");

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(today);
  const [staffId, setStaffId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");

  const staffQuery = useQuery({
    queryKey: ["staff-members-for-day-reports"],
    queryFn: () => fetchStaffMembers(),
    staleTime: 5 * 60_000,
  });

  const submissionsQuery = useStaffDaySubmissions({
    from,
    to,
    staffId: staffId === "all" ? null : staffId,
    status: status === "all" ? null : status,
  });

  const staffMap = useMemo(() => {
    const map = new Map<string, string>();
    (staffQuery.data ?? []).forEach((s: any) => map.set(String(s.id), s.name));
    return map;
  }, [staffQuery.data]);

  const rows = submissionsQuery.data ?? [];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="from">Från</Label>
            <Input
              id="from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              max={to}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to">Till</Label>
            <Input
              id="to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              min={from}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Personal</Label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger>
                <SelectValue placeholder="Alla" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla</SelectItem>
                {(staffQuery.data ?? []).map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Datum</TableHead>
              <TableHead>Personal</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>Slut</TableHead>
              <TableHead>Rast</TableHead>
              <TableHead>Total tid</TableHead>
              <TableHead>Kommentar</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Åtgärder</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {submissionsQuery.isLoading ? (
              <TableRow>
                <td colSpan={9} className="p-8 text-center text-muted-foreground">
                  <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
                  Laddar…
                </td>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <td colSpan={9} className="p-8 text-center text-muted-foreground">
                  Inga inskickade dagrapporter i valt intervall.
                </td>
              </TableRow>
            ) : (
              rows.map((r) => (
                <StaffDayReportRow
                  key={r.id}
                  row={r}
                  staffName={staffMap.get(r.staff_id) ?? r.staff_id}
                />
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {submissionsQuery.error ? (
        <p className="text-sm text-destructive">
          Kunde inte ladda: {(submissionsQuery.error as any)?.message ?? "okänt fel"}
        </p>
      ) : null}
    </div>
  );
}
