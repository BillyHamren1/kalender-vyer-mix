import { RefreshCw, CheckCircle2, AlertCircle, Clock, Link2, Server, Briefcase } from "lucide-react";
import DataSectionCard from "@/features/site-scans/components/shared/DataSectionCard";
import EmptyState from "@/features/site-scans/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, formatDistanceToNow } from "date-fns";
import { sv } from "date-fns/locale";
import type { Tables } from "@/integrations/supabase/types";

type SiteScanSyncTargetRow = Tables<"site_scan_sync_targets">;
type SyncStatus = "not_linked" | "pending_sync" | "synced" | "sync_failed";

const STATUS_CONFIG: Record<SyncStatus, { label: string; icon: React.ElementType; className: string }> = {
  not_linked: { label: "Ej länkad", icon: Link2, className: "text-muted-foreground bg-muted/50" },
  pending_sync: { label: "Väntar", icon: Clock, className: "text-[hsl(var(--status-uploading))] bg-[hsl(var(--status-uploading)/0.1)]" },
  synced: { label: "Synkad", icon: CheckCircle2, className: "text-[hsl(var(--status-ready))] bg-[hsl(var(--status-ready)/0.1)]" },
  sync_failed: { label: "Misslyckad", icon: AlertCircle, className: "text-destructive bg-destructive/10" },
};

const SYSTEM_LABELS: Record<string, { label: string; icon: React.ElementType }> = {
  eventflow: { label: "EventFlow", icon: Briefcase },
};

function getSystemMeta(key: string) {
  return SYSTEM_LABELS[key] ?? { label: key, icon: Server };
}

interface SyncStatusPanelProps {
  targets: SiteScanSyncTargetRow[];
  onRetry: (targetId: string) => void;
  retryingTargetId: string | null;
}

const SyncStatusPanel = ({ targets, onRetry, retryingTargetId }: SyncStatusPanelProps) => {
  if (targets.length === 0) {
    return (
      <DataSectionCard title="Sync Status">
        <EmptyState icon={RefreshCw} title="Inga sync targets" description="Denna scan har inga konfigurerade sync targets." />
      </DataSectionCard>
    );
  }

  return (
    <DataSectionCard title="Sync Status" description={`${targets.length} target${targets.length > 1 ? "s" : ""}`}>
      <div className="divide-y divide-border">
        {targets.map((t) => {
          const status = t.sync_status as SyncStatus;
          const cfg = STATUS_CONFIG[status];
          const StatusIcon = cfg.icon;
          const sys = getSystemMeta(t.sync_target);
          const SysIcon = sys.icon;
          const canRetry = status === "sync_failed" || (status === "pending_sync" && t.retry_count > 0);
          const isThisRetrying = retryingTargetId === t.id;

          return (
            <div key={t.id} className="py-3 space-y-2">
              {/* Header row */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <SysIcon className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm font-medium">{sys.label}</span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.className}`}>
                    <StatusIcon className="h-3 w-3" />
                    {cfg.label}
                  </span>
                </div>
                {canRetry && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 text-[10px] h-7 px-2 shrink-0"
                    onClick={() => onRetry(t.id)}
                    disabled={isThisRetrying}
                  >
                    <RefreshCw className={`h-3 w-3 ${isThisRetrying ? "animate-spin" : ""}`} />
                    Retry
                  </Button>
                )}
              </div>

              {/* Debug summary grid */}
              <div className="ml-0 grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] font-mono">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Target</span>
                  <span>{t.sync_target}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Entity type</span>
                  <span>{t.external_entity_type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Entity ID</span>
                  <span className="truncate ml-2">{t.external_entity_id || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Retries</span>
                  <span className={status === "sync_failed" ? "text-destructive" : ""}>{t.retry_count}/{t.max_retries}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last synced</span>
                  <span>{t.last_synced_at ? format(new Date(t.last_synced_at), "d MMM HH:mm", { locale: sv }) : "—"}</span>
                </div>
                {t.next_retry_at && status === "pending_sync" && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Next retry</span>
                    <span>{formatDistanceToNow(new Date(t.next_retry_at), { addSuffix: true, locale: sv })}</span>
                  </div>
                )}
              </div>

              {/* Error */}
              {t.last_sync_error && (status === "sync_failed" || status === "pending_sync") && (
                <div className="flex items-start gap-1.5 text-[11px] text-destructive bg-destructive/5 rounded px-2.5 py-1.5">
                  <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                  <span className="break-all">{t.last_sync_error}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </DataSectionCard>
  );
};

export default SyncStatusPanel;
