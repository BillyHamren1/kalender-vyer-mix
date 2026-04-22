import { useParams, useNavigate } from "react-router-dom";
import { useSiteScanDetail } from "@/features/site-scans/hooks/useSiteScans";
import { formatFileSize, getAssetTypeIcon } from "@/features/site-scans/lib/storage";
import { fmt } from "@/features/site-scans/lib/format";
import { useTriggerSync } from "@/features/site-scans/hooks/useSiteScans";
import StatusBadge from "@/features/site-scans/components/shared/StatusBadge";
import DataSectionCard from "@/features/site-scans/components/shared/DataSectionCard";
import EmptyState from "@/features/site-scans/components/shared/EmptyState";
import ErrorState from "@/features/site-scans/components/shared/ErrorState";
import LoadingState from "@/features/site-scans/components/shared/LoadingState";
import ExternalLinksSection from "@/features/site-scans/components/shared/ExternalLinksSection";
import SyncStatusPanel from "@/features/site-scans/components/shared/SyncStatusPanel";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState, useEffect, lazy, Suspense } from "react";
import { supabase as _supabase } from "@/integrations/supabase/client";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase: any = _supabase;
import TerrainProfileVisual from "@/features/site-scans/components/scan-detail/TerrainProfileVisual";
import {
  ArrowLeft,
  ScanLine,
  Mountain,
  Ruler,
  TriangleRight,
  Cpu,
  Image as ImageIcon,
  Clock,
  Smartphone,
  MapPin,
  AlertTriangle,
  Box,
  RefreshCw,
  DoorOpen,
  Layers,
  Move3D,
} from "lucide-react";

// =============================================
// Helpers
// =============================================

const UsdzViewer = lazy(() => import("@/features/site-scans/components/scan-detail/UsdzViewer"));

type StorageRef = {
  bucket: "site-scan-raw" | "site-scan-processed" | "site-scan-preview";
  path: string;
};

function parseStorageRef(
  raw: string | null | undefined,
  fallbackBucket?: StorageRef["bucket"],
): StorageRef | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^\/+/, "");
  if (!cleaned) return null;

  const knownBuckets: StorageRef["bucket"][] = [
    "site-scan-raw",
    "site-scan-processed",
    "site-scan-preview",
  ];

  for (const bucket of knownBuckets) {
    const prefix = `${bucket}/`;
    if (cleaned.startsWith(prefix)) {
      const relativePath = cleaned.slice(prefix.length);
      return relativePath ? { bucket, path: relativePath } : null;
    }
  }

  if (fallbackBucket) {
    return { bucket: fallbackBucket, path: cleaned };
  }

  return null;
}

function MetricCard({ label, value, unit, icon: Icon }: { label: string; value: number | null; unit: string; icon: React.ElementType }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-3">
      <div className="h-9 w-9 rounded-lg bg-primary/8 border border-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-lg font-bold font-heading leading-none mt-0.5">
          {value != null ? `${value.toFixed(2)} ${unit}` : "—"}
        </p>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-mono">{value || "—"}</span>
    </div>
  );
}

const ScanDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: scan, isLoading, isError, error, refetch } = useSiteScanDetail(id);
  const syncMutation = useTriggerSync();
  const [retryingTarget, setRetryingTarget] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [modelFormat, setModelFormat] = useState<"obj" | "usdz" | "glb" | "gltf" | "unknown" | null>(null);
  const [pointCloudUrl, setPointCloudUrl] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // Generate signed URL for preview image
  useEffect(() => {
    if (!scan) {
      setPreviewUrl(null);
      setIsPreviewLoading(false);
      return;
    }

    const previewAsset = scan.assets.find((a) => a.asset_type === "preview_image");
    const previewRef =
      parseStorageRef(scan.preview_image_path, "site-scan-preview") ??
      parseStorageRef(previewAsset?.storage_path, (previewAsset?.storage_bucket as StorageRef["bucket"] | undefined) ?? "site-scan-preview");

    if (!previewRef) {
      setPreviewUrl(null);
      setIsPreviewLoading(false);
      return;
    }

    setIsPreviewLoading(true);
    supabase.storage
      .from(previewRef.bucket)
      .createSignedUrl(previewRef.path, 3600)
      .then(({ data, error: signedError }) => {
        if (signedError) {
          console.warn("Kunde inte signera preview-URL:", signedError.message);
          setPreviewUrl(null);
          return;
        }
        setPreviewUrl(data?.signedUrl ?? null);
      })
      .finally(() => setIsPreviewLoading(false));
  }, [scan]);

  // Generate signed URL for 3D model (mesh asset)
  useEffect(() => {
    if (!scan) {
      setModelUrl(null);
      setModelFormat(null);
      return;
    }

    const meshAssets = scan.assets.filter((a) => a.asset_type === "mesh" && !!a.storage_path);

    const meshAsset =
      meshAssets.find((a) => a.file_name?.toLowerCase().endsWith(".glb") || a.mime_type?.includes("gltf")) ??
      meshAssets.find((a) => a.file_name?.toLowerCase().endsWith(".obj") || a.mime_type?.includes("model/obj")) ??
      meshAssets.find((a) => a.file_name?.toLowerCase().endsWith(".usdz") || a.mime_type?.includes("usdz")) ??
      meshAssets[0];

    const detectFormat = (fileName?: string | null, mimeType?: string | null): "obj" | "usdz" | "glb" | "gltf" | "unknown" => {
      const f = fileName?.toLowerCase() ?? "";
      const m = mimeType?.toLowerCase() ?? "";
      if (f.endsWith(".obj") || m.includes("model/obj")) return "obj";
      if (f.endsWith(".usdz") || m.includes("usdz")) return "usdz";
      if (f.endsWith(".glb") || m.includes("gltf-binary")) return "glb";
      if (f.endsWith(".gltf") || m.includes("gltf")) return "gltf";
      return "unknown";
    };

    const meshRef =
      parseStorageRef(meshAsset?.storage_path, meshAsset?.storage_bucket as StorageRef["bucket"] | undefined) ??
      parseStorageRef(scan.mesh_path, "site-scan-processed");

    if (!meshRef) {
      setModelUrl(null);
      setModelFormat(null);
      return;
    }

    setModelFormat(detectFormat(meshAsset?.file_name, meshAsset?.mime_type));

    supabase.storage
      .from(meshRef.bucket)
      .createSignedUrl(meshRef.path, 3600)
      .then(({ data, error: signedError }) => {
        if (signedError) {
          console.warn("Kunde inte signera mesh-URL:", signedError.message);
          setModelUrl(null);
          setModelFormat(null);
          return;
        }
        setModelUrl(data?.signedUrl ?? null);
      });
  }, [scan]);

  // Generate signed URL for point cloud asset (PLY)
  useEffect(() => {
    if (!scan) {
      setPointCloudUrl(null);
      return;
    }

    const pointCloudAsset = scan.assets.find((a) => a.asset_type === "pointcloud" && !!a.storage_path);
    const pointCloudRef =
      parseStorageRef(scan.point_cloud_path, "site-scan-processed") ??
      parseStorageRef(pointCloudAsset?.storage_path, pointCloudAsset?.storage_bucket as StorageRef["bucket"] | undefined);

    if (!pointCloudRef) {
      setPointCloudUrl(null);
      return;
    }

    supabase.storage
      .from(pointCloudRef.bucket)
      .createSignedUrl(pointCloudRef.path, 3600)
      .then(({ data, error: signedError }) => {
        if (signedError) {
          console.warn("Kunde inte signera punktmoln-URL:", signedError.message);
          setPointCloudUrl(null);
          return;
        }
        setPointCloudUrl(data?.signedUrl ?? null);
      });
  }, [scan]);

  const syncing = syncMutation.isPending && !retryingTarget;

  const handleSync = async () => {
    if (!id) return;
    syncMutation.mutate({ siteId: id }, {
      onSuccess: (result) => {
        if (result.synced > 0) toast.success(`${result.synced} sync target(s) synkade`);
        if (result.failed > 0) toast.error(`${result.failed} sync target(s) misslyckades`);
        if (result.synced === 0 && result.failed === 0) toast.info("Inga sync targets att synka");
        refetch();
      },
      onError: (err) => toast.error(err.message ?? "Sync misslyckades"),
    });
  };

  const handleRetrySync = async (syncTargetId: string) => {
    if (!id) return;
    setRetryingTarget(syncTargetId);
    syncMutation.mutate({ siteId: id, syncTargetId }, {
      onSuccess: (result) => {
        if (result.synced > 0) toast.success("Sync lyckades");
        else toast.error(result.results?.[0]?.message ?? "Retry misslyckades");
        refetch();
        setRetryingTarget(null);
      },
      onError: (err) => {
        toast.error(err.message ?? "Retry misslyckades");
        setRetryingTarget(null);
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex-1 p-6 md:p-8">
        <LoadingState message="Laddar scan…" />
      </div>
    );
  }

  if (isError || !scan) {
    return (
      <div className="flex-1 p-6 md:p-8">
        <ErrorState
          message={error?.message ?? "Kunde inte hitta scan."}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const hasTerrainMetrics = scan.min_height != null || scan.max_height != null || scan.average_slope != null || scan.surface_area != null;
  const extraMetrics = scan.metrics.filter(
    (m) => !["min_height", "max_height", "height_range", "average_slope", "surface_area", "total_file_size", "asset_count"].includes(m.metric_key)
  );

  const hasSyncTargets = scan.sync_targets && scan.sync_targets.length > 0;
  const hasPendingSync = scan.sync_targets?.some((t) => t.sync_status === "pending_sync" || t.sync_status === "not_linked");
  const hasPreviewSource = !!scan.preview_image_path || scan.assets.some((a) => a.asset_type === "preview_image");

  return (
    <div className="flex-1 p-6 md:p-8 space-y-6 max-w-6xl">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate('/m/tools/measure')}
        className="-ml-2 gap-1.5"
      >
        <ArrowLeft className="h-4 w-4" />
        Tillbaka till SiteScan
      </Button>
...
      {/* Preview + Info grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Preview */}
        <div className="lg:col-span-2 rounded-lg border border-border bg-card overflow-hidden">
          <div className="aspect-video bg-muted/30 flex items-center justify-center relative">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={`Preview av ${scan.title}`}
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : hasPreviewSource ? (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                <ImageIcon className="h-10 w-10 opacity-30" />
                <span className="absolute bottom-3 right-3 text-[10px] font-mono bg-background/80 backdrop-blur-sm rounded px-2 py-1">
                  {isPreviewLoading ? "Laddar preview…" : "Preview kunde inte laddas"}
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground/40">
                <ScanLine className="h-12 w-12" />
                <span className="text-xs font-mono">Ingen preview tillgänglig</span>
              </div>
            )}
          </div>
        </div>

        {/* Scan info */}
        <DataSectionCard title="Scaninfo" className="lg:col-span-1">
          <InfoRow label="Status" value={scan.status} />
          <InfoRow label="Typ" value={scan.scan_type} />
          <InfoRow label="Plattform" value={scan.device_platform} />
          <InfoRow label="Modell" value={scan.device_model} />
          <InfoRow label="Skapad" value={fmt(scan.created_at)} />
          <InfoRow label="Uppladdad" value={fmt(scan.uploaded_at)} />
          <InfoRow label="Bearbetad" value={fmt(scan.processed_at)} />
          {scan.failed_at && <InfoRow label="Misslyckades" value={fmt(scan.failed_at)} />}
        </DataSectionCard>
      </div>

      {/* 3D Model Viewer */}
      {modelUrl && (modelFormat === "glb" || modelFormat === "gltf") ? (
        <DataSectionCard title="3D-modell" description="Interaktiv vy — dra för att rotera, scrolla för att zooma">
          <div className="rounded-lg overflow-hidden border border-border bg-muted/20" style={{ height: 400 }}>
            {/* @ts-ignore */}
            <model-viewer
              src={modelUrl}
              alt={`3D-modell av ${scan.title}`}
              camera-controls
              auto-rotate
              shadow-intensity="1"
              style={{ width: "100%", height: "100%" }}
            />
          </div>
        </DataSectionCard>
      ) : modelUrl && (modelFormat === "obj" || modelFormat === "usdz") ? (
        <DataSectionCard title="3D-modell" description="RoomPlan — dra för att rotera, scrolla för att zooma">
          <Suspense
            fallback={
              <div className="h-[400px] w-full rounded-lg border border-border bg-muted/20 flex items-center justify-center text-sm text-muted-foreground">
                Laddar 3D-modell…
              </div>
            }
          >
            <UsdzViewer
              url={modelUrl}
              alt={`3D-modell av ${scan.title}`}
              height={400}
            />
          </Suspense>
        </DataSectionCard>
      ) : modelUrl ? (
        <DataSectionCard title="3D-modell" description="Interaktiv vy — dra för att rotera, scrolla för att zooma">
          <div className="rounded-lg overflow-hidden border border-border bg-muted/20" style={{ height: 400 }}>
            {/* @ts-ignore */}
            <model-viewer
              src={modelUrl}
              alt={`3D-modell av ${scan.title}`}
              camera-controls
              auto-rotate
              shadow-intensity="1"
              style={{ width: "100%", height: "100%" }}
            />
          </div>
        </DataSectionCard>
      ) : pointCloudUrl ? (
        <DataSectionCard title="Punktmoln (PLY)" description="Punktmoln finns uppladdat för denna ytskanning">
          <div className="rounded-lg border border-border bg-muted/10 p-6 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Punktmolnsfil tillgänglig</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Mesh saknas, men punktmoln och terrängdata finns och kan öppnas/laddas ner.
                </p>
              </div>
              <Button asChild size="sm" variant="outline" className="shrink-0">
                <a href={pointCloudUrl} target="_blank" rel="noreferrer">Öppna PLY</a>
              </Button>
            </div>
          </div>
        </DataSectionCard>
      ) : (scan.status === "ready" || scan.status === "uploaded" || scan.status === "processing") && scan.assets.length > 0 && (
        <DataSectionCard title="3D-modell" description="Ingen 3D-modell tillgänglig">
          <div className="rounded-lg border border-border bg-muted/10 p-6 flex flex-col items-center gap-3 text-center">
            <div className="h-12 w-12 rounded-full bg-muted/30 flex items-center justify-center">
              <Box className="h-6 w-6 text-muted-foreground/50" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Ingen 3D-mesh genererad</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                {scan.status === "processing"
                  ? "Bearbetning pågår — terrängdata visas nedan om tillgängligt."
                  : scan.heightmap_path || hasTerrainMetrics
                    ? "Terrängdata och metrics finns tillgängliga nedan."
                    : "Skanningen innehåller inga 3D-data."}
              </p>
            </div>
          </div>
        </DataSectionCard>
      )}

      {/* Room Metrics (for room_scan) */}
      {scan.scan_type === "room_scan" && (() => {
        const rm = (key: string) => scan.metrics.find((m) => m.metric_key === key)?.metric_value ?? null;
        const walls = rm("walls");
        const doors = rm("doors");
        const windows = rm("windows");
        const floorArea = rm("floor_area");
        const volume = rm("volume");
        const roomHeight = rm("room_height");
        const hasRoomData = walls != null || floorArea != null || volume != null;
        if (!hasRoomData) return null;
        return (
          <div>
            <h2 className="text-sm font-semibold font-heading mb-3">Rumsdata</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {walls != null && <MetricCard label="Väggar" value={walls} unit="st" icon={Layers} />}
              {doors != null && <MetricCard label="Dörrar" value={doors} unit="st" icon={DoorOpen} />}
              {windows != null && <MetricCard label="Fönster" value={windows} unit="st" icon={Box} />}
              {floorArea != null && <MetricCard label="Golvyta" value={floorArea} unit="m²" icon={Ruler} />}
              {volume != null && <MetricCard label="Volym" value={volume} unit="m³" icon={Move3D} />}
              {roomHeight != null && <MetricCard label="Takhöjd" value={roomHeight} unit="m" icon={Mountain} />}
            </div>
          </div>
        );
      })()}

      {/* Terrain Metrics (for surface scans) */}
      {scan.scan_type !== "room_scan" && hasTerrainMetrics && (
        <div>
          <h2 className="text-sm font-semibold font-heading mb-3">Terrängdata</h2>
          <TerrainProfileVisual
            minHeight={scan.min_height}
            maxHeight={scan.max_height}
            heightRange={scan.height_range}
            surfaceArea={scan.surface_area}
            averageSlope={scan.average_slope}
          />
        </div>
      )}

      {/* Extra metrics from site_scan_metrics */}
      {extraMetrics.length > 0 && (
        <DataSectionCard title="Övriga metrics" description={`${extraMetrics.length} ytterligare mätvärden`}>
          <div className="divide-y divide-border">
            {extraMetrics.map((m) => (
              <div key={m.id} className="flex justify-between items-center py-2">
                <span className="text-sm">{m.metric_label ?? m.metric_key}</span>
                <span className="text-sm font-mono font-medium">
                  {m.metric_value != null ? m.metric_value.toFixed(2) : "—"}{m.metric_unit ? ` ${m.metric_unit}` : ""}
                </span>
              </div>
            ))}
          </div>
        </DataSectionCard>
      )}

      {/* Assets + Processing side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Assets */}
        <DataSectionCard
          title="Assets"
          description={`${scan.assets.length} fil${scan.assets.length !== 1 ? "er" : ""}`}
        >
          {scan.assets.length === 0 ? (
            <EmptyState icon={Box} title="Inga assets" description="Inga filer registrerade för denna scan." />
          ) : (
            <div className="divide-y divide-border">
              {scan.assets.map((asset) => {
                const Icon = getAssetTypeIcon(asset.asset_type);
                return (
                  <div key={asset.id} className="flex items-center gap-3 py-2.5">
                    <div className="h-8 w-8 rounded bg-muted/50 flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{asset.file_name}</p>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
                        <span className="uppercase">{asset.asset_type}</span>
                        <span>·</span>
                        <span>{formatFileSize(asset.file_size)}</span>
                        {asset.mime_type && (
                          <>
                            <span>·</span>
                            <span>{asset.mime_type}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DataSectionCard>

        {/* Processing history */}
        <DataSectionCard
          title="Processing"
          description={`${scan.processing_jobs.length} jobb`}
        >
          {scan.processing_jobs.length === 0 ? (
            <EmptyState icon={Cpu} title="Inga jobb" description="Ingen bearbetningshistorik." />
          ) : (
            <div className="divide-y divide-border">
              {scan.processing_jobs.map((job) => (
                <div key={job.id} className="py-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium capitalize">{job.job_type.replace(/_/g, " ")}</span>
                    <StatusBadge status={job.status} />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground font-mono">
                    <span>Start: {fmt(job.started_at)}</span>
                    <span>Slut: {fmt(job.completed_at)}</span>
                  </div>
                  {job.error_message && (
                    <div className="flex items-start gap-1.5 text-xs text-destructive bg-destructive/5 rounded px-2 py-1.5 mt-1">
                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                      <span>{job.error_message}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </DataSectionCard>
      </div>

      {/* Sync Status Panel */}
      {hasSyncTargets && (
        <SyncStatusPanel
          targets={scan.sync_targets}
          onRetry={handleRetrySync}
          retryingTargetId={retryingTarget}
        />
      )}

      {/* Notes / description */}
      {(scan.description || scan.notes) && (
        <DataSectionCard title="Anteckningar">
          {scan.description && (
            <div className="mb-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Beskrivning</p>
              <p className="text-sm whitespace-pre-wrap">{scan.description}</p>
            </div>
          )}
          {scan.notes && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Noteringar</p>
              <p className="text-sm whitespace-pre-wrap">{scan.notes}</p>
            </div>
          )}
        </DataSectionCard>
      )}

      {/* Annotations */}
      {scan.annotations.length > 0 && (
        <DataSectionCard title="Annotations" description={`${scan.annotations.length} st`}>
          <div className="divide-y divide-border">
            {scan.annotations.map((a) => (
              <div key={a.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium">{a.label ?? a.annotation_type}</p>
                  <p className="text-[11px] text-muted-foreground font-mono capitalize">{a.annotation_type}</p>
                </div>
                <span className="text-xs text-muted-foreground font-mono">{fmt(a.created_at)}</span>
              </div>
            ))}
          </div>
        </DataSectionCard>
      )}

      {/* External links */}
      <ExternalLinksSection links={scan.links} syncTargets={[]} showAddButton />
    </div>
  );
};

export default ScanDetail;
