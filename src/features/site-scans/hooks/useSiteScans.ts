import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  listSiteScans,
  getSiteScan,
  getSiteScanAssets,
  getSiteScanProcessingHistory,
  triggerScanSync,
  archiveScan,
  reprocessScan,
  updateScanMetadata,
  processScan,
  type ListScansParams,
  type SyncResult,
  type ManageScanResult,
  type ProcessScanResult,
} from "@/features/site-scans/api/site-scans";

// =============================================
// Query keys
// =============================================

export const siteScansKeys = {
  all: ["site-scans"] as const,
  lists: () => [...siteScansKeys.all, "list"] as const,
  list: (params: ListScansParams) => [...siteScansKeys.lists(), params] as const,
  details: () => [...siteScansKeys.all, "detail"] as const,
  detail: (id: string) => [...siteScansKeys.details(), id] as const,
  assets: (id: string) => [...siteScansKeys.all, "assets", id] as const,
  processingHistory: (id: string) => [...siteScansKeys.all, "processing", id] as const,
};

// =============================================
// Read hooks
// =============================================

/** Paginated, filterable list of scans */
export function useSiteScansList(params: ListScansParams = {}) {
  return useQuery({
    queryKey: siteScansKeys.list(params),
    queryFn: () => listSiteScans(params),
    placeholderData: keepPreviousData,
  });
}

/** Full scan detail with metrics, assets, jobs, annotations, links */
export function useSiteScanDetail(id: string | undefined) {
  return useQuery({
    queryKey: siteScansKeys.detail(id!),
    queryFn: () => getSiteScan(id!),
    enabled: !!id,
  });
}

/** Assets for a scan */
export function useSiteScanAssets(id: string | undefined) {
  return useQuery({
    queryKey: siteScansKeys.assets(id!),
    queryFn: () => getSiteScanAssets(id!),
    enabled: !!id,
  });
}

/** Processing job history for a scan */
export function useSiteScanProcessingHistory(id: string | undefined) {
  return useQuery({
    queryKey: siteScansKeys.processingHistory(id!),
    queryFn: () => getSiteScanProcessingHistory(id!),
    enabled: !!id,
  });
}

// =============================================
// Mutation hooks (all go via Edge Functions)
// =============================================

/** Invalidate scan detail + lists after a mutation */
function useInvalidateAfterMutation() {
  const qc = useQueryClient();
  return (siteId: string) => {
    qc.invalidateQueries({ queryKey: siteScansKeys.detail(siteId) });
    qc.invalidateQueries({ queryKey: siteScansKeys.lists() });
  };
}

/** Trigger sync for a scan */
export function useTriggerSync() {
  const invalidate = useInvalidateAfterMutation();
  return useMutation<SyncResult, Error, { siteId: string; syncTargetId?: string }>({
    mutationFn: ({ siteId, syncTargetId }) => triggerScanSync(siteId, syncTargetId),
    onSuccess: (_data, { siteId }) => invalidate(siteId),
  });
}

/** Archive a scan */
export function useArchiveScan() {
  const invalidate = useInvalidateAfterMutation();
  return useMutation<ManageScanResult, Error, string>({
    mutationFn: (siteId) => archiveScan(siteId),
    onSuccess: (_data, siteId) => invalidate(siteId),
  });
}

/** Reprocess a scan */
export function useReprocessScan() {
  const invalidate = useInvalidateAfterMutation();
  return useMutation<ManageScanResult, Error, string>({
    mutationFn: (siteId) => reprocessScan(siteId),
    onSuccess: (_data, siteId) => invalidate(siteId),
  });
}

/** Update scan metadata */
export function useUpdateScanMetadata() {
  const invalidate = useInvalidateAfterMutation();
  return useMutation<
    ManageScanResult,
    Error,
    { siteId: string; fields: Partial<{ title: string; description: string | null; notes: string | null; scan_type: string | null }> }
  >({
    mutationFn: ({ siteId, fields }) => updateScanMetadata(siteId, fields),
    onSuccess: (_data, { siteId }) => invalidate(siteId),
  });
}

/** Trigger processing */
export function useProcessScan() {
  const invalidate = useInvalidateAfterMutation();
  return useMutation<ProcessScanResult, Error, { siteId: string; processingJobId?: string }>({
    mutationFn: ({ siteId, processingJobId }) => processScan(siteId, processingJobId),
    onSuccess: (_data, { siteId }) => invalidate(siteId),
  });
}
