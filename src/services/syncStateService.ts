import { supabase } from "@/integrations/supabase/client";

/**
 * Per-organisation sync-cursor för externa importer.
 *
 * VIKTIGT: alla operationer måste filtrera på (organization_id, sync_type).
 * Den globala UNIQUE(sync_type)-nyckeln togs bort i migrationen
 * `sync_state_org_sync_type_key` och ersattes med UNIQUE(organization_id, sync_type).
 * Om `organizationId` saknas returnerar hjälparna null utan att röra DB — vi
 * får aldrig läsa eller skriva en annan organisations cursor.
 */

export interface SyncState {
  id: string;
  sync_type: string;
  organization_id: string;
  last_sync_timestamp: string | null;
  last_sync_mode: string | null;
  last_sync_status: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export type SyncMode = 'full' | 'incremental';
export type SyncStatus = 'success' | 'failed' | 'in_progress' | 'pending';

const normalizeMetadata = (meta: unknown): Record<string, any> => {
  if (!meta) return {};
  if (typeof meta === 'string') {
    try { return JSON.parse(meta) as Record<string, any>; } catch { return {}; }
  }
  return meta as Record<string, any>;
};

/**
 * Get sync state for (organizationId, syncType).
 */
export const getSyncState = async (
  syncType: string,
  organizationId: string | null | undefined,
): Promise<SyncState | null> => {
  if (!organizationId) {
    console.warn(`[syncState] getSyncState skipped for ${syncType}: missing organizationId`);
    return null;
  }
  try {
    const { data, error } = await supabase
      .from('sync_state')
      .select('*')
      .eq('sync_type', syncType)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (error) {
      console.warn(`[syncState] read failed for ${syncType}/${organizationId}:`, error.message);
      return null;
    }
    if (!data) return null;
    return { ...(data as any), metadata: normalizeMetadata((data as any).metadata) } as SyncState;
  } catch (error) {
    console.warn(`[syncState] read exception for ${syncType}/${organizationId}`, error);
    return null;
  }
};

/**
 * Update sync state for (organizationId, syncType).
 *
 * SERVER-AUTHORITATIVE: frontend får ALDRIG skriva `last_sync_timestamp`,
 * `last_sync_status` eller `last_sync_mode`. Alla tre är server-ägda och
 * flyttas atomiskt av `finalize_sync_batch`-RPC:n efter en helt lyckad batch.
 * Ett runtime-guard tvättar bort dessa fält om en gammal call-site skickar
 * in dem — endast `metadata` får skrivas härifrån (för UI-hint).
 */
export const updateSyncState = async (
  syncType: string,
  organizationId: string | null | undefined,
  updates: {
    metadata?: Record<string, any>;
  }
): Promise<SyncState | null> => {
  if (!organizationId) {
    console.warn(`[syncState] updateSyncState skipped for ${syncType}: missing organizationId`);
    return null;
  }
  const forbidden = ['last_sync_timestamp', 'last_sync_status', 'last_sync_mode'] as const;
  for (const key of forbidden) {
    if ((updates as any)[key] !== undefined) {
      console.warn(
        `[syncState] updateSyncState dropped ${key} from caller — server-owned only (${syncType}/${organizationId})`,
      );
      delete (updates as any)[key];
    }
  }
  const safeMetadata = updates?.metadata;
  if (!safeMetadata || Object.keys(safeMetadata).length === 0) {
    // Ingenting frontend får skriva → gör inte ens ett anrop mot DB.
    return null;
  }
  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('sync_state')
      .upsert({
        sync_type: syncType,
        organization_id: organizationId,
        metadata: safeMetadata,
        updated_at: nowIso,
      }, { onConflict: 'organization_id,sync_type' })
      .select()
      .maybeSingle();

    if (error) {
      console.warn(`[syncState] upsert failed for ${syncType}/${organizationId}:`, error.message);
      return null;
    }
    if (!data) return null;
    return { ...(data as any), metadata: normalizeMetadata((data as any).metadata) } as SyncState;
  } catch (error) {
    console.warn(`[syncState] upsert exception for ${syncType}/${organizationId}`, error);
    return null;
  }
};

/**
 * Deprecated: initialisering av sync_state sker uteslutande server-side
 * (`createBatch` skapar raden vid behov). Kvar som no-op för bakåtkompat.
 */
export const initializeSyncState = async (
  _syncType: string,
  _organizationId: string | null | undefined,
  _initialMode: SyncMode = 'full',
  _initialStatus: SyncStatus = 'pending'
): Promise<SyncState | null> => {
  return null;
};

/**
 * Determine if we should use incremental sync based on last sync time
 */
export const shouldUseIncrementalSync = (
  lastSyncTimestamp: string | null,
  incrementalThresholdHours: number = 24
): boolean => {
  if (!lastSyncTimestamp) return false;
  const lastSync = new Date(lastSyncTimestamp);
  const hoursSinceLastSync = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60);
  return hoursSinceLastSync < incrementalThresholdHours;
};

/**
 * Recommend a sync mode for the given (organizationId, syncType).
 */
export const getRecommendedSyncMode = async (
  syncType: string,
  organizationId: string | null | undefined,
): Promise<SyncMode> => {
  try {
    const syncState = await getSyncState(syncType, organizationId);
    if (!syncState) return 'full';
    if (syncState.last_sync_status === 'failed') return 'full';
    if (syncState.last_sync_status === 'success' &&
        !shouldUseIncrementalSync(syncState.last_sync_timestamp)) {
      return 'full';
    }
    return 'incremental';
  } catch (error) {
    console.warn('[syncState] getRecommendedSyncMode failed, defaulting to full:', error);
    return 'full';
  }
};
