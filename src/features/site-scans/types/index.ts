// SiteScan Database Types
// Re-exports from auto-generated types for convenience.
// NOTE: Do NOT duplicate types that exist in @/integrations/supabase/types.
// Use Tables<"table_name"> for row types directly.

import type { Database } from "@/integrations/supabase/types";

// =============================================
// Enum re-exports (convenient short names)
// =============================================

export type SiteScanStatus = Database["public"]["Enums"]["site_scan_status"];
export type SiteScanSessionStatus = Database["public"]["Enums"]["site_scan_session_status"];
export type SiteScanJobType = Database["public"]["Enums"]["site_scan_job_type"];
export type SiteScanAssetType = Database["public"]["Enums"]["site_scan_asset_type"];
export type SiteScanAnnotationType = Database["public"]["Enums"]["site_scan_annotation_type"];
export type SiteScanSyncStatus = Database["public"]["Enums"]["site_scan_sync_status"];

// =============================================
// API helpers (non-database types)
// =============================================

export interface ApiEndpoint {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  description: string;
  authenticated: boolean;
}
