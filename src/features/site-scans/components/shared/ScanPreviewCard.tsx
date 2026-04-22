import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { fmt } from "@/features/site-scans/lib/format";
import {
  ExternalLink,
  Image as ImageIcon,
  Clock,
  Tag,
  Mountain,
  TriangleRight,
  Ruler,
} from "lucide-react";

// =============================================
// Status badge
// =============================================

const STATUS_STYLES: Record<string, { dot: string; bg: string; text: string }> = {
  received:   { dot: "bg-[hsl(var(--status-uploaded))]",   bg: "bg-[hsl(var(--status-uploaded)/0.12)]",   text: "text-[hsl(var(--status-uploaded))]" },
  processing: { dot: "bg-[hsl(var(--status-processing))]", bg: "bg-[hsl(var(--status-processing)/0.12)]", text: "text-[hsl(var(--status-processing))]" },
  ready:      { dot: "bg-[hsl(var(--status-ready))]",      bg: "bg-[hsl(var(--status-ready)/0.12)]",      text: "text-[hsl(var(--status-ready))]" },
  failed:     { dot: "bg-[hsl(var(--status-failed))]",     bg: "bg-[hsl(var(--status-failed)/0.12)]",     text: "text-[hsl(var(--status-failed))]" },
};
const DEFAULT_STYLE = { dot: "bg-[hsl(var(--status-draft))]", bg: "bg-[hsl(var(--status-draft)/0.12)]", text: "text-[hsl(var(--status-draft))]" };

export function ScanStatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? DEFAULT_STYLE;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium font-mono ${s.bg} ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${s.dot}`} />
      {status}
    </span>
  );
}

// =============================================
// Terrain metric helpers
// =============================================

const TERRAIN_KEYS: Array<{
  key: string;
  label: string;
  unit: string;
  icon: React.ElementType;
}> = [
  { key: "min_height",   label: "Min höjd",       unit: "m",  icon: Mountain },
  { key: "max_height",   label: "Max höjd",       unit: "m",  icon: Mountain },
  { key: "height_range", label: "Höjdskillnad",   unit: "m",  icon: Mountain },
  { key: "average_slope", label: "Medellutning",  unit: "°",  icon: TriangleRight },
  { key: "surface_area", label: "Yta",            unit: "m²", icon: Ruler },
];

function extractTerrainMetrics(metricsJson: Json | null): Array<{ label: string; value: number; unit: string; icon: React.ElementType }> {
  if (!metricsJson || typeof metricsJson !== "object" || Array.isArray(metricsJson)) return [];
  const m = metricsJson as Record<string, unknown>;
  return TERRAIN_KEYS
    .filter(({ key }) => typeof m[key] === "number")
    .map(({ key, label, unit, icon }) => ({ label, value: m[key] as number, unit, icon }));
}

// =============================================
// Scan preview card
// =============================================

export interface ScanPreviewData {
  id: string;
  title: string;
  status: string;
  scan_type: string | null;
  preview_url: string | null;
  metrics_json: Json | null;
  created_at: string;
}

interface ScanPreviewCardProps {
  scan: ScanPreviewData;
  /** URL or path for the "Open in SiteScan" button. Defaults to /m/tools/measure */
  scanUrl?: string;
}

const ScanPreviewCard = ({ scan, scanUrl = "/m/tools/measure" }: ScanPreviewCardProps) => {
  const terrainMetrics = extractTerrainMetrics(scan.metrics_json);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Preview image */}
      <div className="aspect-[21/9] bg-muted/20 flex items-center justify-center relative overflow-hidden">
        {scan.preview_url ? (
          <img
            src={scan.preview_url}
            alt={scan.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-muted-foreground/30">
            <ImageIcon className="h-8 w-8" />
            <span className="text-[10px] font-mono">Ingen preview</span>
          </div>
        )}
        {/* Status overlay */}
        <div className="absolute top-2.5 left-2.5">
          <ScanStatusBadge status={scan.status} />
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Title row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="text-sm font-semibold font-heading truncate">{scan.title}</h4>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
              {scan.scan_type && (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground font-mono">
                  <Tag className="h-3 w-3" />
                  {scan.scan_type}
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground font-mono">
                <Clock className="h-3 w-3" />
                {fmt(scan.created_at)}
              </span>
            </div>
          </div>

          <Button variant="outline" size="sm" className="gap-1.5 text-xs shrink-0" asChild>
            <a href={scanUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3 w-3" />
              Öppna
            </a>
          </Button>
        </div>

        {/* Terrain metrics grid */}
        {terrainMetrics.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {terrainMetrics.map(({ label, value, unit, icon: Icon }) => (
              <div
                key={label}
                className="rounded-md border border-border bg-background/50 px-2.5 py-2 flex items-center gap-2"
              >
                <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">{label}</p>
                  <p className="text-xs font-bold font-heading leading-none mt-0.5">
                    {value.toFixed(2)} {unit}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* No metrics fallback */}
        {terrainMetrics.length === 0 && (
          <p className="text-[11px] text-muted-foreground font-mono">
            Inga terrängdata tillgängliga ännu.
          </p>
        )}
      </div>
    </div>
  );
};

export default ScanPreviewCard;
