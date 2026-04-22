import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase as _supabase } from "@/integrations/supabase/client";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase: any = _supabase;
import { formatFileSize, getAssetTypeIcon } from "@/features/site-scans/lib/storage";
import type { Database } from "@/integrations/supabase/types";

import PageShell from "@/features/site-scans/components/layout/PageShell";
import FilterBar from "@/features/site-scans/components/shared/FilterBar";
import EmptyState from "@/features/site-scans/components/shared/EmptyState";
import ErrorState from "@/features/site-scans/components/shared/ErrorState";
import LoadingState from "@/features/site-scans/components/shared/LoadingState";
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
import {
  FolderOpen,
  ExternalLink,
  Info,
  ChevronLeft,
  ChevronRight,
  Database as DbIcon,
  FileText,
  Hash,
  HardDrive,
} from "lucide-react";
import { fmt } from "@/features/site-scans/lib/format";

type AssetType = string;

const ASSET_TYPE_OPTIONS: { value: AssetType; label: string }[] = [
  { value: "pointcloud", label: "Point Cloud" },
  { value: "mesh", label: "Mesh" },
  { value: "texture", label: "Texture" },
  { value: "heightmap", label: "Heightmap" },
  { value: "thumbnail", label: "Thumbnail" },
  { value: "preview_image", label: "Preview Image" },
  { value: "raw_payload", label: "Raw Payload" },
  { value: "report", label: "Report" },
  { value: "other", label: "Other" },
];

const PAGE_SIZE = 25;

// =============================================
// Data hook
// =============================================

interface AssetRow {
  id: string;
  site_scan_id: string;
  asset_type: AssetType;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  checksum: string | null;
  created_at: string;
  scan_title?: string;
}

function useAssets(params: { search: string; assetType: string; page: number }) {
  return useQuery({
    queryKey: ["site-scan-assets", "list", params],
    queryFn: async () => {
      let query = supabase
        .from("site_scan_assets")
        .select("*", { count: "exact" });

      if (params.assetType !== "all") {
        query = query.eq("asset_type", params.assetType as AssetType);
      }

      const from = (params.page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.order("created_at", { ascending: false }).range(from, to);

      const { data: assets, error, count } = await query;
      if (error) throw error;

      // Fetch scan titles
      const scanIds = [...new Set((assets ?? []).map((a) => a.site_scan_id))];
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

      let enriched: AssetRow[] = (assets ?? []).map((a) => ({
        ...a,
        scan_title: scanMap[a.site_scan_id] ?? "Okänd scan",
      }));

      // Client-side search
      if (params.search.trim()) {
        const term = params.search.trim().toLowerCase();
        enriched = enriched.filter(
          (a) =>
            a.file_name.toLowerCase().includes(term) ||
            a.scan_title?.toLowerCase().includes(term) ||
            a.mime_type?.toLowerCase().includes(term) ||
            a.storage_path?.toLowerCase().includes(term) ||
            a.checksum?.toLowerCase().includes(term)
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

function useAssetStats() {
  return useQuery({
    queryKey: ["site-scan-assets", "stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_scan_assets")
        .select("asset_type, file_size");
      if (error) throw error;

      const byType: Record<string, { count: number; size: number }> = {};
      let totalSize = 0;
      for (const a of data ?? []) {
        const t = a.asset_type;
        if (!byType[t]) byType[t] = { count: 0, size: 0 };
        byType[t].count++;
        byType[t].size += a.file_size ?? 0;
        totalSize += a.file_size ?? 0;
      }
      return { total: data?.length ?? 0, totalSize, byType };
    },
  });
}

// =============================================
// Helpers
// =============================================

// fmt imported from @/features/site-scans/lib/format

function InfoRow({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center gap-2 py-1.5">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className={`text-xs text-right truncate max-w-[280px] ${mono ? "font-mono" : ""}`} title={value ?? undefined}>{value || "—"}</span>
    </div>
  );
}

// =============================================
// Inspect dialog
// =============================================

function InspectDialog({ asset, open, onClose, onOpenScan }: { asset: AssetRow | null; open: boolean; onClose: () => void; onOpenScan: () => void }) {
  if (!asset) return null;
  const Icon = getAssetTypeIcon(asset.asset_type);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" />
            Asset detaljer
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 p-3 divide-y divide-border">
            <InfoRow label="Filnamn" value={asset.file_name} mono />
            <InfoRow label="Asset ID" value={asset.id} mono />
            <InfoRow label="Typ" value={asset.asset_type} />
            <InfoRow label="MIME" value={asset.mime_type} mono />
            <InfoRow label="Storlek" value={formatFileSize(asset.file_size)} />
            <InfoRow label="Bucket" value={asset.storage_bucket} mono />
            <InfoRow label="Path" value={asset.storage_path} mono />
            <InfoRow label="Checksum" value={asset.checksum} mono />
            <InfoRow label="Skapad" value={fmt(asset.created_at)} />
            <InfoRow label="Scan" value={asset.scan_title} />
            <InfoRow label="Scan ID" value={asset.site_scan_id} mono />
          </div>
          <Button variant="outline" size="sm" onClick={onOpenScan} className="gap-1.5 text-xs">
            <ExternalLink className="h-3 w-3" /> Öppna scan
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =============================================
// Table row
// =============================================

function AssetTableRow({ asset, onInspect, onOpenScan }: { asset: AssetRow; onInspect: () => void; onOpenScan: () => void }) {
  const Icon = getAssetTypeIcon(asset.asset_type);

  return (
    <tr className="border-b border-border hover:bg-muted/30 transition-colors group">
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded bg-muted/50 flex items-center justify-center shrink-0">
            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate max-w-[200px]">{asset.file_name}</p>
            <p className="text-[10px] text-muted-foreground font-mono uppercase">{asset.asset_type}</p>
          </div>
        </div>
      </td>
      <td className="py-2.5 px-3">
        <button onClick={onOpenScan} className="text-xs text-muted-foreground hover:text-primary transition-colors font-mono truncate max-w-[160px] block">
          {asset.scan_title}
        </button>
      </td>
      <td className="py-2.5 px-3 text-xs font-mono text-muted-foreground">{asset.mime_type ?? "—"}</td>
      <td className="py-2.5 px-3 text-xs font-mono text-right">{formatFileSize(asset.file_size)}</td>
      <td className="py-2.5 px-3 text-xs font-mono text-muted-foreground">{asset.storage_bucket ?? "—"}</td>
      <td className="py-2.5 px-3 text-xs text-muted-foreground">{fmt(asset.created_at)}</td>
      <td className="py-2.5 px-3">
        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={onInspect}>
          <Info className="h-3.5 w-3.5" />
        </Button>
      </td>
    </tr>
  );
}

// =============================================
// Page
// =============================================

const Assets = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [assetType, setAssetType] = useState("all");
  const [page, setPage] = useState(1);
  const [inspecting, setInspecting] = useState<AssetRow | null>(null);

  const { data: stats } = useAssetStats();
  const { data, isLoading, isError, error, refetch } = useAssets({ search, assetType, page });

  const handleSearch = useCallback((v: string) => { setSearch(v); setPage(1); }, []);
  const handleType = useCallback((v: string) => { setAssetType(v); setPage(1); }, []);

  const hasActiveFilters = search.trim().length > 0 || assetType !== "all";

  return (
    <PageShell title="Assets" description="Alla uppladdade filer i SiteScan-plattformen.">
      {/* Stats summary */}
      {stats && stats.total > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="rounded-lg border border-border bg-card px-4 py-3 flex items-center gap-3">
            <HardDrive className="h-4 w-4 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Totalt</p>
              <p className="text-sm font-bold font-heading">{stats.total} filer · {formatFileSize(stats.totalSize)}</p>
            </div>
          </div>
          {Object.entries(stats.byType)
            .sort(([, a], [, b]) => b.count - a.count)
            .map(([type, { count, size }]) => {
              const Icon = getAssetTypeIcon(type);
              return (
                <button
                  key={type}
                  onClick={() => handleType(type)}
                  className={`rounded-lg border px-3 py-2 flex items-center gap-2 text-xs transition-all ${assetType === type ? "border-primary/30 bg-primary/5" : "border-border bg-card hover:border-primary/15"}`}
                >
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="capitalize">{type.replace(/_/g, " ")}</span>
                  <span className="font-mono font-bold">{count}</span>
                  <span className="text-muted-foreground">{formatFileSize(size)}</span>
                </button>
              );
            })}
        </div>
      )}

      {/* Filter bar */}
      <FilterBar
        searchPlaceholder="Sök på filnamn, scan, MIME-typ, checksum…"
        searchValue={search}
        onSearchChange={handleSearch}
      >
        <Select value={assetType} onValueChange={handleType}>
          <SelectTrigger className="w-[150px] h-9 text-xs">
            <SelectValue placeholder="Asset typ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla typer</SelectItem>
            {ASSET_TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterBar>

      {/* States */}
      {isLoading && <LoadingState message="Laddar assets…" />}
      {isError && <ErrorState message={error?.message ?? "Kunde inte hämta assets."} onRetry={() => refetch()} />}

      {!isLoading && !isError && data && data.data.length === 0 && (
        <EmptyState
          icon={FolderOpen}
          title={hasActiveFilters ? "Inga matchande assets" : "Inga assets ännu"}
          description={hasActiveFilters ? "Prova att ändra filter." : "Assets registreras när filer laddas upp från native-appen."}
          action={hasActiveFilters ? (
            <Button variant="outline" size="sm" onClick={() => { setSearch(""); setAssetType("all"); setPage(1); }}>Rensa filter</Button>
          ) : undefined}
        />
      )}

      {/* Table */}
      {!isLoading && !isError && data && data.data.length > 0 && (
        <>
          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider py-2.5 px-3">Fil</th>
                  <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider py-2.5 px-3">Scan</th>
                  <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider py-2.5 px-3">MIME</th>
                  <th className="text-right text-[11px] font-medium text-muted-foreground uppercase tracking-wider py-2.5 px-3">Storlek</th>
                  <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider py-2.5 px-3">Bucket</th>
                  <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider py-2.5 px-3">Skapad</th>
                  <th className="w-10 py-2.5 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((asset) => (
                  <AssetTableRow
                    key={asset.id}
                    asset={asset}
                    onInspect={() => setInspecting(asset)}
                    onOpenScan={() => navigate(`/scans/${asset.site_scan_id}`)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {data.total_pages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground font-mono">{data.count} assets totalt</p>
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
      <InspectDialog
        asset={inspecting}
        open={!!inspecting}
        onClose={() => setInspecting(null)}
        onOpenScan={() => {
          if (inspecting) navigate(`/scans/${inspecting.site_scan_id}`);
          setInspecting(null);
        }}
      />
    </PageShell>
  );
};

export default Assets;
