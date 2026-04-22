import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase as _supabase } from "@/integrations/supabase/client";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase: any = _supabase;
import type { Database } from "@/integrations/supabase/types";
import { normalizeError } from "@/features/site-scans/lib/errors";

import PageShell from "@/features/site-scans/components/layout/PageShell";
import FilterBar from "@/features/site-scans/components/shared/FilterBar";
import EmptyState from "@/features/site-scans/components/shared/EmptyState";
import ErrorState from "@/features/site-scans/components/shared/ErrorState";
import LoadingState from "@/features/site-scans/components/shared/LoadingState";
import StatusBadge, { type ScanStatus } from "@/features/site-scans/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Cpu,
  RotateCcw,
  Play,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { fmt, timeAgo } from "@/features/site-scans/lib/format";

type JobStatus = string;

// =============================================
// Helpers
// =============================================

function jobTypeLabel(type: string) {
  return type.replace(/_/g, " ");
}

// =============================================
// Data hooks
// =============================================

const PAGE_SIZE = 20;

interface JobRow {
  id: string;
  site_scan_id: string;
  job_type: string;
  status: JobStatus;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
  input_payload: unknown;
  output_payload: unknown;
  scan_title?: string;
}

function useProcessingJobs(params: { search: string; filter: string; page: number }) {
  return useQuery({
    queryKey: ["processing-jobs", params],
    queryFn: async () => {
      // Fetch jobs
      let query = supabase
        .from("site_scan_processing_jobs")
        .select("*", { count: "exact" });

      if (params.filter !== "all") {
        const filterStatus: JobStatus = params.filter as JobStatus;
        query = query.eq("status", filterStatus);
      }

      const from = (params.page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.order("created_at", { ascending: false }).range(from, to);

      const { data: jobs, error, count } = await query;
      if (error) throw error;

      // Fetch scan titles for these jobs
      const scanIds = [...new Set((jobs ?? []).map((j) => j.site_scan_id))];
      let scanMap: Record<string, string> = {};
      if (scanIds.length > 0) {
        const { data: scans } = await supabase
          .from("site_scans")
          .select("id, title")
          .in("id", scanIds);
        for (const s of scans ?? []) {
          scanMap[s.id] = s.title;
        }
      }

      let enriched: JobRow[] = (jobs ?? []).map((j) => ({
        ...j,
        scan_title: scanMap[j.site_scan_id] ?? "Okänd scan",
      }));

      // Client-side search
      if (params.search.trim()) {
        const term = params.search.trim().toLowerCase();
        enriched = enriched.filter(
          (j) =>
            j.scan_title?.toLowerCase().includes(term) ||
            j.job_type.toLowerCase().includes(term) ||
            j.error_message?.toLowerCase().includes(term)
        );
      }

      return {
        data: enriched,
        count: count ?? 0,
        page: params.page,
        total_pages: Math.ceil((count ?? 0) / PAGE_SIZE),
      };
    },
  });
}

interface JobStats {
  total: number;
  draft: number;
  processing: number;
  ready: number;
  failed: number;
  [key: string]: number;
}

function useJobStats() {
  return useQuery<JobStats>({
    queryKey: ["processing-jobs", "stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_scan_processing_jobs")
        .select("status");
      if (error) throw error;
      const counts: Record<string, number> = { draft: 0, processing: 0, ready: 0, failed: 0 };
      for (const r of data ?? []) {
        counts[r.status] = (counts[r.status] || 0) + 1;
      }
      return { total: data?.length ?? 0, ...counts } as JobStats;
    },
  });
}

// =============================================
// Job row component
// =============================================

function JobCard({
  job,
  onRetry,
  retrying,
  onOpenScan,
}: {
  job: JobRow;
  onRetry: () => void;
  retrying: boolean;
  onOpenScan: () => void;
}) {
  const isFailed = job.status === "failed";
  const isRunning = job.status === "processing";

  return (
    <div className={`rounded-lg border bg-card transition-all ${isFailed ? "border-destructive/30" : "border-border"}`}>
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <Cpu className={`h-4 w-4 shrink-0 ${isRunning ? "text-[hsl(var(--status-processing))] animate-spin" : "text-muted-foreground"}`} />
              <span className="text-sm font-semibold capitalize truncate">{jobTypeLabel(job.job_type)}</span>
            </div>
            <button onClick={onOpenScan} className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 font-mono">
              {job.scan_title} <ExternalLink className="h-2.5 w-2.5" />
            </button>
          </div>
          <StatusBadge status={job.status as ScanStatus} />
        </div>

        {/* Times */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted-foreground font-mono mt-3">
          <span>Skapad: {fmt(job.created_at)}</span>
          <span>Start: {fmt(job.started_at)}</span>
          <span>Slut: {fmt(job.completed_at)}</span>
          {job.started_at && !job.completed_at && isRunning && (
            <span>Pågått: {timeAgo(job.started_at)}</span>
          )}
        </div>

        {/* Error */}
        {isFailed && job.error_message && (
          <div className="flex items-start gap-1.5 text-xs text-destructive bg-destructive/5 rounded px-2.5 py-2 mt-3">
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
            <span className="break-words">{job.error_message}</span>
          </div>
        )}

        {/* Actions */}
        {(isFailed || job.status === "draft") && (
          <div className="pt-3 mt-3 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              disabled={retrying}
              className="h-7 text-xs gap-1.5"
            >
              {retrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
              {job.status === "draft" ? "Starta" : "Försök igen"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================
// Stats bar
// =============================================

const STAT_ITEMS: { key: string; label: string; icon: React.ElementType; color: string }[] = [
  { key: "draft", label: "Köade", icon: Clock, color: "var(--status-draft)" },
  { key: "processing", label: "Pågår", icon: Cpu, color: "var(--status-processing)" },
  { key: "ready", label: "Klara", icon: CheckCircle2, color: "var(--status-ready)" },
  { key: "failed", label: "Misslyckade", icon: AlertTriangle, color: "var(--status-failed)" },
];

// =============================================
// Page
// =============================================

const FILTER_OPTIONS = [
  { value: "all", label: "Alla" },
  { value: "draft", label: "Köade" },
  { value: "processing", label: "Pågår" },
  { value: "ready", label: "Klara" },
  { value: "failed", label: "Misslyckade" },
];

const Processing = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const { data: stats } = useJobStats();
  const { data, isLoading, isError, error, refetch } = useProcessingJobs({ search, filter, page });

  const handleSearch = useCallback((v: string) => { setSearch(v); setPage(1); }, []);
  const handleFilter = useCallback((v: string) => { setFilter(v); setPage(1); }, []);

  const handleRetry = useCallback(async (job: JobRow) => {
    // Guard: only failed jobs can be retried
    if (job.status !== "failed") {
      toast.error("Kan inte starta om", { description: `Jobb har status '${job.status}', bara misslyckade jobb kan startas om.` });
      return;
    }

    setRetryingId(job.id);
    try {
      // Verify the scan exists and is in a retryable state before mutating
      const { data: scanRow, error: scanCheckErr } = await supabase
        .from("site_scans")
        .select("id, status")
        .eq("id", job.site_scan_id)
        .maybeSingle();

      if (scanCheckErr) throw scanCheckErr;
      if (!scanRow) {
        toast.error("Skanning hittades inte", { description: `Skannings-ID ${job.site_scan_id} saknas.` });
        return;
      }

      const retryableStatuses: JobStatus[] = ["failed", "processing"];
      if (!retryableStatuses.includes(scanRow.status as JobStatus)) {
        toast.error("Kan inte starta om", { description: `Skanning har status '${scanRow.status}', förväntat: failed eller processing.` });
        return;
      }

      // Reset the scan status to uploaded so process-site-scan can pick it up
      const uploadedStatus: JobStatus = "uploaded";
      await supabase
        .from("site_scans")
        .update({ status: uploadedStatus })
        .eq("id", job.site_scan_id);

      // Update job to draft
      const draftStatus: JobStatus = "draft";
      await supabase
        .from("site_scan_processing_jobs")
        .update({ status: draftStatus, error_message: null, started_at: null, completed_at: null })
        .eq("id", job.id);

      // Invoke process-site-scan via supabase client
      const { data: invokeResult, error: invokeError } = await supabase.functions.invoke(
        "process-site-scan",
        {
          body: {
            site_scan_id: job.site_scan_id,
            processing_job_id: job.id,
          },
        }
      );

      if (invokeError) {
        toast.error("Bearbetning misslyckades", { description: invokeError.message });
      } else if (invokeResult?.ok) {
        toast.success("Bearbetning startad", { description: invokeResult.message });
      } else {
        toast.error("Bearbetning misslyckades", { description: invokeResult?.error ?? "Okänt fel" });
      }

      queryClient.invalidateQueries({ queryKey: ["processing-jobs"] });
    } catch (e: unknown) {
      const appErr = normalizeError(e, "Kunde inte starta om bearbetning");
      toast.error(appErr.userMessage, {
        description: appErr.category !== "unknown" ? appErr.message : undefined,
      });
    } finally {
      setRetryingId(null);
    }
  }, [queryClient]);

  const hasActiveFilters = search.trim().length > 0 || filter !== "all";

  return (
    <PageShell title="Processing" description="Bearbetningsjobb och pipeline-status.">
      {/* Stats */}
      {stats && stats.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {STAT_ITEMS.map(({ key, label, icon: Icon, color }) => {
            const count = stats[key] ?? 0;
            return (
              <button
                key={key}
                onClick={() => handleFilter(key)}
                className={`rounded-lg border p-4 text-left transition-all ${filter === key ? "border-primary/30 bg-primary/5" : "border-border bg-card hover:border-primary/15"}`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon className="h-4 w-4" style={{ color: `hsl(${color})` }} />
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
                <span className="text-2xl font-bold font-heading">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <FilterBar
        searchPlaceholder="Sök på jobbtyp, scan-titel, felmeddelande…"
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
      {isLoading && <LoadingState message="Laddar jobb…" />}
      {isError && <ErrorState message={error?.message ?? "Kunde inte hämta jobb."} onRetry={() => refetch()} />}

      {!isLoading && !isError && data && data.data.length === 0 && (
        <EmptyState
          icon={Cpu}
          title={hasActiveFilters ? "Inga matchande jobb" : "Inga jobb ännu"}
          description={hasActiveFilters ? "Prova att ändra filter." : "Processing-jobb skapas när scans bearbetas."}
          action={hasActiveFilters ? (
            <Button variant="outline" size="sm" onClick={() => { setSearch(""); setFilter("all"); setPage(1); }}>Rensa filter</Button>
          ) : undefined}
        />
      )}

      {/* Job grid */}
      {!isLoading && !isError && data && data.data.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.data.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                retrying={retryingId === job.id}
                onRetry={() => handleRetry(job)}
                onOpenScan={() => navigate(`/m/tools/measure/${job.site_scan_id}`)}
              />
            ))}
          </div>

          {data.total_pages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground font-mono">{data.count} jobb totalt</p>
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
    </PageShell>
  );
};

export default Processing;
