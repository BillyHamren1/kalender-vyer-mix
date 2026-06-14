import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Package, Plus, RefreshCw, Search, ArrowUpRight, ArrowDownLeft, Wrench, CalendarIcon, X } from "lucide-react";
import { format, isToday, isThisWeek, isAfter, startOfDay, endOfDay, parseISO, isWithinInterval } from "date-fns";
import { sv } from "date-fns/locale";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { useWarehouseOpsRange, type OpsJob } from "@/hooks/useWarehouseOpsRange";
import CreateInternalTaskDialog from "@/components/warehouse/CreateInternalTaskDialog";
import WarehouseProjectInbox from "@/components/warehouse/WarehouseProjectInbox";

type FilterKey = "active" | "today" | "week" | "upcoming" | "done" | "all";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "active", label: "Aktiva nu" },
  { key: "today", label: "Idag" },
  { key: "week", label: "Denna vecka" },
  { key: "upcoming", label: "Kommande" },
  { key: "done", label: "Klara" },
  { key: "all", label: "Alla" },
];

const ACTIVE_STATUSES = new Set([
  "in_progress",
  "packing",
  "returning",
  "back",
  "started_back",
  "in_production",
]);
const DONE_STATUSES = new Set(["completed_out", "completed_in", "completed", "done"]);

function matchFilter(job: OpsJob, key: FilterKey): boolean {
  const status = (job.status || "").toLowerCase();
  const anchor = job.anchorDate ? parseISO(job.anchorDate) : null;
  const today = startOfDay(new Date());

  switch (key) {
    case "active":
      return ACTIVE_STATUSES.has(status);
    case "today":
      return !!anchor && isToday(anchor);
    case "week":
      return !!anchor && isThisWeek(anchor, { weekStartsOn: 1 });
    case "upcoming":
      return !!anchor && isAfter(anchor, today);
    case "done":
      return DONE_STATUSES.has(status);
    case "all":
    default:
      return true;
  }
}

function directionBadge(dir: OpsJob["direction"]) {
  if (dir === "out") return { icon: ArrowUpRight, label: "UT", className: "bg-blue-500/10 text-blue-700 dark:text-blue-300" };
  if (dir === "in") return { icon: ArrowDownLeft, label: "IN", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" };
  return { icon: Wrench, label: "Intern", className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" };
}

function statusLabel(status: string): string {
  const s = (status || "").toLowerCase();
  if (ACTIVE_STATUSES.has(s)) return "Pågår";
  if (DONE_STATUSES.has(s)) return "Klar";
  if (s === "planning" || s === "planned" || s === "pending") return "Planerad";
  return status || "—";
}

const WarehouseDashboard = () => {
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("active");

  const anchorDate = useMemo(() => new Date(), []);
  const { data, isLoading, isFetching, refetch } = useWarehouseOpsRange(anchorDate, "next30");

  const jobs = data?.jobs ?? [];

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { active: 0, today: 0, week: 0, upcoming: 0, done: 0, all: jobs.length };
    for (const j of jobs) {
      if (matchFilter(j, "active")) c.active++;
      if (matchFilter(j, "today")) c.today++;
      if (matchFilter(j, "week")) c.week++;
      if (matchFilter(j, "upcoming")) c.upcoming++;
      if (matchFilter(j, "done")) c.done++;
    }
    return c;
  }, [jobs]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs
      .filter((j) => matchFilter(j, filter))
      .filter((j) => {
        if (!q) return true;
        return (
          j.name?.toLowerCase().includes(q) ||
          j.client?.toLowerCase().includes(q) ||
          j.bookingNumber?.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const ad = a.anchorDate ?? "9999";
        const bd = b.anchorDate ?? "9999";
        if (ad !== bd) return ad < bd ? -1 : 1;
        return (a.anchorTime ?? "99:99") < (b.anchorTime ?? "99:99") ? -1 : 1;
      });
  }, [jobs, filter, query]);

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden" style={{ background: "var(--gradient-page)" }}>
      <div className="relative p-6 max-w-[1400px] mx-auto space-y-5">
        <PageHeader
          icon={Package}
          title="Lager"
          subtitle={format(new Date(), "EEEE d MMMM yyyy", { locale: sv })}
          variant="warehouse"
        >
          <Button
            onClick={() => setShowCreate(true)}
            size="sm"
            className="bg-warehouse hover:bg-warehouse-hover shadow-sm font-medium rounded-lg px-4 h-8"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Skapa lageruppgift
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="border-border/60 h-8 rounded-lg"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Uppdatera
          </Button>
        </PageHeader>

        {/* Sök + filter */}
        <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Sök packning, kund eller bokningsnummer…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 h-10"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "px-3 h-8 rounded-full text-sm font-medium border transition-colors flex items-center gap-2",
                  filter === f.key
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background text-foreground border-border/60 hover:bg-accent/40",
                )}
              >
                {f.label}
                <span
                  className={cn(
                    "px-1.5 rounded-full text-xs",
                    filter === f.key ? "bg-background/20" : "bg-muted text-muted-foreground",
                  )}
                >
                  {counts[f.key]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Lista */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-card/50 p-10 text-center text-sm text-muted-foreground">
            Inga packningar matchar.
          </div>
        ) : (
          <ul className="rounded-xl border border-border/60 bg-card divide-y divide-border/40 overflow-hidden">
            {visible.map((j) => {
              const dir = directionBadge(j.direction);
              const DirIcon = dir.icon;
              return (
                <li
                  key={j.id}
                  onClick={() => navigate(`/warehouse/packing/${j.id}`)}
                  className="px-4 py-3 flex items-center gap-4 hover:bg-accent/40 cursor-pointer transition-colors"
                >
                  <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", dir.className)}>
                    <DirIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium truncate">{j.name || "Packning"}</span>
                      {j.bookingNumber && (
                        <span className="text-xs text-muted-foreground shrink-0">#{j.bookingNumber}</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {j.client || "—"}
                      {j.anchorDate && (
                        <>
                          {" · "}
                          {format(parseISO(j.anchorDate), "EEE d MMM", { locale: sv })}
                          {j.anchorTime ? ` ${j.anchorTime}` : ""}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-3 shrink-0">
                    <div className="w-32">
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-warehouse"
                          style={{ width: `${Math.min(100, Math.max(0, j.percent))}%` }}
                        />
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1 text-right">
                        {j.verifiedItems}/{j.totalItems}
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-xs">{statusLabel(j.status)}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Inkommande projekt som behöver hanteras */}
        <WarehouseProjectInbox />
      </div>

      <CreateInternalTaskDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onSuccess={() => {
          setShowCreate(false);
          refetch();
        }}
      />
    </div>
  );
};

export default WarehouseDashboard;
