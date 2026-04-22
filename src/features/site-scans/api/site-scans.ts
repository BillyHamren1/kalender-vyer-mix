import { supabase as _supabase } from "@/integrations/supabase/client";

// NOTE: site_scans tables don't yet exist in the host project's generated
// Supabase types. Until the migration is run, we cast the client to `any`
// so this module typechecks. Replace with typed client once tables exist.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase: any = _supabase;

const isEdgeFnError = (d: unknown): d is { error: string } =>
  !!d && typeof d === "object" && "error" in (d as Record<string, unknown>);

type SiteScanStatus = string;

// =============================================
// Row types (loose — see note above)
// =============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SiteScanRow = any;
export type SiteScanAssetRow = SiteScanRow;
export type SiteScanMetricRow = SiteScanRow;
export type SiteScanAnnotationRow = SiteScanRow;
export type SiteScanLinkRow = SiteScanRow;
export type SiteScanProcessingJobRow = SiteScanRow;
export type SiteScanSyncTargetRow = SiteScanRow;

// =============================================
// Query params / result types
// =============================================

export interface ListScansParams {
  search?: string;
  status?: SiteScanStatus | SiteScanStatus[];
  scan_type?: string;
  sort_by?: "created_at" | "updated_at" | "uploaded_at" | "title";
  sort_order?: "asc" | "desc";
  page?: number;
  page_size?: number;
}

export interface ListScansResult {
  data: SiteScanRow[];
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface SiteScanDetail extends SiteScanRow {
  metrics: SiteScanMetricRow[];
  assets: SiteScanAssetRow[];
  processing_jobs: SiteScanProcessingJobRow[];
  annotations: SiteScanAnnotationRow[];
  links: SiteScanLinkRow[];
  sync_targets: SiteScanSyncTargetRow[];
}

// =============================================
// READS — direct Supabase queries (safe, RLS-protected)
// =============================================

/** Paginated, filterable list of scans */
export async function listSiteScans(params: ListScansParams = {}): Promise<ListScansResult> {
  const {
    search,
    status,
    scan_type,
    sort_by = "created_at",
    sort_order = "desc",
    page = 1,
    page_size = 25,
  } = params;

  const from = (page - 1) * page_size;
  const to = from + page_size - 1;

  let query = supabase
    .from("site_scans")
    .select("*", { count: "exact" });

  if (search && search.trim().length > 0) {
    const term = `%${search.trim()}%`;
    query = query.or(`title.ilike.${term},description.ilike.${term}`);
  }

  if (status) {
    if (Array.isArray(status)) {
      query = query.in("status", status);
    } else {
      query = query.eq("status", status);
    }
  }

  if (scan_type) {
    query = query.eq("scan_type", scan_type);
  }

  query = query
    .order(sort_by, { ascending: sort_order === "asc" })
    .range(from, to);

  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to list scans: ${error.message}`);

  const total = count ?? 0;
  return {
    data: data ?? [],
    count: total,
    page,
    page_size,
    total_pages: Math.ceil(total / page_size),
  };
}

/** Full scan detail with all relations */
export async function getSiteScan(id: string): Promise<SiteScanDetail> {
  const [scanRes, metricsRes, assetsRes, jobsRes, annotationsRes, linksRes, syncRes] = await Promise.all([
    supabase.from("site_scans").select("*").eq("id", id).maybeSingle(),
    supabase.from("site_scan_metrics").select("*").eq("site_scan_id", id).order("metric_key"),
    supabase.from("site_scan_assets").select("*").eq("site_scan_id", id).order("created_at"),
    supabase.from("site_scan_processing_jobs").select("*").eq("site_scan_id", id).order("created_at", { ascending: false }),
    supabase.from("site_scan_annotations").select("*").eq("site_scan_id", id).order("created_at"),
    supabase.from("site_scan_links").select("*").eq("site_scan_id", id).order("created_at"),
    supabase.from("site_scan_sync_targets").select("*").eq("site_scan_id", id).order("created_at"),
  ]);

  if (scanRes.error || !scanRes.data) {
    throw new Error(scanRes.error?.message ?? "Scan not found");
  }

  return {
    ...scanRes.data,
    metrics: metricsRes.data ?? [],
    assets: assetsRes.data ?? [],
    processing_jobs: jobsRes.data ?? [],
    annotations: annotationsRes.data ?? [],
    links: linksRes.data ?? [],
    sync_targets: syncRes.data ?? [],
  };
}

/** Assets for a scan */
export async function getSiteScanAssets(siteId: string): Promise<SiteScanAssetRow[]> {
  const { data, error } = await supabase
    .from("site_scan_assets")
    .select("*")
    .eq("site_scan_id", siteId)
    .order("asset_type")
    .order("created_at");

  if (error) throw new Error(`Failed to load assets: ${error.message}`);
  return data ?? [];
}

/** Processing job history for a scan */
export async function getSiteScanProcessingHistory(siteId: string): Promise<SiteScanProcessingJobRow[]> {
  const { data, error } = await supabase
    .from("site_scan_processing_jobs")
    .select("*")
    .eq("site_scan_id", siteId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load processing history: ${error.message}`);
  return data ?? [];
}

// =============================================
// MUTATIONS — via Edge Functions (server-validated)
// =============================================

/** Generic edge function invoker with typed response */
async function invokeFunction<T = Record<string, unknown>>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error(`Edge function "${name}" failed: ${error.message}`);
  if (data?.ok === false) throw new Error(isEdgeFnError(data) ? data.error : "Unknown error");
  return data as T;
}

// -- Sync --

export interface SyncResult {
  ok: boolean;
  synced: number;
  failed: number;
  results: Array<{ sync_target_id: string; sync_target: string; success: boolean; message: string }>;
}

/** Trigger outbound sync for a scan */
export function triggerScanSync(siteId: string, syncTargetId?: string): Promise<SyncResult> {
  return invokeFunction<SyncResult>("sync-site-scan", {
    site_scan_id: siteId,
    ...(syncTargetId ? { sync_target_id: syncTargetId } : {}),
  });
}

// -- Manage (archive, reprocess, update metadata) --

export interface ManageScanResult {
  ok: boolean;
  site_scan_id: string;
  action: string;
  message: string;
  previous_status?: string;
  new_status?: string;
  updated_fields?: string[];
}

/** Archive a scan */
export function archiveScan(siteId: string): Promise<ManageScanResult> {
  return invokeFunction<ManageScanResult>("manage-site-scan", {
    site_scan_id: siteId,
    action: "archive",
  });
}

/** Reprocess a scan (resets to uploaded, triggers processing) */
export function reprocessScan(siteId: string): Promise<ManageScanResult> {
  return invokeFunction<ManageScanResult>("manage-site-scan", {
    site_scan_id: siteId,
    action: "reprocess",
  });
}

/** Update scan metadata (title, description, notes, scan_type) */
export function updateScanMetadata(
  siteId: string,
  fields: Partial<{ title: string; description: string | null; notes: string | null; scan_type: string | null }>,
): Promise<ManageScanResult> {
  return invokeFunction<ManageScanResult>("manage-site-scan", {
    site_scan_id: siteId,
    action: "update_metadata",
    fields,
  });
}

// -- Process (trigger processing for an uploaded scan) --

export interface ProcessScanResult {
  ok: boolean;
  site_scan_id: string;
  final_status: string;
  message: string;
}

/** Trigger processing for an uploaded scan */
export function processScan(siteId: string, processingJobId?: string): Promise<ProcessScanResult> {
  return invokeFunction<ProcessScanResult>("process-site-scan", {
    site_scan_id: siteId,
    ...(processingJobId ? { processing_job_id: processingJobId } : {}),
  });
}
