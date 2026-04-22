import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase as _supabase } from "@/integrations/supabase/client";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase: any = _supabase;
import { timeAgo, fmt } from "@/features/site-scans/lib/format";
import PageShell from "@/features/site-scans/components/layout/PageShell";
import DataSectionCard from "@/features/site-scans/components/shared/DataSectionCard";
import EmptyState from "@/features/site-scans/components/shared/EmptyState";
import LoadingState from "@/features/site-scans/components/shared/LoadingState";
import StatusBadge, { type ScanStatus } from "@/features/site-scans/components/shared/StatusBadge";
import {
  AlertTriangle,
  RefreshCw,
  Clock,
  Unplug,
  Link2Off,
  Cpu,
  Upload,
  Layers,
  CheckCircle2,
} from "lucide-react";

// =============================================
// Queries
// =============================================

/** Scans stuck in uploading for >2 hours */
function useStaleUploads() {
  return useQuery({
    queryKey: ["ops", "stale-uploads"],
    queryFn: async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("site_scans")
        .select("id, title, status, updated_at, created_at")
        .in("status", ["draft", "uploading"])
        .lt("updated_at", twoHoursAgo)
        .order("updated_at", { ascending: true })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Processing jobs that failed */
function useFailedJobs() {
  return useQuery({
    queryKey: ["ops", "failed-jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_scan_processing_jobs")
        .select("id, site_scan_id, job_type, status, error_message, completed_at, created_at")
        .eq("status", "failed")
        .order("completed_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Scans that failed */
function useFailedScans() {
  return useQuery({
    queryKey: ["ops", "failed-scans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_scans")
        .select("id, title, status, failed_at, created_at")
        .eq("status", "failed")
        .order("failed_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Sync targets that failed or are pending */
function useSyncIssues() {
  return useQuery({
    queryKey: ["ops", "sync-issues"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_scan_sync_targets")
        .select("id, site_scan_id, sync_target, sync_status, last_sync_error, retry_count, max_retries, last_synced_at, updated_at, external_entity_type")
        .in("sync_status", ["sync_failed", "pending_sync"])
        .order("updated_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Sessions without a linked scan (orphans) */
function useOrphanSessions() {
  return useQuery({
    queryKey: ["ops", "orphan-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_scan_sessions")
        .select("id, status, site_scan_id, started_at, last_activity_at, device_platform")
        .is("site_scan_id", null)
        .order("last_activity_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Scans with no external links or sync targets (unlinked) */
function useUnlinkedScans() {
  return useQuery({
    queryKey: ["ops", "unlinked-scans"],
    queryFn: async () => {
      // Get all scans that are ready but have no sync targets
      const { data: scans, error: scanErr } = await supabase
        .from("site_scans")
        .select("id, title, status, created_at")
        .eq("status", "ready")
        .order("created_at", { ascending: false })
        .limit(200);
      if (scanErr) throw scanErr;

      if (!scans || scans.length === 0) return [];

      const scanIds = scans.map((s) => s.id);
      const { data: syncTargets } = await supabase
        .from("site_scan_sync_targets")
        .select("site_scan_id")
        .in("site_scan_id", scanIds);

      const linkedIds = new Set((syncTargets ?? []).map((t) => t.site_scan_id));
      return scans.filter((s) => !linkedIds.has(s.id));
    },
  });
}

// =============================================
// Summary stat
// =============================================

function OpsStat({ label, count, variant }: { label: string; count: number; variant: "ok" | "warning" | "error" }) {
  const colors = {
    ok: "text-[hsl(var(--status-ready))] bg-[hsl(var(--status-ready)/0.08)]",
    warning: "text-[hsl(var(--status-uploading))] bg-[hsl(var(--status-uploading)/0.08)]",
    error: "text-destructive bg-destructive/8",
  };
  return (
    <div className={`rounded-lg border border-border px-4 py-3 flex items-center justify-between ${count === 0 ? "opacity-50" : ""}`}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-bold font-mono rounded-full px-2 py-0.5 ${count > 0 ? colors[variant] : "text-muted-foreground bg-muted/50"}`}>
        {count}
      </span>
    </div>
  );
}

// =============================================
// Page
// =============================================

const Operations = () => {
  const navigate = useNavigate();
  const staleUploads = useStaleUploads();
  const failedJobs = useFailedJobs();
  const failedScans = useFailedScans();
  const syncIssues = useSyncIssues();
  const orphanSessions = useOrphanSessions();
  const unlinkedScans = useUnlinkedScans();

  const isLoading = staleUploads.isLoading || failedJobs.isLoading || failedScans.isLoading || syncIssues.isLoading || orphanSessions.isLoading || unlinkedScans.isLoading;

  const staleCount = staleUploads.data?.length ?? 0;
  const failedJobCount = failedJobs.data?.length ?? 0;
  const failedScanCount = failedScans.data?.length ?? 0;
  const syncIssueCount = syncIssues.data?.length ?? 0;
  const orphanCount = orphanSessions.data?.length ?? 0;
  const unlinkedCount = unlinkedScans.data?.length ?? 0;

  const syncFailed = syncIssues.data?.filter((t) => t.sync_status === "sync_failed") ?? [];
  const syncPending = syncIssues.data?.filter((t) => t.sync_status === "pending_sync") ?? [];

  const totalIssues = staleCount + failedJobCount + failedScanCount + syncIssueCount + orphanCount;

  if (isLoading) {
    return (
      <PageShell title="Drift" description="Systemstatus och driftöversikt">
        <LoadingState message="Laddar driftstatus…" />
      </PageShell>
    );
  }

  return (
    <PageShell title="Drift" description="Systemstatus och driftöversikt">
      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <OpsStat label="Stale uploads" count={staleCount} variant={staleCount > 0 ? "warning" : "ok"} />
        <OpsStat label="Misslyckade scans" count={failedScanCount} variant={failedScanCount > 0 ? "error" : "ok"} />
        <OpsStat label="Misslyckade jobb" count={failedJobCount} variant={failedJobCount > 0 ? "error" : "ok"} />
        <OpsStat label="Sync-problem" count={syncIssueCount} variant={syncIssueCount > 0 ? "error" : "ok"} />
        <OpsStat label="Orphan sessions" count={orphanCount} variant={orphanCount > 0 ? "warning" : "ok"} />
        <OpsStat label="Olänkade scans" count={unlinkedCount} variant={unlinkedCount > 5 ? "warning" : "ok"} />
      </div>

      {totalIssues === 0 && (
        <div className="rounded-lg border border-border bg-card p-8 flex flex-col items-center gap-3 text-center">
          <CheckCircle2 className="h-10 w-10 text-[hsl(var(--status-ready))]" />
          <p className="text-sm font-medium">Inga driftproblem</p>
          <p className="text-xs text-muted-foreground">Alla scans, jobb och synktargets ser bra ut.</p>
        </div>
      )}

      <div className="space-y-4">
        {/* Sync issues */}
        {syncIssueCount > 0 && (
          <DataSectionCard
            title="Sync-problem"
            description={`${syncFailed.length} misslyckade, ${syncPending.length} väntande`}
          >
            <div className="divide-y divide-border">
              {(syncIssues.data ?? []).map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 py-3 cursor-pointer hover:bg-muted/30 -mx-4 px-4 transition-colors"
                  onClick={() => navigate(`/m/tools/measure/${t.site_scan_id}`)}
                >
                  <div className="h-7 w-7 rounded bg-destructive/10 flex items-center justify-center shrink-0">
                    {t.sync_status === "sync_failed" ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5 text-[hsl(var(--status-uploading))]" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium capitalize">{t.sync_target}</span>
                      <span className="text-[10px] font-mono text-muted-foreground uppercase">{t.external_entity_type}</span>
                      <StatusBadge status={t.sync_status === "sync_failed" ? "failed" : "uploading"} />
                    </div>
                    {t.last_sync_error && (
                      <p className="text-[11px] text-destructive font-mono mt-0.5 truncate">{t.last_sync_error}</p>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                    {t.retry_count}/{t.max_retries} retries
                  </span>
                </div>
              ))}
            </div>
          </DataSectionCard>
        )}

        {/* Stale uploads */}
        {staleCount > 0 && (
          <DataSectionCard
            title="Stale uploads"
            description={`${staleCount} scan${staleCount !== 1 ? "s" : ""} fast i draft/uploading > 2h`}
          >
            <div className="divide-y divide-border">
              {(staleUploads.data ?? []).map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 py-3 cursor-pointer hover:bg-muted/30 -mx-4 px-4 transition-colors"
                  onClick={() => navigate(`/m/tools/measure/${s.id}`)}
                >
                  <div className="h-7 w-7 rounded bg-[hsl(var(--status-uploading)/0.1)] flex items-center justify-center shrink-0">
                    <Upload className="h-3.5 w-3.5 text-[hsl(var(--status-uploading))]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium truncate block">{s.title}</span>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      Status: {s.status} · Senast: {timeAgo(s.updated_at)}
                    </span>
                  </div>
                  <StatusBadge status={s.status as ScanStatus} />
                </div>
              ))}
            </div>
          </DataSectionCard>
        )}

        {/* Failed scans */}
        {failedScanCount > 0 && (
          <DataSectionCard
            title="Misslyckade scans"
            description={`${failedScanCount} scan${failedScanCount !== 1 ? "s" : ""}`}
          >
            <div className="divide-y divide-border">
              {(failedScans.data ?? []).map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 py-3 cursor-pointer hover:bg-muted/30 -mx-4 px-4 transition-colors"
                  onClick={() => navigate(`/m/tools/measure/${s.id}`)}
                >
                  <div className="h-7 w-7 rounded bg-destructive/10 flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium truncate block">{s.title}</span>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      Misslyckades: {fmt(s.failed_at)}
                    </span>
                  </div>
                  <StatusBadge status="failed" />
                </div>
              ))}
            </div>
          </DataSectionCard>
        )}

        {/* Failed processing jobs */}
        {failedJobCount > 0 && (
          <DataSectionCard
            title="Misslyckade jobb"
            description={`${failedJobCount} processeringsjobb`}
          >
            <div className="divide-y divide-border">
              {(failedJobs.data ?? []).map((j) => (
                <div
                  key={j.id}
                  className="flex items-center gap-3 py-3 cursor-pointer hover:bg-muted/30 -mx-4 px-4 transition-colors"
                  onClick={() => navigate(`/m/tools/measure/${j.site_scan_id}`)}
                >
                  <div className="h-7 w-7 rounded bg-destructive/10 flex items-center justify-center shrink-0">
                    <Cpu className="h-3.5 w-3.5 text-destructive" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium capitalize">{j.job_type.replace(/_/g, " ")}</span>
                    {j.error_message && (
                      <p className="text-[11px] text-destructive font-mono mt-0.5 truncate">{j.error_message}</p>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                    {fmt(j.completed_at)}
                  </span>
                </div>
              ))}
            </div>
          </DataSectionCard>
        )}

        {/* Orphan sessions */}
        {orphanCount > 0 && (
          <DataSectionCard
            title="Orphan sessions"
            description={`${orphanCount} session${orphanCount !== 1 ? "er" : ""} utan kopplad scan`}
          >
            <div className="divide-y divide-border">
              {(orphanSessions.data ?? []).map((s) => (
                <div key={s.id} className="flex items-center gap-3 py-3">
                  <div className="h-7 w-7 rounded bg-[hsl(var(--status-uploading)/0.1)] flex items-center justify-center shrink-0">
                    <Layers className="h-3.5 w-3.5 text-[hsl(var(--status-uploading))]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-mono truncate block">{s.id}</span>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {s.device_platform ?? "—"} · Status: {s.status} · Senast: {timeAgo(s.last_activity_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </DataSectionCard>
        )}

        {/* Unlinked scans (info, not critical) */}
        {unlinkedCount > 0 && (
          <DataSectionCard
            title="Olänkade scans"
            description={`${unlinkedCount} ready scan${unlinkedCount !== 1 ? "s" : ""} utan sync target`}
          >
            <div className="divide-y divide-border max-h-64 overflow-y-auto">
              {(unlinkedScans.data ?? []).slice(0, 20).map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 py-2.5 cursor-pointer hover:bg-muted/30 -mx-4 px-4 transition-colors"
                  onClick={() => navigate(`/m/tools/measure/${s.id}`)}
                >
                  <Link2Off className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate flex-1">{s.title}</span>
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                    {timeAgo(s.created_at)}
                  </span>
                </div>
              ))}
              {unlinkedCount > 20 && (
                <p className="text-[11px] text-muted-foreground text-center py-2">
                  + {unlinkedCount - 20} till
                </p>
              )}
            </div>
          </DataSectionCard>
        )}
      </div>
    </PageShell>
  );
};

export default Operations;
