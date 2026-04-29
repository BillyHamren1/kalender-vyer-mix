import { useMemo, useState } from "react";
import { Activity, AlertTriangle, CalendarClock, CheckCircle2, Clock3, Package, Plus, RefreshCw } from "lucide-react";
import { format, differenceInCalendarDays, parseISO, isValid } from "date-fns";
import { sv } from "date-fns/locale";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useWarehouseOpsBoard, type OpsProject } from "@/hooks/useWarehouseOpsBoard";
import OpsProjectCard from "@/components/warehouse-ops/OpsProjectCard";
import OpsBoardSection from "@/components/warehouse-ops/OpsBoardSection";
import CreateInternalTaskDialog from "@/components/warehouse/CreateInternalTaskDialog";
import WarehouseProjectInbox from "@/components/warehouse/WarehouseProjectInbox";

type Bucket = "active" | "overdue" | "today" | "soon" | "upcoming" | "done";

function bucketize(p: OpsProject): Bucket {
  if (p.status === "returned" || p.status === "completed") return "done";
  if (p.signedAt && p.status !== "delivered" && p.status !== "back" && p.status !== "returning") return "done";

  // Aktiv just nu — pågående retur eller någon scannat senaste 30 min
  const lastAct = p.lastActivityAt ? parseISO(p.lastActivityAt) : null;
  const minsSince = lastAct && isValid(lastAct) ? (Date.now() - lastAct.getTime()) / 60000 : Infinity;
  if (p.status === "returning") return "active";
  if (minsSince <= 30) return "active";

  // "Tillbaka" = kommit hem, redo att starta retur — visa som dagens jobb
  if (p.status === "back") return "today";

  // "I produktion" = ute hos kund, inväntar retur — visa under kommande/snart baserat på rigdown
  if (p.startDate) {
    const d = parseISO(p.startDate);
    if (isValid(d)) {
      const days = differenceInCalendarDays(d, new Date());
      if (days < 0 && p.percent < 100 && p.status !== "delivered") return "overdue";
      if (days === 0 || days === 1) return "today";
      if (days <= 5) return "soon";
    }
  }
  if (p.status === "in_progress" && p.percent > 0 && p.percent < 100) return "active";
  return "upcoming";
}

const WarehouseDashboard = () => {
  const { data: projects, isLoading, isFetching, refetch } = useWarehouseOpsBoard();
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState("");

  const buckets = useMemo(() => {
    const empty: Record<Bucket, OpsProject[]> = {
      active: [], overdue: [], today: [], soon: [], upcoming: [], done: [],
    };
    if (!projects) return empty;
    const q = filter.trim().toLowerCase();
    const filtered = q
      ? projects.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.client || "").toLowerCase().includes(q) ||
            (p.bookingNumber || "").toLowerCase().includes(q)
        )
      : projects;
    for (const p of filtered) empty[bucketize(p)].push(p);
    // Sort each bucket
    empty.active.sort((a, b) => (a.lastActivityAt || "") < (b.lastActivityAt || "") ? 1 : -1);
    empty.overdue.sort((a, b) => (a.startDate || "") < (b.startDate || "") ? -1 : 1);
    empty.today.sort((a, b) => (a.startDate || "") < (b.startDate || "") ? -1 : 1);
    empty.soon.sort((a, b) => (a.startDate || "") < (b.startDate || "") ? -1 : 1);
    empty.upcoming.sort((a, b) => (a.startDate || "9999") < (b.startDate || "9999") ? -1 : 1);
    empty.done.sort((a, b) => (a.signedAt || "") < (b.signedAt || "") ? 1 : -1);
    return empty;
  }, [projects, filter]);

  const total = projects?.length || 0;
  const totalActive = buckets.active.length + buckets.overdue.length + buckets.today.length + buckets.soon.length + buckets.upcoming.length;

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden" style={{ background: "var(--gradient-page)" }}>
      <div className="relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(184_60%_38%/0.04),transparent)]" />

        <div className="relative p-6 max-w-[1600px] mx-auto">
          <PageHeader
            icon={Package}
            title="Lager Operations"
            subtitle={`${format(new Date(), "EEEE d MMMM yyyy", { locale: sv })} · ${totalActive} pågående · ${buckets.done.length} klara`}
            variant="warehouse"
          >
            <Button
              onClick={() => setShowCreate(true)}
              size="sm"
              className="bg-warehouse hover:bg-warehouse-hover shadow-sm shadow-warehouse/20 font-medium rounded-lg px-4 h-8"
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

          {/* Inbox: nya projekt från Planning */}
          <div className="mb-6">
            <WarehouseProjectInbox />
          </div>

          {/* Search/filter */}
          <div className="mb-5 max-w-sm">
            <Input
              placeholder="Sök projekt, kund eller boknings#…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-9"
            />
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-36 rounded-xl" />
              ))}
            </div>
          ) : total === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>Inga aktiva lagerprojekt just nu.</p>
            </div>
          ) : (
            <>
              <OpsBoardSection
                title="Pågår just nu"
                icon={<Activity className="h-4 w-4 animate-pulse" />}
                count={buckets.active.length}
                tone="active"
                emptyHint="Ingen scannar något just nu."
              >
                {buckets.active.map((p) => (
                  <OpsProjectCard key={p.id} project={p} emphasis="active" />
                ))}
              </OpsBoardSection>

              <OpsBoardSection
                title="Försenade"
                icon={<AlertTriangle className="h-4 w-4" />}
                count={buckets.overdue.length}
                tone="danger"
                emptyHint="Inga försenade packningar."
              >
                {buckets.overdue.map((p) => (
                  <OpsProjectCard key={p.id} project={p} emphasis="overdue" />
                ))}
              </OpsBoardSection>

              <OpsBoardSection
                title="Idag & imorgon"
                icon={<Clock3 className="h-4 w-4" />}
                count={buckets.today.length}
                tone="warn"
                emptyHint="Inga deadlines de närmaste 24 h."
              >
                {buckets.today.map((p) => (
                  <OpsProjectCard key={p.id} project={p} emphasis="soon" />
                ))}
              </OpsBoardSection>

              <OpsBoardSection
                title="Snart (inom 5 dagar)"
                icon={<CalendarClock className="h-4 w-4" />}
                count={buckets.soon.length}
                emptyHint="Inget på närmaste veckan."
              >
                {buckets.soon.map((p) => (
                  <OpsProjectCard key={p.id} project={p} emphasis="soon" />
                ))}
              </OpsBoardSection>

              <OpsBoardSection
                title="Längre fram"
                icon={<CalendarClock className="h-4 w-4" />}
                count={buckets.upcoming.length}
                emptyHint="Inga planerade projekt."
              >
                {buckets.upcoming.map((p) => (
                  <OpsProjectCard key={p.id} project={p} emphasis="upcoming" />
                ))}
              </OpsBoardSection>

              <OpsBoardSection
                title="Klart senaste 48 h"
                icon={<CheckCircle2 className="h-4 w-4" />}
                count={buckets.done.length}
                tone="ok"
                emptyHint="Inga signerade packningar senaste 48 h."
              >
                {buckets.done.map((p) => (
                  <OpsProjectCard key={p.id} project={p} emphasis="done" />
                ))}
              </OpsBoardSection>
            </>
          )}
        </div>
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
