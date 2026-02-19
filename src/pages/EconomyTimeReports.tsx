import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { Check, Clock, Minus, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type TimeEntry = {
  type: "time";
  id: string;
  date: string;
  staffName: string;
  projectName: string;
  startTime: string | null;
  endTime: string | null;
  hours: number;
  overtimeHours: number;
  description: string | null;
  approved: boolean;
};

type PurchaseEntry = {
  type: "purchase";
  id: string;
  date: string;
  supplier: string | null;
  projectName: string;
  description: string;
  amount: number;
  category: string | null;
};

type ReportEntry = TimeEntry | PurchaseEntry;

const EconomyTimeReports = () => {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["economy-time-reports", typeFilter],
    queryFn: async () => {
      const results: ReportEntry[] = [];

      if (typeFilter !== "purchase") {
        const { data: timeReports } = await supabase
          .from("time_reports")
          .select(`
            id, report_date, start_time, end_time, hours_worked, overtime_hours,
            description, approved,
            staff_members!inner(name),
            bookings!inner(client, assigned_project_name)
          `)
          .order("report_date", { ascending: false })
          .limit(500);

        if (timeReports) {
          for (const tr of timeReports) {
            const staff = tr.staff_members as any;
            const booking = tr.bookings as any;
            results.push({
              type: "time",
              id: tr.id,
              date: tr.report_date,
              staffName: staff?.name ?? "–",
              projectName: booking?.assigned_project_name || booking?.client || "–",
              startTime: tr.start_time,
              endTime: tr.end_time,
              hours: tr.hours_worked,
              overtimeHours: tr.overtime_hours ?? 0,
              description: tr.description,
              approved: tr.approved ?? false,
            });
          }
        }
      }

      if (typeFilter !== "time") {
        const { data: purchases } = await supabase
          .from("project_purchases")
          .select(`
            id, purchase_date, amount, description, supplier, category,
            projects!inner(name)
          `)
          .order("purchase_date", { ascending: false })
          .limit(500);

        if (purchases) {
          for (const p of purchases) {
            const project = p.projects as any;
            results.push({
              type: "purchase",
              id: p.id,
              date: p.purchase_date ?? "",
              supplier: p.supplier,
              projectName: project?.name ?? "–",
              description: p.description,
              amount: p.amount,
              category: p.category,
            });
          }
        }
      }

      return results.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("time_reports")
        .update({ approved: true, approved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["economy-time-reports"] });
      queryClient.invalidateQueries({ queryKey: ["pending-time-reports"] });
      queryClient.invalidateQueries({ queryKey: ["economy-overview"] });
      toast.success("Tidrapport godkänd");
    },
  });

  const approveAllMutation = useMutation({
    mutationFn: async () => {
      const pendingIds = entries
        .filter((e): e is TimeEntry => e.type === "time" && !e.approved)
        .map((e) => e.id);
      if (!pendingIds.length) return;
      const { error } = await supabase
        .from("time_reports")
        .update({ approved: true, approved_at: new Date().toISOString() })
        .in("id", pendingIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["economy-time-reports"] });
      queryClient.invalidateQueries({ queryKey: ["pending-time-reports"] });
      queryClient.invalidateQueries({ queryKey: ["economy-overview"] });
      toast.success("Alla väntande tidrapporter godkända");
    },
  });

  const pendingCount = entries.filter(
    (e): e is TimeEntry => e.type === "time" && !e.approved
  ).length;

  const filtered = entries.filter((e) => {
    if (!search) return true;
    const s = search.toLowerCase();
    if (e.type === "time") {
      return (
        e.staffName.toLowerCase().includes(s) ||
        e.projectName.toLowerCase().includes(s) ||
        (e.description?.toLowerCase().includes(s) ?? false)
      );
    }
    return (
      e.projectName.toLowerCase().includes(s) ||
      e.description.toLowerCase().includes(s) ||
      (e.supplier?.toLowerCase().includes(s) ?? false)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Rapporterad tid / Utlägg
          </h1>
          <p className="text-sm text-muted-foreground">
            Samlad lista över tidrapporter och projektutlägg
          </p>
        </div>
        {pendingCount > 0 && (
          <Button
            onClick={() => approveAllMutation.mutate()}
            disabled={approveAllMutation.isPending}
            className="bg-[hsl(184_55%_38%)] hover:bg-[hsl(184_55%_32%)] text-white"
          >
            <CheckCheck className="h-4 w-4 mr-2" />
            Godkänn alla väntande ({pendingCount})
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla</SelectItem>
            <SelectItem value="time">Tidrapporter</SelectItem>
            <SelectItem value="purchase">Utlägg</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="Sök personal, projekt, leverantör..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Datum</TableHead>
              <TableHead>Typ</TableHead>
              <TableHead>Personal / Leverantör</TableHead>
              <TableHead>Projekt</TableHead>
              <TableHead>Detalj</TableHead>
              <TableHead className="text-right">Belopp / Timmar</TableHead>
              <TableHead className="text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Laddar...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Inga poster hittades
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((entry) => (
                <TableRow key={`${entry.type}-${entry.id}`}>
                  <TableCell className="whitespace-nowrap">
                    {entry.date
                      ? format(new Date(entry.date), "d MMM yyyy", { locale: sv })
                      : "–"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        entry.type === "time"
                          ? "border-blue-300 text-blue-700 bg-blue-50"
                          : "border-orange-300 text-orange-700 bg-orange-50"
                      }
                    >
                      {entry.type === "time" ? "Tid" : "Utlägg"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {entry.type === "time" ? entry.staffName : entry.supplier ?? "–"}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {entry.projectName}
                  </TableCell>
                  <TableCell className="max-w-[250px] truncate text-muted-foreground text-sm">
                    {entry.type === "time"
                      ? entry.description ??
                        (entry.startTime && entry.endTime
                          ? `${entry.startTime}–${entry.endTime}`
                          : "–")
                      : entry.description}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap font-medium">
                    {entry.type === "time" ? (
                      <>
                        {entry.hours}h
                        {entry.overtimeHours > 0 && (
                          <span className="text-orange-600 ml-1">
                            +{entry.overtimeHours}h öt
                          </span>
                        )}
                      </>
                    ) : (
                      <>{Number(entry.amount).toLocaleString("sv-SE")} kr</>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {entry.type === "time" ? (
                      entry.approved ? (
                        <span className="inline-flex items-center gap-1 text-green-600">
                          <Check className="h-4 w-4" />
                        </span>
                      ) : (
                        <button
                          onClick={() => approveMutation.mutate(entry.id)}
                          disabled={approveMutation.isPending}
                          className="inline-flex items-center gap-1 text-amber-600 hover:text-amber-800 cursor-pointer transition-colors"
                          title="Klicka för att godkänna"
                        >
                          <Clock className="h-4 w-4" />
                          <span className="text-xs font-medium">Väntar</span>
                        </button>
                      )
                    ) : (
                      <span className="text-muted-foreground">
                        <Minus className="h-4 w-4 inline" />
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default EconomyTimeReports;
