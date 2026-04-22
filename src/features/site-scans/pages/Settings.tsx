import PageShell from "@/components/layout/PageShell";
import DataSectionCard from "@/components/shared/DataSectionCard";
import { Badge } from "@/components/ui/badge";
import {
  ScanLine,
  FolderOpen,
  Upload,
  Cpu,
  Image,
  Clock,
  Link2,
  Info,
} from "lucide-react";

// =============================================
// Config data (ready to be replaced by DB/API)
// =============================================

const SCAN_TYPES = [
  { value: "lidar_terrain", label: "LiDAR Terrain", description: "Terrängskanning med LiDAR-sensor" },
  { value: "lidar_structure", label: "LiDAR Structure", description: "Strukturskanning av byggnader/objekt" },
  { value: "photogrammetry", label: "Photogrammetry", description: "Fotogrammetrisk 3D-rekonstruktion" },
  { value: "aerial_survey", label: "Aerial Survey", description: "Drönarmätning av större ytor" },
  { value: "indoor_scan", label: "Indoor Scan", description: "Inomhusskanning av rum/lokaler" },
];

const ASSET_TYPES = [
  { value: "raw_payload", label: "Raw Payload", mime: "JSON, ZIP, binary", bucket: "site-scan-raw" },
  { value: "pointcloud", label: "Point Cloud", mime: "PLY, LAS, LAZ", bucket: "site-scan-processed" },
  { value: "mesh", label: "Mesh", mime: "PLY, OBJ, GLTF, USDZ", bucket: "site-scan-processed" },
  { value: "heightmap", label: "Heightmap", mime: "PNG, TIFF, binary", bucket: "site-scan-processed" },
  { value: "texture", label: "Texture", mime: "JPEG, PNG, WebP", bucket: "site-scan-processed" },
  { value: "preview_image", label: "Preview Image", mime: "JPEG, PNG, WebP", bucket: "site-scan-preview" },
  { value: "thumbnail", label: "Thumbnail", mime: "JPEG, PNG, WebP", bucket: "site-scan-preview" },
  { value: "report", label: "Report", mime: "JSON, PDF", bucket: "site-scan-raw" },
  { value: "other", label: "Other", mime: "Valfri", bucket: "site-scan-raw" },
];

const UPLOAD_LIMITS = [
  { label: "Max filstorlek per asset", value: "500 MB" },
  { label: "Max antal assets per scan", value: "50" },
  { label: "Max total storlek per scan", value: "5 GB" },
  { label: "Session timeout (inaktivitet)", value: "2 timmar" },
  { label: "Tillåtna parallella uploads", value: "3" },
  { label: "Duplicate detection", value: "Checksum-baserad" },
];

const PROCESSING_DEFAULTS = [
  { label: "Standardjobb vid finalize", value: "pointcloud_generation" },
  { label: "Auto-start processing", value: "Ja, om raw data finns" },
  { label: "Max processing-tid", value: "30 minuter" },
  { label: "Retry vid failure", value: "Manuell" },
  { label: "Output-format pointcloud", value: "PLY" },
  { label: "Output-format mesh", value: "GLTF" },
  { label: "Koordinatsystem", value: "WGS 84 (EPSG:4326)" },
];

const PREVIEW_DEFAULTS = [
  { label: "Preview-format", value: "JPEG" },
  { label: "Preview max dimension", value: "1920 × 1080 px" },
  { label: "Thumbnail dimension", value: "400 × 300 px" },
  { label: "JPEG-kvalitet", value: "85%" },
  { label: "Auto-generering", value: "Vid processing" },
  { label: "Signed URL-livslängd", value: "300 sekunder" },
];

const RETENTION_RULES = [
  { label: "Raw data", value: "90 dagar", note: "Rensas efter processing" },
  { label: "Processed data", value: "Obegränsat", note: "Behålls tills scan arkiveras" },
  { label: "Preview-bilder", value: "Obegränsat", note: "Följer scan-livscykeln" },
  { label: "Arkiverade scans", value: "365 dagar", note: "Soft delete, rensas efter retention" },
  { label: "Sessioner (expired)", value: "30 dagar", note: "Metadata behålls" },
  { label: "Processing-loggar", value: "90 dagar", note: "Output/error-payload" },
];

const EXTERNAL_LINK_RULES = [
  { label: "Tillåtna externa system", value: "Valfritt (fritext)" },
  { label: "Entity-typer", value: "project, task, issue, document" },
  { label: "Max länkar per scan", value: "20" },
  { label: "Dubbletthantering", value: "Unik per system + entity_type + entity_id" },
  { label: "Synkriktning", value: "Envägs (SiteScan → externt)" },
];

// =============================================
// Reusable settings table
// =============================================

function SettingsTable({ rows }: { rows: { label: string; value: string; note?: string }[] }) {
  return (
    <div className="divide-y divide-border">
      {rows.map((row, i) => (
        <div key={i} className="flex items-start justify-between gap-4 py-2.5">
          <div className="min-w-0">
            <span className="text-sm">{row.label}</span>
            {row.note && <p className="text-[11px] text-muted-foreground mt-0.5">{row.note}</p>}
          </div>
          <span className="text-sm font-mono font-medium text-right shrink-0">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

// =============================================
// Page
// =============================================

const SettingsPage = () => {
  return (
    <PageShell
      title="Settings"
      description="Systemregler, standardvärden och konfiguration."
      badge={
        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground bg-muted/50 rounded px-2 py-0.5">
          <Info className="h-3 w-3" /> Konfiguration uppdateras i kod
        </span>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Scan types */}
        <DataSectionCard title="Tillåtna scan-typer" description="Typer av skanningar som stöds" className="lg:col-span-1">
          <div className="divide-y divide-border">
            {SCAN_TYPES.map((t) => (
              <div key={t.value} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <ScanLine className="h-4 w-4 text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{t.label}</p>
                    <p className="text-[11px] text-muted-foreground">{t.description}</p>
                  </div>
                </div>
                <Badge variant="outline" className="font-mono text-[10px] shrink-0">{t.value}</Badge>
              </div>
            ))}
          </div>
        </DataSectionCard>

        {/* Asset types */}
        <DataSectionCard title="Tillåtna asset-typer" description="Filtyper och bucket-routing" className="lg:col-span-1">
          <div className="divide-y divide-border">
            {ASSET_TYPES.map((a) => (
              <div key={a.value} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{a.label}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">{a.mime}</p>
                  </div>
                </div>
                <Badge variant="outline" className="font-mono text-[10px] shrink-0">{a.bucket}</Badge>
              </div>
            ))}
          </div>
        </DataSectionCard>

        {/* Upload limits */}
        <DataSectionCard title="Upload-begränsningar" description="Regler för filuppladdning">
          <SettingsTable rows={UPLOAD_LIMITS} />
        </DataSectionCard>

        {/* Processing defaults */}
        <DataSectionCard title="Processing-standardvärden" description="Standardinställningar för bearbetning">
          <SettingsTable rows={PROCESSING_DEFAULTS} />
        </DataSectionCard>

        {/* Preview defaults */}
        <DataSectionCard title="Preview-inställningar" description="Bildgenerering och visning">
          <SettingsTable rows={PREVIEW_DEFAULTS} />
        </DataSectionCard>

        {/* Retention */}
        <DataSectionCard title="Retention & livscykel" description="Regler för datalagring och rensning">
          <SettingsTable rows={RETENTION_RULES} />
        </DataSectionCard>

        {/* External linking */}
        <DataSectionCard title="Externa kopplingar" description="Regler för integration med andra system" className="lg:col-span-2">
          <SettingsTable rows={EXTERNAL_LINK_RULES} />
        </DataSectionCard>
      </div>
    </PageShell>
  );
};

export default SettingsPage;
