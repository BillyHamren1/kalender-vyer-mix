import { supabase } from "@/integrations/supabase/client";

export interface SyncState {
  id: string;
  sync_type: string;
  last_sync_timestamp: string | null;
  last_sync_mode: string | null;
  last_sync_status: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export type SyncMode = 'full' | 'incremental';
export type SyncStatus = 'success' | 'failed' | 'in_progress' | 'pending';

/**
 * Get sync state for a specific sync type
 */
export const getSyncState = async (syncType: string): Promise<SyncState | null> => {
  const { data, error } = await supabase
    .from('sync_state')
    .select('*')
    .eq('sync_type', syncType)
    .maybeSingle();
    
  if (error) {
    console.error(`Error fetching sync state for ${syncType}:`, error);
    throw error;
  }
  
  if (!data) return null;
  
  // Transform the metadata from Json to Record<string, any>
  return {
    ...data,
    metadata: typeof data.metadata === 'string' ? JSON.parse(data.metadata) : (data.metadata as Record<string, any>) || {}
  };
};

/**
 * Update sync state with new information
 */
export const updateSyncState = async (
  syncType: string, 
  updates: {
    last_sync_timestamp?: string;
    last_sync_mode?: SyncMode;
    last_sync_status?: SyncStatus;
    metadata?: Record<string, any>;
  }
): Promise<SyncState> => {
  const { data, error } = await supabase
    .from('sync_state')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('sync_type', syncType)
    .select()
    .single();
    
  if (error) {
    console.error(`Error updating sync state for ${syncType}:`, error);
    throw error;
  }
  
  // Transform the metadata from Json to Record<string, any>
  return {
    ...data,
    metadata: typeof data.metadata === 'string' ? JSON.parse(data.metadata) : (data.metadata as Record<string, any>) || {}
  };
};

/**
 * Initialize sync state for a new sync type
 */
export const initializeSyncState = async (
  syncType: string,
  initialMode: SyncMode = 'full',
  initialStatus: SyncStatus = 'pending'
): Promise<SyncState> => {
  const { data, error } = await supabase
    .from('sync_state')
    .insert({
      sync_type: syncType,
      last_sync_mode: initialMode,
      last_sync_status: initialStatus,
      metadata: {}
    })
    .select()
    .single();
    
  if (error) {
    console.error(`Error initializing sync state for ${syncType}:`, error);
    throw error;
  }
  
  // Transform the metadata from Json to Record<string, any>
  return {
    ...data,
    metadata: typeof data.metadata === 'string' ? JSON.parse(data.metadata) : (data.metadata as Record<string, any>) || {}
  };
};

/**
 * Determine if we should use incremental sync based on last sync time
 */
export const shouldUseIncrementalSync = (
  lastSyncTimestamp: string | null,
  incrementalThresholdHours: number = 24
): boolean => {
  if (!lastSyncTimestamp) {
    return false; // No previous sync, use full sync
  }
  
  const lastSync = new Date(lastSyncTimestamp);
  const now = new Date();
  const hoursSinceLastSync = (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60);
  
  return hoursSinceLastSync < incrementalThresholdHours;
};

/**
 * Get recommended sync mode based on current state
 */
export const getRecommendedSyncMode = async (syncType: string): Promise<SyncMode> => {
  try {
    const syncState = await getSyncState(syncType);
    
    if (!syncState) {
      // No sync state exists, recommend full sync
      return 'full';
    }
    
    // If last sync failed, recommend full sync
    if (syncState.last_sync_status === 'failed') {
      return 'full';
    }
    
    // If it's been more than 24 hours since last successful sync, recommend full sync
    if (syncState.last_sync_status === 'success' && 
        !shouldUseIncrementalSync(syncState.last_sync_timestamp)) {
      return 'full';
    }
    
    // Otherwise, incremental sync should be fine
    return 'incremental';
  } catch (error) {
    console.warn('Error determining sync mode, defaulting to full:', error);
    return 'full';
  }
};
