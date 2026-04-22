import { useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase as _supabase } from "@/integrations/supabase/client";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase: any = _supabase;
import { normalizeError } from "@/features/site-scans/lib/errors";
import type { Database } from "@/integrations/supabase/types";

import PageShell from "@/components/layout/PageShell";
import FilterBar from "@/features/site-scans/components/shared/FilterBar";
import EmptyState from "@/features/site-scans/components/shared/EmptyState";
import ErrorState from "@/features/site-scans/components/shared/ErrorState";
import LoadingState from "@/features/site-scans/components/shared/LoadingState";
import DataSectionCard from "@/features/site-scans/components/shared/DataSectionCard";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Layers,
  Smartphone,
  Clock,
  ExternalLink,
  Search,
  AlertTriangle,
  CheckCircle2,
  Pause,
  XCircle,
  Activity,
  ChevronLeft,
  ChevronRight,
  Info,
} from "lucide-react";
import { differenceInHours } from "date-fns";
import { fmt, timeAgo } from "@/features/site-scans/lib/format";

type SessionStatus = string;

// =============================================
// Stale detection
// =============================================

const STALE_THRESHOLD_HOURS = 2;

function isStale(session: { status: SessionStatus; last_activity_at: string }): boolean {
  if (session.status !== "active") return false;
  return differenceInHours(new Date(), new Date(session.last_activity_at)) >= STALE_THRESHOLD_HOURS;
}

// =============================================
// Status helpers
// =============================================

/** UI-only derived status. "stale" is not a backend status — it's an active session with no recent activity. */
type DisplayStatus = SessionStatus | "stale";

const BACKEND_SESSION_STATUSES: readonly SessionStatus[] = ["active", "paused", "completed", "expired"];

function getDisplayStatus(session: { status: SessionStatus; last_activity_at: string }): DisplayStatus {
  if (isStale(session)) return "stale";
  return session.status;
}

const STATUS_CONFIG: Record<DisplayStatus, { label: string; icon: React.ElementType; dotClass: string; bgClass: string; textClass: string }> = {
  active:    { label: "Aktiv",      icon: Activity,      dotClass: "bg-[hsl(var(--status-ready))]",      bgClass: "bg-[hsl(var(--status-ready)/0.12)]",      textClass: "text-[hsl(var(--status-ready))]" },
  stale:     { label: "Fastnad",    icon: AlertTriangle,  dotClass: "bg-[hsl(var(--status-uploading))]",  bgClass: "bg-[hsl(var(--status-uploading)/0.12)]",  textClass: "text-[hsl(var(--status-uploading))]" },
  completed: { label: "Slutförd",   icon: CheckCircle2,   dotClass: "bg-[hsl(var(--status-uploaded))]",   bgClass: "bg-[hsl(var(--status-uploaded)/0.12)]",   textClass: "text-[hsl(var(--status-uploaded))]" },
  paused:    { label: "Pausad",     icon: Pause,          dotClass: "bg-[hsl(var(--status-draft))]",      bgClass: "bg-[hsl(var(--status-draft)/0.12)]",      textClass: "text-[hsl(var(--status-draft))]" },
  expired:   { label: "Utgången",   icon: XCircle,        dotClass: "bg-[hsl(var(--status-failed))]",     bgClass: "bg-[hsl(var(--status-failed)/0.12)]",     textClass: "text-[hsl(var(--status-failed))]" },
};

function SessionStatusBadge({ status }: { status: DisplayStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium font-mono ${cfg.bgClass} ${cfg.textClass}`}>
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cfg.dotClass} ${status === "active" ? "animate-pulse" : ""}`} />
      {cfg.label}
    </span>
  );
}

// =============================================
// Data hook
// =============================================

const PAGE_SIZE = 15;

interface SessionWithScan {
  id: string;
  session_token: string;
  status: SessionStatus;
  site_scan_id: string | null;
  device_platform: string | null;
  device_model: string | null;
  app_version: string | null;
  started_at: string;
  last_activity_at: string;
  completed_at: string | null;
  metadata: unknown;
  created_at: string;
}

function useSessions(params: { search: string; filter: string; page: number }) {
  return useQuery({
    queryKey: ["site-scan-sessions", params],
    queryFn: async () => {
      let query = supabase
        .from("site_scan_sessions")
        .select("*", { count: "exact" });

      // Search
      if (params.search.trim()) {
        const term = `%${params.search.trim()}%`;
        query = query.or(`session_token.ilike.${term},device_platform.ilike.${term},device_model.ilike.${term}`);
      }

      // Filter
      if (params.filter === "active") {
        query = query.eq("status", "active");
      } else if (params.filter === "completed") {
        query = query.eq("status", "completed");
      } else if (params.filter === "paused") {
        query = query.eq("status", "paused");
      } else if (params.filter === "expired") {
        query = query.eq("status", "expired");
      }
      // "stale" is filtered client-side since it's derived

      const from = (params.page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      query = query.order("last_activity_at", { ascending: false }).range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;

      let sessions = (data ?? []) as SessionWithScan[];

      // Client-side stale filter
      if (params.filter === "stale") {
        sessions = sessions.filter((s) => isStale(s));
      }

      return {
        data: sessions,
        count: params.filter === "stale" ? sessions.length : (count ?? 0),
        page: params.page,
        total_pages: Math.ceil((count ?? 0) / PAGE_SIZE),
      };
    },
  });
}

// =============================================
// Session card
// =============================================

function SessionCard({
  session,
  onInspect,
  onAbandon,
  onViewScan,
}: {
  session: SessionWithScan;
  onInspect: () => void;
  onAbandon: () => void;
  onViewScan: (scanId: string) => void;
}) {
  const displayStatus = getDisplayStatus(session);
  const stale = displayStatus === "stale";

  return (
    <div className={`rounded-lg border bg-card p-4 transition-all ${stale ? "border-[hsl(var(--status-uploading)/0.4)] shadow-[0_0_16px_-6px_hsl(var(--status-uploading)/0.2)]" : "border-border hover:border-primary/20"}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${stale ? "bg-[hsl(var(--status-uploading)/0.12)]" : "bg-primary/8 border border-primary/10"}`}>
            <Layers className={`h-4 w-4 ${stale ? "text-[hsl(var(--status-uploading))]" : "text-primary"}`} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium font-mono truncate" title={session.session_token}>
              {session.session_token.slice(0, 16)}…
            </p>
            <p className="text-[11px] text-muted-foreground">{timeAgo(session.last_activity_at)}</p>
          </div>
        </div>
        <SessionStatusBadge status={displayStatus} />
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs mb-3">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>Start: {fmt(session.started_at)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Activity className="h-3 w-3" />
          <span>Senast: {fmt(session.last_activity_at)}</span>
        </div>
        {session.device_platform && (
          <div className="flex items-center gap-1.5 text-muted-foreground col-span-2">
            <Smartphone className="h-3 w-3" />
            <span>{session.device_platform}{session.device_model ? ` · ${session.device_model}` : ""}{session.app_version ? ` · v${session.app_version}` : ""}</span>
          </div>
        )}
        {session.completed_at && (
          <div className="flex items-center gap-1.5 text-muted-foreground col-span-2">
            <CheckCircle2 className="h-3 w-3" />
            <span>Slutförd: {fmt(session.completed_at)}</span>
          </div>
        )}
        {session.site_scan_id && (
          <div className="flex items-center gap-1.5 text-muted-foreground col-span-2">
            <ExternalLink className="h-3 w-3" />
            <span className="truncate">Scan: <button onClick={(e) => { e.stopPropagation(); onViewScan(session.site_scan_id!); }} className="font-mono text-primary hover:underline">{session.site_scan_id.slice(0, 8)}…</button></span>
          </div>
        )}
      </div>

      {/* Stale warning */}
      {stale && (
        <div className="flex items-start gap-1.5 text-xs bg-[hsl(var(--status-uploading)/0.08)] text-[hsl(var(--status-uploading))] rounded px-2.5 py-2 mb-3">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
          <span>Ingen aktivitet på {differenceInHours(new Date(), new Date(session.last_activity_at))}h. Sessionen kan ha fastnat.</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <Button variant="ghost" size="sm" onClick={onInspect} className="h-7 text-xs gap-1.5">
          <Info className="h-3 w-3" /> Inspektera
        </Button>
        {(session.status === "active" || session.status === "paused") && (
          <Button variant="ghost" size="sm" onClick={onAbandon} className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-destructive">
            <XCircle className="h-3 w-3" /> Markera övergiven
          </Button>
        )}
      </div>
    </div>
  );
}

// =============================================
// Inspect dialog
// =============================================

function InspectDialog({ session, open, onClose }: { session: SessionWithScan | null; open: boolean; onClose: () => void }) {
  if (!session) return null;
  const displayStatus = getDisplayStatus(session);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">Session detaljer</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <SessionStatusBadge status={displayStatus} />
            {isStale(session) && (
              <span className="text-xs text-[hsl(var(--status-uploading))] font-mono">
                Inaktiv {differenceInHours(new Date(), new Date(session.last_activity_at))}h
              </span>
            )}
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <Row label="Session token" value={session.session_token} mono />
            <Row label="Session ID" value={session.id} mono />
            <Row label="Kopplad scan" value={session.site_scan_id} mono />
            <Row label="Status" value={session.status} />
            <Row label="Plattform" value={session.device_platform} />
            <Row label="Modell" value={session.device_model} />
            <Row label="App-version" value={session.app_version} />
            <Row label="Startad" value={fmt(session.started_at)} />
            <Row label="Senaste aktivitet" value={fmt(session.last_activity_at)} />
            <Row label="Slutförd" value={fmt(session.completed_at)} />
            <Row label="Skapad" value={fmt(session.created_at)} />
          </div>

          {session.metadata && typeof session.metadata === "object" && Object.keys(session.metadata as object).length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">Metadata</p>
              <pre className="text-xs font-mono bg-muted/30 rounded-lg border border-border p-3 overflow-auto max-h-40">
                {JSON.stringify(session.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center gap-2">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className={`text-xs text-right truncate ${mono ? "font-mono" : ""}`}>{value || "—"}</span>
    </div>
  );
}

// =============================================
// Stats bar
// =============================================

function useSessionStats() {
  return useQuery({
    queryKey: ["site-scan-sessions", "stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_scan_sessions")
        .select("status, last_activity_at");
      if (error) throw error;

      const rows = data ?? [];
      const counts = { active: 0, stale: 0, completed: 0, paused: 0, expired: 0 };
      for (const r of rows) {
        if (isStale(r)) {
          counts.stale++;
        } else {
          const s = r.status as keyof typeof counts;
          if (s in counts) counts[s]++;
        }
      }
      return { total: rows.length, ...counts };
    },
  });
}

// =============================================
// Page
// =============================================

const FILTER_OPTIONS = [
  { value: "all", label: "Alla" },
  { value: "active", label: "Aktiva" },
  { value: "stale", label: "Fastnade" },
  { value: "completed", label: "Slutförda" },
  { value: "paused", label: "Pausade" },
  { value: "expired", label: "Utgångna" },
];

const Sessions = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [inspecting, setInspecting] = useState<SessionWithScan | null>(null);

  const { data: stats } = useSessionStats();
  const { data, isLoading, isError, error, refetch } = useSessions({ search, filter, page });

  const handleSearch = useCallback((v: string) => { setSearch(v); setPage(1); }, []);
  const handleFilter = useCallback((v: string) => { setFilter(v); setPage(1); }, []);

  const handleAbandon = useCallback(async (id: string) => {
    try {
      // Guard: verify current status before mutating
      const { data: session, error: fetchErr } = await supabase
        .from("site_scan_sessions")
        .select("id, status")
        .eq("id", id)
        .maybeSingle();

      if (fetchErr) throw fetchErr;
      if (!session) {
        toast.error("Session hittades inte");
        return;
      }

      const abandonable: SessionStatus[] = ["active", "paused"];
      if (!abandonable.includes(session.status as SessionStatus)) {
        toast.error("Kan inte överge session", {
          description: `Session har status '${session.status}', bara aktiva eller pausade sessioner kan överges.`,
        });
        return;
      }

      const { error } = await supabase
        .from("site_scan_sessions")
        .update({ status: "expired" satisfies SessionStatus, completed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      toast.success("Session markerad som övergiven");
      queryClient.invalidateQueries({ queryKey: ["site-scan-sessions"] });
    } catch (e: unknown) {
      const appErr = normalizeError(e, "Kunde inte uppdatera session");
      toast.error(appErr.userMessage, {
        description: appErr.category !== "unknown" ? appErr.message : undefined,
      });
    }
  }, [queryClient]);

  const hasActiveFilters = search.trim().length > 0 || filter !== "all";

  return (
    <PageShell title="Sessions" description="Upload-sessioner från native-appen.">
      {/* Stats */}
      {stats && stats.total > 0 && (
        <div className="flex flex-wrap gap-3">
          {[
            { key: "active", count: stats.active },
            { key: "stale", count: stats.stale },
            { key: "completed", count: stats.completed },
            { key: "paused", count: stats.paused },
            { key: "expired", count: stats.expired },
          ].map(({ key, count }) => {
            const cfg = STATUS_CONFIG[key as DisplayStatus];
            return (
              <button
                key={key}
                onClick={() => handleFilter(key)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-all ${filter === key ? "border-primary/30 bg-primary/5" : "border-border bg-card hover:border-primary/15"}`}
              >
                <span className={`h-2 w-2 rounded-full ${cfg.dotClass}`} />
                <span className="font-medium">{cfg.label}</span>
                <span className="font-mono font-bold">{count}</span>
              </button>
            );
          })}
          <button
            onClick={() => handleFilter("all")}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-all ${filter === "all" ? "border-primary/30 bg-primary/5" : "border-border bg-card hover:border-primary/15"}`}
          >
            <span className="font-medium">Alla</span>
            <span className="font-mono font-bold">{stats.total}</span>
          </button>
        </div>
      )}

      {/* Filters */}
      <FilterBar
        searchPlaceholder="Sök på token, plattform, modell…"
        searchValue={search}
        onSearchChange={handleSearch}
      >
        <Select value={filter} onValueChange={handleFilter}>
          <SelectTrigger className="w-[130px] h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTER_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterBar>

      {/* States */}
      {isLoading && <LoadingState message="Laddar sessioner…" />}
      {isError && <ErrorState message={error?.message ?? "Kunde inte hämta sessioner."} onRetry={() => refetch()} />}

      {!isLoading && !isError && data && data.data.length === 0 && (
        <EmptyState
          icon={Layers}
          title={hasActiveFilters ? "Inga matchande sessioner" : "Inga sessioner ännu"}
          description={hasActiveFilters ? "Prova att ändra filter eller sökord." : "Sessioner skapas automatiskt från native-appen."}
          action={hasActiveFilters ? (
            <Button variant="outline" size="sm" onClick={() => { setSearch(""); setFilter("all"); setPage(1); }}>Rensa filter</Button>
          ) : undefined}
        />
      )}

      {/* Grid */}
      {!isLoading && !isError && data && data.data.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.data.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onInspect={() => setInspecting(session)}
                onAbandon={() => handleAbandon(session.id)}
                onViewScan={(scanId) => navigate(`/scans/${scanId}`)}
              />
            ))}
          </div>

          {/* Pagination */}
          {data.total_pages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground font-mono">{data.count} session{data.count !== 1 ? "er" : ""}</p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs font-mono px-2 text-muted-foreground">{page} / {data.total_pages}</span>
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= data.total_pages} onClick={() => setPage(page + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Inspect dialog */}
      <InspectDialog session={inspecting} open={!!inspecting} onClose={() => setInspecting(null)} />
    </PageShell>
  );
};

export default Sessions;
