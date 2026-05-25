import React, { useMemo, useState } from "react";
import { addDays, endOfWeek, format, getISOWeek, startOfWeek } from "date-fns";
import { sv } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useStaffWeeklyTimeApprovals } from "@/hooks/staff/useStaffWeeklyTimeApprovals";
import { useApproveStaffWeek, NoApprovableError } from "@/hooks/staff/useApproveStaffWeek";
import WeekApprovalToolbar from "./WeekApprovalToolbar";
import StaffWeeklyApprovalList from "./StaffWeeklyApprovalList";
import StaffWeeklyApprovalPanel from "./StaffWeeklyApprovalPanel";
import { buildWeeklyBundles } from "./weeklyApprovalModel";

interface SummaryChipProps {
  label: string;
  value: number;
  tone?: "default" | "amber" | "rose" | "emerald" | "sky" | "indigo";
}

const TONE_CLASS: Record<NonNullable<SummaryChipProps["tone"]>, string> = {
  default: "bg-muted text-foreground border-border",
  amber: "bg-amber-500/10 text-amber-800 border-amber-500/30 dark:text-amber-300",
  rose: "bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-300",
  emerald: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  sky: "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-300",
  indigo: "bg-indigo-500/10 text-indigo-700 border-indigo-500/30 dark:text-indigo-300",
};

const SummaryChip: React.FC<SummaryChipProps> = ({ label, value, tone = "default" }) => (
  <div
    className={`inline-flex items-center gap-1.5 px-2.5 h-7 rounded-md border text-xs font-medium ${TONE_CLASS[tone]}`}
  >
    <span className="tabular-nums">{value}</span>
    <span className="text-[11px] opacity-80 font-normal">{label}</span>
  </div>
);

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

  // UI-statusar filtreras i modellen, inte i Supabase-queryn.
  const UI_ONLY = new Set([
    "all",
    "todo",
    "approved",
    "pending_staff_attest",
    "pending_admin_attest",
  ]);

  const { data, isLoading, error } = useStaffWeeklyTimeApprovals({
    weekStart: weekStartIso,
    weekEnd: weekEndIso,
    staffId: staffFilter !== "all" ? staffFilter : null,
    status: UI_ONLY.has(statusFilter) ? null : statusFilter,
  });

  const approveWeek = useApproveStaffWeek();

  const bundles = useMemo(() => {
    if (!data) return [];
    let all = buildWeeklyBundles(data.staff, data.submissions, data.cacheRows, weekStart);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      all = all.filter((b) => b.staff.name.toLowerCase().includes(q));
    }
    if (statusFilter === "todo") all = all.filter((b) => b.hasTodo);
    else if (statusFilter === "approved") all = all.filter((b) => b.allDone);
    else if (statusFilter === "pending_staff_attest")
      all = all.filter((b) => b.pendingStaffAttestCount > 0);
    else if (statusFilter === "pending_admin_attest")
      all = all.filter((b) => b.pendingAdminAttestCount > 0);
    else if (statusFilter === "correction_requested")
      all = all.filter((b) => b.correctionRequestedCount > 0);

    // Visa bundles som faktiskt har något att säga (submission/engine_cache/engine_error).
    // no_report-only bundles syns inte.
    all = all.filter(
      (b) =>
        b.submittedCount > 0 ||
        b.pendingStaffAttestCount > 0 ||
        b.engineProposalCount > 0 ||
        b.engineErrorCount > 0,
    );
    return all;
  }, [data, weekStart, search, statusFilter]);

  const todo = useMemo(() => bundles.filter((b) => b.hasTodo), [bundles]);
  const approved = useMemo(
    () => bundles.filter((b) => !b.hasTodo && b.allDone),
    [bundles],
  );

  const summary = useMemo(() => {
    let pendingStaffDays = 0;
    let pendingAdminDays = 0;
    let correctionDays = 0;
    let approvableDays = 0;
    let approvedDays = 0;
    let engineErrorDays = 0;
    for (const b of bundles) {
      pendingStaffDays += b.pendingStaffAttestCount;
      pendingAdminDays += b.pendingAdminAttestCount;
      correctionDays += b.correctionRequestedCount;
      approvableDays += b.adminApprovableCount;
      approvedDays += b.approvedCount;
      engineErrorDays += b.engineErrorCount;
    }
    return {
      persons: bundles.length,
      todoPersons: todo.length,
      approvedPersons: approved.length,
      pendingStaffDays,
      pendingAdminDays,
      correctionDays,
      approvableDays,
      approvedDays,
      engineErrorDays,
    };
  }, [bundles, todo, approved]);

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
        onError: (e: any) => {
          if (e instanceof NoApprovableError) {
            toast({ title: "Inget att godkänna", description: e.message });
          } else {
            toast({
              title: "Kunde inte godkänna vecka",
              description: e.message,
              variant: "destructive",
            });
          }
        },
        onSettled: () => setApprovingStaffId(null),
      },
    );
  };

  return (
    <div className="flex flex-col min-h-full bg-background">
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
      />

      <div className="px-4 py-2 border-b border-border/40 flex flex-wrap items-center gap-2">
        <SummaryChip label="personer" value={summary.persons} />
        <SummaryChip label="att göra" value={summary.todoPersons} tone="amber" />
        {summary.pendingStaffDays > 0 && (
          <SummaryChip label="väntar personalattest" value={summary.pendingStaffDays} tone="indigo" />
        )}
        {summary.pendingAdminDays > 0 && (
          <SummaryChip label="väntar adminattest" value={summary.pendingAdminDays} tone="amber" />
        )}
        {summary.correctionDays > 0 && (
          <SummaryChip label="behöver komplettering" value={summary.correctionDays} tone="rose" />
        )}
        {summary.engineErrorDays > 0 && (
          <SummaryChip label="beräkningsfel" value={summary.engineErrorDays} tone="rose" />
        )}
        <SummaryChip label="godkännbara dagar" value={summary.approvableDays} tone="sky" />
        <SummaryChip label="godkända dagar" value={summary.approvedDays} tone="emerald" />
      </div>

      <div className="flex-1 px-4 py-3 min-w-0">
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

      <Sheet open={!!openBundle} onOpenChange={(o) => !o && setOpenStaffId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-[900px] p-0 flex flex-col">
          {openBundle && (
            <StaffWeeklyApprovalPanel
              bundle={openBundle}
              weekNumber={weekNumber}
              weekRangeLabel={weekRangeLabel}
              onClose={() => setOpenStaffId(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default StaffTimeApprovalsPageContent;
