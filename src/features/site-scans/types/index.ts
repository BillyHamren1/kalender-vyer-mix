// SiteScan types — loose strings until DB tables exist in host project.

export type SiteScanStatus = string;
export type SiteScanSessionStatus = string;
export type SiteScanJobType = string;
export type SiteScanAssetType = string;
export type SiteScanAnnotationType = string;
export type SiteScanSyncStatus = string;

export interface ApiEndpoint {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  description: string;
  authenticated: boolean;
}
