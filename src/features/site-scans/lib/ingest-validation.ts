/**
 * Shared ingest-flow validation rules.
 * Mirrors the logic in the create-site-scan-session, register-site-scan-asset,
 * and finalize-site-scan-upload edge functions.
 * Kept in src/lib so it can be unit-tested via vitest.
 */

// =============================================
// Constants
// =============================================

export const ALLOWED_ASSET_TYPES = [
  "raw_session_json",
  "point_cloud",
  "mesh",
  "preview_image",
  "heightmap",
  "metadata_json",
] as const;
export type AssetCategory = (typeof ALLOWED_ASSET_TYPES)[number];

export const ALLOWED_BUCKETS = [
  "site-scan-raw",
  "site-scan-processed",
  "site-scan-preview",
] as const;

export const CATEGORY_EXPECTED_BUCKET: Record<AssetCategory, string> = {
  raw_session_json: "site-scan-raw",
  point_cloud: "site-scan-processed",
  mesh: "site-scan-processed",
  preview_image: "site-scan-preview",
  heightmap: "site-scan-processed",
  metadata_json: "site-scan-raw",
};

export const CATEGORY_ALLOWED_MIMES: Record<AssetCategory, string[]> = {
  raw_session_json: ["application/json", "application/octet-stream", "application/zip"],
  point_cloud: ["application/octet-stream", "application/x-ply", "application/x-las", "application/x-laz"],
  mesh: ["application/octet-stream", "application/x-ply", "model/obj", "model/gltf-binary", "model/gltf+json", "model/usdz"],
  preview_image: ["image/jpeg", "image/png", "image/webp"],
  heightmap: ["image/png", "image/tiff", "application/octet-stream"],
  metadata_json: ["application/json"],
};

export const CATEGORY_TO_DB: Record<AssetCategory, string> = {
  raw_session_json: "raw_payload",
  point_cloud: "pointcloud",
  mesh: "mesh",
  preview_image: "preview_image",
  heightmap: "heightmap",
  metadata_json: "other",
};

/** Scan statuses that allow new asset registration. */
export const ASSET_REGISTRATION_STATUSES = ["draft", "uploading"];

/** Scan statuses that allow finalization. */
export const FINALIZABLE_STATUSES = ["draft", "uploading"];

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_FILE_SIZE = 524_288_000; // 500 MB

// =============================================
// Session creation validation
// =============================================

export interface CreateSessionInput {
  title?: unknown;
  description?: unknown;
  scan_type?: unknown;
  device_platform?: unknown;
  device_model?: unknown;
  app_version?: unknown;
  metadata?: unknown;
}

export function validateCreateSession(body: unknown): string | null {
  if (!body || typeof body !== "object") {
    return "Request body must be a JSON object";
  }
  const r = body as CreateSessionInput;

  if (!r.title || typeof r.title !== "string" || (r.title as string).trim().length === 0) {
    return "Field 'title' is required and must be a non-empty string";
  }
  if ((r.title as string).length > 255) {
    return "Field 'title' must be 255 characters or less";
  }

  const optionalStrings = ["description", "scan_type", "device_platform", "device_model", "app_version"] as const;
  for (const field of optionalStrings) {
    const val = (r as Record<string, unknown>)[field];
    if (val !== undefined && val !== null && typeof val !== "string") {
      return `Field '${field}' must be a string`;
    }
  }

  if (typeof r.description === "string" && r.description.length > 2000) {
    return "Field 'description' must be 2000 characters or less";
  }

  if (r.metadata !== undefined && r.metadata !== null) {
    if (typeof r.metadata !== "object" || Array.isArray(r.metadata)) {
      return "Field 'metadata' must be a JSON object";
    }
  }

  return null;
}

// =============================================
// Asset registration validation
// =============================================

export interface RegisterAssetInput {
  session_token?: unknown;
  site_scan_id?: unknown;
  asset_type?: unknown;
  storage_bucket?: unknown;
  storage_path?: unknown;
  file_name?: unknown;
  mime_type?: unknown;
  file_size?: unknown;
  checksum?: unknown;
}

export function validateRegisterAsset(body: unknown): string | null {
  if (!body || typeof body !== "object") {
    return "Request body must be a JSON object";
  }
  const r = body as Record<string, unknown>;

  const requiredStrings: Array<[string, number]> = [
    ["session_token", 255],
    ["site_scan_id", 36],
    ["asset_type", 50],
    ["storage_bucket", 100],
    ["storage_path", 1000],
    ["file_name", 500],
    ["mime_type", 100],
    ["checksum", 256],
  ];
  for (const [field, max] of requiredStrings) {
    const val = r[field];
    if (!val || typeof val !== "string" || val.trim().length === 0) {
      return `Field '${field}' is required and must be a non-empty string`;
    }
    if ((val as string).length > max) {
      return `Field '${field}' must be ${max} characters or less`;
    }
  }

  if (!UUID_RE.test(r.site_scan_id as string)) {
    return "Field 'site_scan_id' must be a valid UUID";
  }

  if (!ALLOWED_ASSET_TYPES.includes(r.asset_type as AssetCategory)) {
    return `Field 'asset_type' must be one of: ${ALLOWED_ASSET_TYPES.join(", ")}`;
  }
  const assetType = r.asset_type as AssetCategory;

  if (!ALLOWED_BUCKETS.includes(r.storage_bucket as (typeof ALLOWED_BUCKETS)[number])) {
    return `Field 'storage_bucket' must be one of: ${ALLOWED_BUCKETS.join(", ")}`;
  }

  const expectedBucket = CATEGORY_EXPECTED_BUCKET[assetType];
  if (r.storage_bucket !== expectedBucket) {
    return `Asset type '${assetType}' must use bucket '${expectedBucket}', got '${r.storage_bucket}'`;
  }

  const allowedMimes = CATEGORY_ALLOWED_MIMES[assetType];
  if (!allowedMimes.includes(r.mime_type as string)) {
    return `MIME type '${r.mime_type}' is not allowed for asset type '${assetType}'. Allowed: ${allowedMimes.join(", ")}`;
  }

  const storagePath = (r.storage_path as string).trim();
  if (storagePath.includes("..") || storagePath.startsWith("/")) {
    return "Field 'storage_path' must not contain '..' or start with '/'";
  }
  const pathParts = storagePath.split("/");
  if (pathParts.length < 3) {
    return "Field 'storage_path' must follow pattern: {scan_id}/{category}/{file_name}";
  }
  if (pathParts[0] !== (r.site_scan_id as string).trim()) {
    return "storage_path must start with the site_scan_id";
  }

  if (typeof r.file_size !== "number" || !Number.isInteger(r.file_size) || r.file_size <= 0) {
    return "Field 'file_size' must be a positive integer (bytes)";
  }
  if (r.file_size > MAX_FILE_SIZE) {
    return `Field 'file_size' exceeds maximum of 500MB`;
  }

  return null;
}

// =============================================
// Finalize upload validation
// =============================================

export function validateFinalizeUpload(body: unknown): string | null {
  if (!body || typeof body !== "object") {
    return "Request body must be a JSON object";
  }
  const r = body as Record<string, unknown>;

  if (!r.session_token || typeof r.session_token !== "string" || r.session_token.trim().length === 0) {
    return "Field 'session_token' is required";
  }
  if (!r.site_scan_id || typeof r.site_scan_id !== "string" || !UUID_RE.test(r.site_scan_id)) {
    return "Field 'site_scan_id' must be a valid UUID";
  }

  return null;
}

// =============================================
// Session–Scan relation checks (runtime guards)
// =============================================

export interface SessionRecord {
  status: string;
  site_scan_id: string | null;
  user_id: string | null;
}

export interface ScanRecord {
  status: string;
  user_id: string | null;
}

/**
 * Validates that a session is valid for asset registration or finalization.
 * Returns null if valid, or an error string.
 */
export function validateSessionScanRelation(
  session: SessionRecord,
  claimedScanId: string,
  callerId: string,
  operation: "register" | "finalize"
): string | null {
  if (session.user_id !== callerId) {
    return "You do not own this session";
  }
  if (session.status !== "active") {
    return operation === "register"
      ? `Session is not active (status: ${session.status}). Cannot register assets.`
      : `Session cannot be finalized (status: ${session.status}). Only active sessions can be finalized.`;
  }
  if (session.site_scan_id !== claimedScanId) {
    return `Session belongs to scan '${session.site_scan_id}', not '${claimedScanId}'`;
  }
  return null;
}

/**
 * Validates that a scan is in an acceptable state for the given operation.
 */
export function validateScanForOperation(
  scan: ScanRecord,
  callerId: string,
  operation: "register" | "finalize"
): string | null {
  if (scan.user_id !== callerId) {
    return "You do not own this scan";
  }
  const allowed = operation === "register" ? ASSET_REGISTRATION_STATUSES : FINALIZABLE_STATUSES;
  if (!allowed.includes(scan.status)) {
    return operation === "register"
      ? `Cannot register assets for a scan with status '${scan.status}'. Allowed: ${allowed.join(", ")}`
      : `Scan cannot be finalized (status: ${scan.status}). Allowed statuses: ${allowed.join(", ")}`;
  }
  return null;
}
