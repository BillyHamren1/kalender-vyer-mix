import { useNavigate } from "react-router-dom";
import PageShell from "@/components/layout/PageShell";
import StatCard from "@/features/site-scans/components/shared/StatCard";
import EmptyState from "@/features/site-scans/components/shared/EmptyState";
import DataSectionCard from "@/features/site-scans/components/shared/DataSectionCard";
import StatusBadge, { type ScanStatus } from "@/features/site-scans/components/shared/StatusBadge";
import LoadingState from "@/features/site-scans/components/shared/LoadingState";
import { useSiteScansList } from "@/features/site-scans/hooks/useSiteScans";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { timeAgo } from "@/features/site-scans/lib/format";
import {
  ScanLine,
  Layers,
  Cpu,
  FolderOpen,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

// =============================================
// Aggregation query hooks
// =============================================

function useStatusCounts() {
  return useQuery({
    queryKey: ["site-scans", "status-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_scans")
        .select("status");
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        counts[row.status] = (counts[row.status] || 0) + 1;
      }
      return { counts, total: data?.length ?? 0 };
    },
  });
}

function useSessionCount() {
  return useQuery({
    queryKey: ["site-scan-sessions", "count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("site_scan_sessions")
        .select("id", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });
}

function useAssetCount() {
  return useQuery({
    queryKey: ["site-scan-assets", "count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("site_scan_assets")
        .select("id", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });
}

function useRecentJobs() {
  return useQuery({
    queryKey: ["site-scan-jobs", "recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_scan_processing_jobs")
        .select("id, job_type, status, started_at, completed_at, error_message, site_scan_id")
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data ?? [];
    },
  });
}

// =============================================
// Sub-components
// =============================================

function ScanRow({ scan, onClick }: { scan: { id: string; title: string; status: string; created_at: string }; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center justify-between gap-3 py-2.5 group w-full text-left hover:bg-muted/30 rounded px-1 -mx-1 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <ScanLine className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{scan.title}</p>
          <p className="text-xs text-muted-foreground font-mono">{timeAgo(scan.created_at)}</p>
        </div>
      </div>
      <StatusBadge status={scan.status as ScanStatus} />
    </button>
  );
}

function JobRow({ job, onClick }: { job: { id: string; job_type: string; status: string; started_at: string | null; site_scan_id: string }; onClick: () => void }) {
  const label = job.job_type.replace(/_/g, " ");
  return (
    <button onClick={onClick} className="flex items-center justify-between gap-3 py-2.5 w-full text-left hover:bg-muted/30 rounded px-1 -mx-1 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <Cpu className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium capitalize truncate">{label}</p>
          <p className="text-xs text-muted-foreground font-mono">
            {job.started_at ? timeAgo(job.started_at) : "Ej startad"}
          </p>
        </div>
      </div>
      <StatusBadge status={job.status as ScanStatus} />
    </button>
  );
}

// =============================================
// Dashboard
// =============================================

const Dashboard = () => {
  const navigate = useNavigate();

  const { data: statusData, isLoading: statusLoading } = useStatusCounts();
  const { data: sessionCount, isLoading: sessionsLoading } = useSessionCount();
  const { data: assetCount, isLoading: assetsLoading } = useAssetCount();
  const { data: recentScans, isLoading: scansLoading } = useSiteScansList({ page_size: 6, sort_by: "created_at", sort_order: "desc" });
  const { data: recentJobs, isLoading: jobsLoading } = useRecentJobs();
  const { data: failedScans, isLoading: failedLoading } = useSiteScansList({ status: "failed", page_size: 5 });
  const { data: readyScans, isLoading: readyLoading } = useSiteScansList({ status: "ready", page_size: 5 });

  const total = statusData?.total ?? 0;
  const counts = statusData?.counts ?? {};

  const isLoading = statusLoading || sessionsLoading || assetsLoading;

  // Status distribution for mini bar
  const statusOrder: ScanStatus[] = ["draft", "uploading", "uploaded", "processing", "ready", "failed", "archived"];
  const statusEntries = statusOrder
    .map((s) => ({ status: s, count: counts[s] ?? 0 }))
    .filter((e) => e.count > 0);

  return (
    <PageShell title="Dashboard" description="Översikt över SiteScan-plattformen.">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Totalt scans"
          value={isLoading ? "…" : total}
          icon={ScanLine}
          trend={counts.ready ? `${counts.ready} redo` : undefined}
        />
        <StatCard
          label="Sessioner"
          value={sessionsLoading ? "…" : (sessionCount ?? 0)}
          icon={Layers}
        />
        <StatCard
          label="Processing"
          value={isLoading ? "…" : (counts.processing ?? 0)}
          icon={Cpu}
          trend={counts.uploaded ? `${counts.uploaded} väntar` : undefined}
        />
        <StatCard
          label="Assets"
          value={assetsLoading ? "…" : (assetCount ?? 0)}
          icon={FolderOpen}
        />
      </div>

      {/* Status distribution bar */}
      {total > 0 && (
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Status fördelning
          </p>
          <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
            {statusEntries.map((e) => (
              <div
                key={e.status}
                className="h-full rounded-full first:rounded-l-full last:rounded-r-full"
                style={{
                  width: `${(e.count / total) * 100}%`,
                  minWidth: "4px",
                  backgroundColor: `hsl(var(--status-${e.status}))`,
                }}
                title={`${e.status}: ${e.count}`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
            {statusEntries.map((e) => (
              <span key={e.status} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: `hsl(var(--status-${e.status}))` }}
                />
                <span className="capitalize">{e.status}</span>
                <span className="font-mono font-medium text-foreground">{e.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent scans */}
        <DataSectionCard
          title="Senaste scans"
          description="Nyligen skapade scans"
        >
          {scansLoading ? (
            <LoadingState message="Laddar scans…" />
          ) : !recentScans?.data.length ? (
            <EmptyState
              icon={ScanLine}
              title="Inga scans ännu"
              description="Scans från LiDAR-enheter visas här."
            />
          ) : (
            <div className="divide-y divide-border">
              {recentScans.data.map((scan) => (
                <ScanRow key={scan.id} scan={scan} onClick={() => navigate(`/scans/${scan.id}`)} />
              ))}
            </div>
          )}
        </DataSectionCard>

        {/* Processing */}
        <DataSectionCard
          title="Processing"
          description="Senaste bearbetningsjobb"
        >
          {jobsLoading ? (
            <LoadingState message="Laddar jobb…" />
          ) : !recentJobs?.length ? (
            <EmptyState
              icon={Cpu}
              title="Inga jobb"
              description="Bearbetningsjobb visas här."
            />
          ) : (
            <div className="divide-y divide-border">
              {recentJobs.map((job) => (
                <JobRow key={job.id} job={job} onClick={() => navigate(`/scans/${job.site_scan_id}`)} />
              ))}
            </div>
          )}
        </DataSectionCard>
      </div>

      {/* Problem / ready grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Failed scans */}
        <DataSectionCard
          title="Misslyckade scans"
          description="Kräver uppmärksamhet"
          actions={
            failedScans?.count ? (
              <span className="text-xs font-mono text-destructive">{failedScans.count} st</span>
            ) : null
          }
        >
          {failedLoading ? (
            <LoadingState message="Laddar…" />
          ) : !failedScans?.data.length ? (
            <EmptyState
              icon={AlertTriangle}
              title="Inga fel"
              description="Inga misslyckade scans att visa."
            />
          ) : (
            <div className="divide-y divide-border">
              {failedScans.data.map((scan) => (
                <ScanRow key={scan.id} scan={scan} onClick={() => navigate(`/scans/${scan.id}`)} />
              ))}
            </div>
          )}
        </DataSectionCard>

        {/* Ready for review */}
        <DataSectionCard
          title="Redo för granskning"
          description="Scans med status ready"
          actions={
            readyScans?.count ? (
              <span className="text-xs font-mono text-[hsl(var(--status-ready))]">{readyScans.count} st</span>
            ) : null
          }
        >
          {readyLoading ? (
            <LoadingState message="Laddar…" />
          ) : !readyScans?.data.length ? (
            <EmptyState
              icon={CheckCircle2}
              title="Inga redo"
              description="Inga scans redo för granskning."
            />
          ) : (
            <div className="divide-y divide-border">
              {readyScans.data.map((scan) => (
                <ScanRow key={scan.id} scan={scan} onClick={() => navigate(`/scans/${scan.id}`)} />
              ))}
            </div>
          )}
        </DataSectionCard>
      </div>
    </PageShell>
  );
};

export default Dashboard;
