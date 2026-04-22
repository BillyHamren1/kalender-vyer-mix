import { Link2, ExternalLink, Plus, Server, FileText, Briefcase, Tag, RefreshCw, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import DataSectionCard from "@/features/site-scans/components/shared/DataSectionCard";
import EmptyState from "@/features/site-scans/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { format, formatDistanceToNow } from "date-fns";
import { sv } from "date-fns/locale";
import type { Tables } from "@/integrations/supabase/types";

type SiteScanLinkRow = Tables<"site_scan_links">;
type SiteScanSyncTargetRow = Tables<"site_scan_sync_targets">;

// =============================================
// Known external systems
// =============================================

export interface ExternalSystemConfig {
  key: string;
  label: string;
  icon: React.ElementType;
  entityTypes: string[];
  color: string;
}

export const KNOWN_SYSTEMS: ExternalSystemConfig[] = [
  { key: "eventflow", label: "EventFlow", icon: Briefcase, entityTypes: ["project", "task", "event", "milestone"], color: "text-primary" },
  { key: "project_manager", label: "Project Manager", icon: FileText, entityTypes: ["project", "task", "deliverable"], color: "text-[hsl(var(--status-uploaded))]" },
  { key: "asset_registry", label: "Asset Registry", icon: Server, entityTypes: ["asset", "collection", "dataset"], color: "text-[hsl(var(--status-ready))]" },
  { key: "crm", label: "CRM", icon: Tag, entityTypes: ["contact", "company", "deal"], color: "text-[hsl(var(--status-processing))]" },
];

export function getSystemConfig(systemKey: string): ExternalSystemConfig {
  return KNOWN_SYSTEMS.find((s) => s.key === systemKey) ?? {
    key: systemKey, label: systemKey, icon: Server, entityTypes: [], color: "text-muted-foreground",
  };
}

// =============================================
// Sync status helpers
// =============================================

type SyncStatus = "not_linked" | "pending_sync" | "synced" | "sync_failed";

const SYNC_STATUS_CONFIG: Record<SyncStatus, { label: string; icon: React.ElementType; className: string }> = {
  not_linked: { label: "Ej länkad", icon: Link2, className: "text-muted-foreground bg-muted/50" },
  pending_sync: { label: "Väntar", icon: Clock, className: "text-[hsl(var(--status-uploading))] bg-[hsl(var(--status-uploading)/0.1)]" },
  synced: { label: "Synkad", icon: CheckCircle2, className: "text-[hsl(var(--status-ready))] bg-[hsl(var(--status-ready)/0.1)]" },
  sync_failed: { label: "Misslyckad", icon: AlertCircle, className: "text-destructive bg-destructive/10" },
};

function SyncStatusBadge({ status }: { status: SyncStatus }) {
  const config = SYNC_STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${config.className}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

// =============================================
// Link row
// =============================================

function LinkRow({ link }: { link: SiteScanLinkRow }) {
  const system = getSystemConfig(link.external_system);
  const Icon = system.icon;
  return (
    <div className="flex items-center gap-3 py-3 group">
      <div className="h-8 w-8 rounded-lg bg-muted/50 border border-border flex items-center justify-center shrink-0">
        <Icon className={`h-4 w-4 ${system.color}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{system.label}</span>
          <Badge variant="outline" className="text-[9px] font-mono uppercase">{link.external_entity_type}</Badge>
        </div>
        <p className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">{link.external_entity_id}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[10px] text-muted-foreground font-mono hidden sm:block">
          {format(new Date(link.created_at), "d MMM yyyy", { locale: sv })}
        </span>
        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" disabled>
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// =============================================
// Sync target row — with retry button & details
// =============================================

function SyncTargetRow({
  target,
  onRetry,
  isRetrying,
}: {
  target: SiteScanSyncTargetRow;
  onRetry?: (targetId: string) => void;
  isRetrying?: boolean;
}) {
  const system = getSystemConfig(target.sync_target);
  const Icon = system.icon;
  const syncStatus = target.sync_status as SyncStatus;
  const canRetry = syncStatus === "sync_failed" || (syncStatus === "pending_sync" && target.retry_count > 0);

  return (
    <div className="py-3 group">
      {/* Main row */}
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-muted/50 border border-border flex items-center justify-center shrink-0">
          <Icon className={`h-4 w-4 ${system.color}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{system.label}</span>
            <Badge variant="outline" className="text-[9px] font-mono uppercase">{target.external_entity_type}</Badge>
            <SyncStatusBadge status={syncStatus} />
          </div>
          {target.external_entity_id ? (
            <p className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">{target.external_entity_id}</p>
          ) : (
            <p className="text-[11px] text-muted-foreground italic mt-0.5">Ej länkad ännu</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Retry button */}
          {canRetry && onRetry && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1 text-[10px] h-7 px-2"
              onClick={() => onRetry(target.id)}
              disabled={isRetrying}
            >
              <RefreshCw className={`h-3 w-3 ${isRetrying ? "animate-spin" : ""}`} />
              Retry
            </Button>
          )}
        </div>
      </div>

      {/* Detail row — sync metadata */}
      <div className="ml-11 mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground font-mono">
        {target.last_synced_at && (
          <span>
            Senaste synk: {format(new Date(target.last_synced_at), "d MMM HH:mm", { locale: sv })}
          </span>
        )}
        {target.retry_count > 0 && (
          <span className={syncStatus === "sync_failed" ? "text-destructive" : ""}>
            Försök: {target.retry_count}/{target.max_retries}
          </span>
        )}
        {target.next_retry_at && syncStatus === "pending_sync" && (
          <span>
            Nästa: {formatDistanceToNow(new Date(target.next_retry_at), { addSuffix: true, locale: sv })}
          </span>
        )}
      </div>

      {/* Error message */}
      {target.last_sync_error && (syncStatus === "sync_failed" || syncStatus === "pending_sync") && (
        <div className="ml-11 mt-1.5 flex items-start gap-1.5 text-[11px] text-destructive bg-destructive/5 rounded px-2.5 py-1.5">
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
          <span className="break-all">{target.last_sync_error}</span>
        </div>
      )}
    </div>
  );
}

// =============================================
// Main section component
// =============================================

interface ExternalLinksSectionProps {
  links: SiteScanLinkRow[];
  syncTargets?: SiteScanSyncTargetRow[];
  showAddButton?: boolean;
  onRetrySync?: (syncTargetId: string) => void;
  isRetrying?: boolean;
  className?: string;
}

const ExternalLinksSection = ({
  links,
  syncTargets = [],
  showAddButton = true,
  onRetrySync,
  isRetrying,
  className,
}: ExternalLinksSectionProps) => {
  const totalItems = links.length + syncTargets.length;
  const syncedCount = syncTargets.filter((t) => t.sync_status === "synced").length;
  const failedCount = syncTargets.filter((t) => t.sync_status === "sync_failed").length;
  const pendingCount = syncTargets.filter((t) => t.sync_status === "pending_sync").length;

  const statusSummary = [
    syncedCount > 0 && `${syncedCount} synkad${syncedCount > 1 ? "e" : ""}`,
    pendingCount > 0 && `${pendingCount} väntande`,
    failedCount > 0 && `${failedCount} misslyckad${failedCount > 1 ? "e" : ""}`,
  ].filter(Boolean).join(", ");

  const description = totalItems > 0
    ? `${totalItems} koppling${totalItems !== 1 ? "ar" : ""}${statusSummary ? ` · ${statusSummary}` : ""}`
    : "Inga kopplingar ännu";

  return (
    <DataSectionCard
      title="Externa kopplingar"
      description={description}
      className={className}
      actions={
        showAddButton ? (
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" disabled title="Länkning aktiveras i nästa fas">
            <Plus className="h-3.5 w-3.5" />
            Länka
          </Button>
        ) : undefined
      }
    >
      {totalItems === 0 ? (
        <EmptyState
          icon={Link2}
          title="Inga externa kopplingar"
          description="Den här scanningen är inte kopplad till något externt system ännu."
        />
      ) : (
        <div className="divide-y divide-border">
          {syncTargets.map((target) => (
            <SyncTargetRow
              key={target.id}
              target={target}
              onRetry={onRetrySync}
              isRetrying={isRetrying}
            />
          ))}
          {links.map((link) => (
            <LinkRow key={link.id} link={link} />
          ))}
        </div>
      )}
    </DataSectionCard>
  );
};

export default ExternalLinksSection;
