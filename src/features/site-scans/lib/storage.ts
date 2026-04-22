// =============================================
// SiteScan Storage Utilities
// Centralized storage path generation, validation,
// file type helpers, and asset management.
// =============================================

import { supabase } from "@/integrations/supabase/client";
import type { SiteScanAssetType } from "@/features/site-scans/types";
import {
  FileText,
  Box,
  Image,
  Mountain,
  FileJson,
  Layers,
  File,
  type LucideIcon,
} from "lucide-react";

// =============================================
// Constants
// =============================================

export const STORAGE_BUCKETS = {
  RAW: "site-scan-raw",
  PROCESSED: "site-scan-processed",
  PREVIEW: "site-scan-preview",
} as const;

export type StorageBucket = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];

/** Extended asset category for storage routing */
export type StorageAssetCategory =
  | "raw_session_json"
  | "point_cloud"
  | "mesh"
  | "preview_image"
  | "heightmap"
  | "metadata_json";

// =============================================
// Bucket routing
// =============================================

const CATEGORY_BUCKET_MAP: Record<StorageAssetCategory, StorageBucket> = {
  raw_session_json: STORAGE_BUCKETS.RAW,
  point_cloud: STORAGE_BUCKETS.PROCESSED,
  mesh: STORAGE_BUCKETS.PROCESSED,
  preview_image: STORAGE_BUCKETS.PREVIEW,
  heightmap: STORAGE_BUCKETS.PROCESSED,
  metadata_json: STORAGE_BUCKETS.RAW,
};

const CATEGORY_SUBFOLDER_MAP: Record<StorageAssetCategory, string> = {
  raw_session_json: "raw",
  point_cloud: "pointcloud",
  mesh: "mesh",
  preview_image: "preview",
  heightmap: "heightmap",
  metadata_json: "metadata",
};

/** Map storage category → database asset_type enum */
const CATEGORY_TO_DB_TYPE: Record<StorageAssetCategory, SiteScanAssetType> = {
  raw_session_json: "raw_payload",
  point_cloud: "pointcloud",
  mesh: "mesh",
  preview_image: "preview_image",
  heightmap: "heightmap",
  metadata_json: "other",
};

// Valid categories set for validation
const VALID_CATEGORIES = new Set<string>(Object.keys(CATEGORY_BUCKET_MAP));

// =============================================
// Path generation
// =============================================

/**
 * Generate a deterministic storage path.
 * Format: `{scanId}/{category}/{fileName}`
 */
export function generateStoragePath(
  scanId: string,
  category: StorageAssetCategory,
  fileName: string
): string {
  const subfolder = CATEGORY_SUBFOLDER_MAP[category];
  // Sanitize filename: lowercase, replace spaces
  const safeName = fileName.trim().toLowerCase().replace(/\s+/g, "_");
  return `${scanId}/${subfolder}/${safeName}`;
}

/**
 * Get the correct bucket for a given asset category.
 */
export function getBucketForCategory(category: StorageAssetCategory): StorageBucket {
  return CATEGORY_BUCKET_MAP[category];
}

/**
 * Get the database asset_type for a storage category.
 */
export function getDbAssetType(category: StorageAssetCategory): SiteScanAssetType {
  return CATEGORY_TO_DB_TYPE[category];
}

// =============================================
// Validation
// =============================================

/**
 * Check if a string is a valid StorageAssetCategory.
 */
export function isValidAssetCategory(value: string): value is StorageAssetCategory {
  return VALID_CATEGORIES.has(value);
}

/** Allowed MIME types per category */
const ALLOWED_MIMES: Record<StorageAssetCategory, string[]> = {
  raw_session_json: ["application/json", "application/octet-stream", "application/zip"],
  point_cloud: [
    "application/octet-stream",
    "application/x-ply",
    "application/x-las",
    "application/x-laz",
  ],
  mesh: [
    "application/octet-stream",
    "application/x-ply",
    "model/obj",
    "model/gltf-binary",
    "model/gltf+json",
    "model/usdz",
  ],
  preview_image: ["image/jpeg", "image/png", "image/webp"],
  heightmap: ["image/png", "image/tiff", "application/octet-stream"],
  metadata_json: ["application/json"],
};

/**
 * Validate that a MIME type is allowed for a given category.
 */
export function isAllowedMimeType(
  category: StorageAssetCategory,
  mimeType: string
): boolean {
  const allowed = ALLOWED_MIMES[category];
  return allowed.includes(mimeType);
}

// =============================================
// File-type icon mapping
// =============================================

const FILE_ICON_MAP: Record<StorageAssetCategory, LucideIcon> = {
  raw_session_json: FileJson,
  point_cloud: Layers,
  mesh: Box,
  preview_image: Image,
  heightmap: Mountain,
  metadata_json: FileText,
};

/**
 * Get the appropriate Lucide icon for an asset category.
 */
export function getAssetIcon(category: StorageAssetCategory): LucideIcon {
  return FILE_ICON_MAP[category] ?? File;
}

/** Icon by database asset_type */
const DB_TYPE_ICON_MAP: Record<string, LucideIcon> = {
  pointcloud: Layers,
  mesh: Box,
  texture: Image,
  heightmap: Mountain,
  thumbnail: Image,
  preview_image: Image,
  raw_payload: FileJson,
  report: FileText,
  other: File,
};

export function getAssetTypeIcon(assetType: string): LucideIcon {
  return DB_TYPE_ICON_MAP[assetType] ?? File;
}

// =============================================
// File-size formatting
// =============================================

const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/**
 * Format bytes to a human-readable string.
 */
export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || bytes < 0) return "—";
  if (bytes === 0) return "0 B";

  const exp = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    SIZE_UNITS.length - 1
  );
  const value = bytes / Math.pow(1024, exp);
  const decimals = exp === 0 ? 0 : value < 10 ? 2 : 1;

  return `${value.toFixed(decimals)} ${SIZE_UNITS[exp]}`;
}

// =============================================
// Asset existence checks
// =============================================

/**
 * Check if a file exists in storage at a given path.
 * Returns true if it exists, false otherwise.
 */
export async function assetExistsInStorage(
  bucket: StorageBucket,
  path: string
): Promise<boolean> {
  // List files in the directory to check existence
  const parts = path.split("/");
  const fileName = parts.pop()!;
  const folder = parts.join("/");

  const { data, error } = await supabase.storage
    .from(bucket)
    .list(folder, { limit: 1, search: fileName });

  if (error) return false;
  return (data ?? []).some((f) => f.name === fileName);
}

/**
 * Check which expected assets exist for a scan.
 * Returns a map of category → exists boolean.
 */
export async function checkScanAssets(
  scanId: string,
  categories: StorageAssetCategory[]
): Promise<Record<StorageAssetCategory, boolean>> {
  const results = {} as Record<StorageAssetCategory, boolean>;

  const checks = categories.map(async (cat) => {
    const bucket = getBucketForCategory(cat);
    const folder = `${scanId}/${CATEGORY_SUBFOLDER_MAP[cat]}`;

    const { data, error } = await supabase.storage
      .from(bucket)
      .list(folder, { limit: 1 });

    results[cat] = !error && (data ?? []).length > 0;
  });

  await Promise.all(checks);
  return results;
}

// =============================================
// Signed URL generation (secure download)
// =============================================

/**
 * Generate a signed URL for secure file access.
 * Default expiry: 60 seconds.
 */
export async function getSignedUrl(
  bucket: StorageBucket,
  path: string,
  expiresInSeconds = 60
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);

  if (error) {
    console.error("[SiteScan Storage] Signed URL error:", error.message);
    return null;
  }
  return data.signedUrl;
}

/**
 * Generate a signed URL for a preview image.
 */
export async function getPreviewUrl(
  scanId: string,
  fileName: string,
  expiresInSeconds = 300
): Promise<string | null> {
  const path = generateStoragePath(scanId, "preview_image", fileName);
  return getSignedUrl(STORAGE_BUCKETS.PREVIEW, path, expiresInSeconds);
}
