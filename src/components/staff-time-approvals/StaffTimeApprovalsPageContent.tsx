import React, { useMemo, useState } from "react";
import { addDays, endOfWeek, format, getISOWeek, startOfWeek } from "date-fns";
import { sv } from "date-fns/locale";
import { ClipboardCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useStaffWeeklyTimeApprovals,
  type StaffDaySubmissionStatus,
} from "@/hooks/staff/useStaffWeeklyTimeApprovals";
import { useApproveStaffWeek } from "@/hooks/staff/useApproveStaffWeek";
import WeekApprovalToolbar from "./WeekApprovalToolbar";
import StaffWeeklyApprovalList from "./StaffWeeklyApprovalList";
import StaffWeeklyApprovalPanel from "./StaffWeeklyApprovalPanel";
import ApprovalDashboardStrip from "./ApprovalDashboardStrip";
import {
  APPROVED_STATUSES,
  buildWeeklyBundles,
  TODO_STATUSES,
} from "./weeklyApprovalModel";

export const StaffTimeApprovalsPageContent: React.FC = () => {
  const { toast } = useToast();
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [openStaffId, setOpenStaffId] = useState<string | null>(null);
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [approvingStaffId, setApprovingStaffId] = useState<string | null>(null);

  const weekStart = useMemo(() => startOfWeek(anchor, { weekStartsOn: 1 }), [anchor]);
  const weekEnd = useMemo(() => endOfWeek(anchor, { weekStartsOn: 1 }), [anchor]);
  const weekNumber = useMemo(() => getISOWeek(weekStart), [weekStart]);
  const weekStartIso = format(weekStart, "yyyy-MM-dd");
  const weekEndIso = format(weekEnd, "yyyy-MM-dd");
  const weekRangeLabel = `${format(weekStart, "d MMM", { locale: sv })} – ${format(weekEnd, "d MMM yyyy", { locale: sv })}`;

  const { data, isLoading, error } = useStaffWeeklyTimeApprovals({
    weekStart: weekStartIso,
    weekEnd: weekEndIso,
    staffId: staffFilter !== "all" ? staffFilter : null,
    status:
      statusFilter !== "all" && statusFilter !== "todo" && statusFilter !== "approved"
        ? statusFilter
        : null,
  });

  const approveWeek = useApproveStaffWeek();

  const bundles = useMemo(() => {
    if (!data) return [];
    let all = buildWeeklyBundles(data.staff, data.submissions, weekStart);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      all = all.filter((b) => b.staff.name.toLowerCase().includes(q));
    }
    if (statusFilter === "todo") all = all.filter((b) => b.hasTodo);
    else if (statusFilter === "approved")
      all = all.filter((b) => b.allDone && b.submittedCount > 0);
    // Annars: visa bundles där minst en dag har submission ELLER har todo
    all = all.filter((b) => b.submittedCount > 0 || b.hasTodo);
    return all;
  }, [data, weekStart, search, statusFilter]);

  const todo = useMemo(() => bundles.filter((b) => b.hasTodo), [bundles]);
  const approved = useMemo(
    () => bundles.filter((b) => !b.hasTodo && b.allDone && b.submittedCount > 0),
    [bundles],
  );

  const openBundle = useMemo(
    () => bundles.find((b) => b.staff.id === openStaffId) ?? null,
    [bundles, openStaffId],
  );

  const handleApproveWeek = (staffId: string) => {
    const bundle = bundles.find((b) => b.staff.id === staffId);
    if (!bundle) return;
    setApprovingStaffId(staffId);
    approveWeek.mutate(
      { submissions: bundle.submissions },
      {
        onSuccess: (res) => {
          if (res.failed.length > 0 || res.blockedDates.length > 0) {
            toast({
              title: "Vecka delvis godkänd",
              description: `Godkände ${res.approvedCount}. ${res.failed.length + res.blockedDates.length} dag(ar) kräver åtgärd.`,
              variant: "destructive",
            });
          } else {
            toast({
              title: "Vecka godkänd",
              description: `${bundle.staff.name} · ${res.approvedCount} dag(ar)`,
            });
          }
        },
        onError: (e: any) =>
          toast({ title: "Kunde inte godkänna vecka", description: e.message, variant: "destructive" }),
        onSettled: () => setApprovingStaffId(null),
      },
    );
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-background via-background to-muted/20">
      <ApprovalDashboardStrip />

      <WeekApprovalToolbar
        weekStart={weekStart}
        weekEnd={weekEnd}
        weekNumber={weekNumber}
        onPrev={() => setAnchor(addDays(anchor, -7))}
        onNext={() => setAnchor(addDays(anchor, 7))}
        onToday={() => setAnchor(new Date())}
        staff={data?.staff ?? []}
        staffFilter={staffFilter}
        onStaffFilterChange={setStaffFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        search={search}
        onSearchChange={setSearch}
        counts={{ todo: todo.length, approved: approved.length }}
      />

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-4 p-4 min-h-0">
        <div className="min-w-0 rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm shadow-sm p-3">
          {isLoading ? (
            <div className="text-sm text-muted-foreground p-4">Laddar veckan…</div>
          ) : error ? (
            <div className="text-sm text-destructive p-4">
              Kunde inte ladda: {(error as Error).message}
            </div>
          ) : (
            <StaffWeeklyApprovalList
              todo={todo}
              approved={approved}
              openStaffId={openStaffId}
              onOpen={setOpenStaffId}
              approvingStaffId={approvingStaffId}
              onApproveWeek={handleApproveWeek}
            />
          )}
        </div>
        <div className="min-w-0 min-h-0">
          {openBundle ? (
            <StaffWeeklyApprovalPanel
              bundle={openBundle}
              weekNumber={weekNumber}
              weekRangeLabel={weekRangeLabel}
              onClose={() => setOpenStaffId(null)}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-3 border border-dashed border-border/50 rounded-2xl bg-gradient-to-br from-muted/20 via-card/40 to-muted/10 text-sm text-muted-foreground p-8 text-center">
              <div className="h-12 w-12 rounded-full bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center">
                <ClipboardCheck className="h-6 w-6 text-primary" />
              </div>
              <div className="font-medium text-foreground">Inget öppet</div>
              <div className="max-w-[280px]">
                Välj en person till vänster för att se veckans dagar och godkänna.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StaffTimeApprovalsPageContent;
