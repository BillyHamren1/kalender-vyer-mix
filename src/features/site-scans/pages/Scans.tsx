import { useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useSiteScansList, useArchiveScan, useReprocessScan } from "@/features/site-scans/hooks/useSiteScans";
import type { ListScansParams, SiteScanRow } from "@/features/site-scans/api/site-scans";
import type { SiteScanStatus } from "@/features/site-scans/types";

import PageShell from "@/features/site-scans/components/layout/PageShell";
import FilterBar from "@/features/site-scans/components/shared/FilterBar";
import EmptyState from "@/features/site-scans/components/shared/EmptyState";
import ErrorState from "@/features/site-scans/components/shared/ErrorState";
import LoadingState from "@/features/site-scans/components/shared/LoadingState";
import StatusBadge from "@/features/site-scans/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus,
  ScanLine,
  MoreHorizontal,
  ExternalLink,
  RotateCcw,
  Archive,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Mountain,
  Ruler,
  TriangleRight,
  Image as ImageIcon,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { sv } from "date-fns/locale";



const ALL_STATUSES: { value: SiteScanStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "uploading", label: "Uploading" },
  { value: "uploaded", label: "Uploaded" },
  { value: "processing", label: "Processing" },
  { value: "ready", label: "Ready" },
  { value: "failed", label: "Failed" },
  { value: "archived", label: "Archived" },
];

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "created_at:desc", label: "Senaste först" },
  { value: "created_at:asc", label: "Äldst först" },
  { value: "updated_at:desc", label: "Senast ändrad" },
  { value: "title:asc", label: "Titel A–Ö" },
  { value: "title:desc", label: "Titel Ö–A" },
];

const PAGE_SIZE = 12;

// =============================================
// Metric pill
// =============================================

function MetricPill({ icon: Icon, value, unit }: { icon: React.ElementType; value: number | null; unit: string }) {
  if (value == null) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-mono bg-muted/50 rounded px-1.5 py-0.5">
      <Icon className="h-3 w-3" />
      {value.toFixed(1)}{unit}
    </span>
  );
}

// =============================================
// Scan card
// =============================================

function ScanCard({
  scan,
  onOpen,
  onRetry,
  onArchive,
}: {
  scan: SiteScanRow;
  onOpen: () => void;
  onRetry: () => void;
  onArchive: () => void;
}) {
  return (
    <div className="group rounded-lg border border-border bg-card overflow-hidden transition-all hover:border-primary/20 hover:shadow-[0_0_24px_-8px_hsl(var(--scan-glow)/0.15)]">
      {/* Preview area */}
      <button
        onClick={onOpen}
        className="w-full aspect-[16/9] bg-muted/30 flex items-center justify-center relative overflow-hidden"
      >
        {scan.preview_image_path ? (
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-card/60" />
        ) : (
          <ScanLine className="h-8 w-8 text-muted-foreground/30" />
        )}
        {/* Status overlay */}
        <div className="absolute top-2.5 left-2.5">
          <StatusBadge status={scan.status} />
        </div>
      </button>

      {/* Content */}
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <button onClick={onOpen} className="text-sm font-semibold truncate block w-full text-left hover:text-primary transition-colors">
              {scan.title}
            </button>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              {formatDistanceToNow(new Date(scan.created_at), { addSuffix: true, locale: sv })}
            </p>
          </div>

          {/* Actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={onOpen} className="gap-2">
                <ExternalLink className="h-3.5 w-3.5" /> Öppna
              </DropdownMenuItem>
              {(scan.status === "failed" || scan.status === "ready") && (
                <DropdownMenuItem onClick={onRetry} className="gap-2">
                  <RotateCcw className="h-3.5 w-3.5" /> Bearbeta igen
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {scan.status !== "archived" && (
                <DropdownMenuItem onClick={onArchive} className="gap-2 text-muted-foreground">
                  <Archive className="h-3.5 w-3.5" /> Arkivera
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Description */}
        {scan.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{scan.description}</p>
        )}

        {/* Metrics */}
        {(scan.height_range != null || scan.average_slope != null || scan.surface_area != null) && (
          <div className="flex flex-wrap gap-1.5">
            <MetricPill icon={Mountain} value={scan.height_range} unit="m" />
            <MetricPill icon={TriangleRight} value={scan.average_slope} unit="°" />
            <MetricPill icon={Ruler} value={scan.surface_area} unit="m²" />
          </div>
        )}

        {/* Scan type tag */}
        {scan.scan_type && (
          <span className="inline-block text-[10px] uppercase tracking-wider font-mono text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5">
            {scan.scan_type}
          </span>
        )}
      </div>
    </div>
  );
}

// =============================================
// Pagination
// =============================================

function Pagination({
  page,
  totalPages,
  count,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  count: number;
  onPageChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between pt-2">
      <p className="text-xs text-muted-foreground font-mono">
        {count} scan{count !== 1 ? "s" : ""} totalt
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs font-mono px-2 text-muted-foreground">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// =============================================
// Main page
// =============================================

const Scans = () => {
  const navigate = useNavigate();
  const archiveMutation = useArchiveScan();
  const reprocessMutation = useReprocessScan();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState("created_at:desc");
  const [page, setPage] = useState(1);

  // Debounced search via useMemo on params
  const params = useMemo<ListScansParams>(() => {
    const [sort_by, sort_order] = sortKey.split(":") as [ListScansParams["sort_by"], ListScansParams["sort_order"]];
    return {
      search: search.trim() || undefined,
      status: statusFilter !== "all" ? (statusFilter as SiteScanStatus) : undefined,
      sort_by,
      sort_order,
      page,
      page_size: PAGE_SIZE,
    };
  }, [search, statusFilter, sortKey, page]);

  const { data, isLoading, isError, error, refetch } = useSiteScansList(params);

  // Reset page when filters change
  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const handleStatusChange = useCallback((v: string) => {
    setStatusFilter(v);
    setPage(1);
  }, []);

  const handleSortChange = useCallback((v: string) => {
    setSortKey(v);
    setPage(1);
  }, []);

  // Actions — all go via Edge Functions for server-side validation
  const handleOpen = useCallback((id: string) => {
    navigate(`/scans/${id}`);
  }, [navigate]);

  const handleRetry = useCallback((id: string) => {
    reprocessMutation.mutate(id, {
      onSuccess: () => toast.success("Scan köad för ombearbetning"),
      onError: (e) => toast.error("Kunde inte starta ombearbetning", { description: e.message }),
    });
  }, [reprocessMutation]);

  const handleArchive = useCallback((id: string) => {
    archiveMutation.mutate(id, {
      onSuccess: () => toast.success("Scan arkiverad"),
      onError: (e) => toast.error("Kunde inte arkivera", { description: e.message }),
    });
  }, [archiveMutation]);

  const hasActiveFilters = search.trim().length > 0 || statusFilter !== "all";

  return (
    <PageShell
      title="Scans"
      description="Alla 3D- och höjdscans från LiDAR-enheter."
    >
      {/* Filter bar */}
      <FilterBar
        searchPlaceholder="Sök på titel eller beskrivning…"
        searchValue={search}
        onSearchChange={handleSearch}
      >
        {/* Status filter */}
        <Select value={statusFilter} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-[130px] h-9 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla statusar</SelectItem>
            {ALL_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Sort */}
        <Select value={sortKey} onValueChange={handleSortChange}>
          <SelectTrigger className="w-[150px] h-9 text-xs">
            <ArrowUpDown className="h-3.5 w-3.5 mr-1.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterBar>

      {/* States */}
      {isLoading && <LoadingState message="Laddar scans…" />}

      {isError && (
        <ErrorState
          message={error?.message ?? "Kunde inte hämta scans."}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && data && data.data.length === 0 && (
        <EmptyState
          icon={ScanLine}
          title={hasActiveFilters ? "Inga matchande scans" : "Inga scans ännu"}
          description={
            hasActiveFilters
              ? "Prova att ändra filter eller sökord."
              : "Scans från LiDAR-enheter visas här när de laddas upp."
          }
          action={
            hasActiveFilters ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                  setPage(1);
                }}
              >
                Rensa filter
              </Button>
            ) : undefined
          }
        />
      )}

      {/* Grid */}
      {!isLoading && !isError && data && data.data.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {data.data.map((scan) => (
              <ScanCard
                key={scan.id}
                scan={scan}
                onOpen={() => handleOpen(scan.id)}
                onRetry={() => handleRetry(scan.id)}
                onArchive={() => handleArchive(scan.id)}
              />
            ))}
          </div>

          <Pagination
            page={data.page}
            totalPages={data.total_pages}
            count={data.count}
            onPageChange={setPage}
          />
        </>
      )}
    </PageShell>
  );
};

export default Scans;
