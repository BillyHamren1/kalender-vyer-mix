import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { smartUpdateBookingCalendar } from "./bookingCalendarService";
import { cleanupDuplicateCalendarEvents } from "./duplicateCleanupService";
import { 
  getSyncState, 
  updateSyncState, 
  getRecommendedSyncMode, 
  initializeSyncState,
  type SyncMode 
} from "./syncStateService";

// Type for import results
export interface ImportResults {
  success: boolean;
  results?: {
    total: number;
    imported: number;
    failed: number;
    calendar_events_created: number;
    products_imported?: number;
    attachments_imported?: number;
    new_bookings?: string[];
    updated_bookings?: string[];
    status_changed_bookings?: string[];
    cancelled_bookings_skipped?: string[];
    duplicates_skipped?: string[];
    errors?: { booking_id: string; error: string }[];
    sync_mode?: SyncMode;
    sync_duration_ms?: number;
  };
  error?: string;
  details?: string;
  status?: number;
}

// Enhanced type for filter options with historical support
export interface ImportFilters {
  startDate?: string;
  endDate?: string;
  clientName?: string;
  syncMode?: SyncMode | 'historical';
  includeHistorical?: boolean;
  forceHistoricalImport?: boolean;
}

/**
 * Enhanced import bookings with historical support and duplicate cleanup
 */
export const importBookings = async (filters: ImportFilters = {}): Promise<ImportResults> => {
  const syncType = 'booking_import';
  const startTime = Date.now();
  let syncMode: SyncMode;
  
  try {
    // Clean up duplicates before starting import (silently for background operations)
    console.log('Cleaning up existing duplicates before import...');
    await cleanupDuplicateCalendarEvents(true);
    
    // Handle historical import mode
    const isHistoricalMode = filters.syncMode === 'historical' || filters.includeHistorical || filters.forceHistoricalImport;
    
    if (isHistoricalMode) {
      syncMode = 'full';
      console.log('Running in HISTORICAL import mode - will import all bookings regardless of date');
      toast.info('Starting historical import - this may take longer...', {
        duration: 5000,
      });
    } else {
      toast.info('Initializing booking synchronization...', {
        duration: 3000,
      });
    }
    
    // Get or determine sync mode
    if (filters.syncMode && filters.syncMode !== 'historical') {
      syncMode = filters.syncMode;
      console.log(`Using manually specified sync mode: ${syncMode}`);
    } else if (!isHistoricalMode) {
      syncMode = await getRecommendedSyncMode(syncType);
      console.log(`Using recommended sync mode: ${syncMode}`);
    }
    
    // Update sync state to "in_progress"
    try {
      await updateSyncState(syncType, {
        last_sync_status: 'in_progress',
        metadata: { 
          started_at: new Date().toISOString(),
          sync_mode: syncMode,
          filters,
          historical_mode: isHistoricalMode
        }
      });
    } catch (error) {
      console.log('Initializing sync state for first time');
      await initializeSyncState(syncType, syncMode, 'in_progress');
    }
    
    // Adjust filters for incremental sync (but not for historical mode)
    const enhancedFilters = { ...filters };
    if (syncMode === 'incremental' && !isHistoricalMode) {
      try {
        const syncState = await getSyncState(syncType);
        if (syncState?.last_sync_timestamp) {
          const lastSyncDate = new Date(syncState.last_sync_timestamp);
          lastSyncDate.setHours(lastSyncDate.getHours() - 1);
          enhancedFilters.startDate = lastSyncDate.toISOString().split('T')[0];
          console.log(`Incremental sync: fetching bookings updated since ${enhancedFilters.startDate}`);
        }
      } catch (error) {
        console.warn('Error setting up incremental sync, falling back to full sync:', error);
        syncMode = 'full';
      }
    }
    
    // For historical imports, remove any date restrictions
    if (isHistoricalMode) {
      delete enhancedFilters.startDate;
      delete enhancedFilters.endDate;
      enhancedFilters.forceHistoricalImport = true;
      console.log('Historical mode: removed all date restrictions');
    }
    
    toast.info(`Starting ${isHistoricalMode ? 'historical' : syncMode} synchronization...`, {
      duration: 2000,
    });
    
    // Call the Supabase Edge Function with improved duplicate handling
    const { data: resultData, error: functionError } = await supabase.functions.invoke(
      'import-bookings',
      {
        method: 'POST',
        body: { 
          ...enhancedFilters, 
          syncMode, 
          handleStatusChanges: true,
          preventDuplicateEvents: true,
          useTimestampFiltering: !isHistoricalMode,
          historicalMode: isHistoricalMode
        }
      }
    );

    const syncDurationMs = Date.now() - startTime;

    if (functionError) {
      console.error('Error calling import-bookings function:', functionError);
      
      await updateSyncState(syncType, {
        last_sync_status: 'failed',
        metadata: { 
          error: functionError.message,
          sync_mode: syncMode,
          duration_ms: syncDurationMs,
          historical_mode: isHistoricalMode
        }
      });
      
      return {
        success: false,
        error: `Import function error: ${functionError.message}`,
      };
    }

    if (resultData && resultData.error) {
      console.error('Error returned from import function:', resultData.error);
      
      const details = resultData.details || '';
      const status = resultData.status || 0;
      
      await updateSyncState(syncType, {
        last_sync_status: 'failed',
        metadata: { 
          error: resultData.error,
          details,
          status,
          sync_mode: syncMode,
          duration_ms: syncDurationMs,
          historical_mode: isHistoricalMode
        }
      });
      
      return {
        success: false,
        error: `Import error: ${resultData.error}`,
        details: details,
        status: status
      };
    }

    // Handle successful import
    const results = {
      ...resultData.results,
      sync_mode: syncMode,
      sync_duration_ms: syncDurationMs
    };
    
    // Update sync state to success - this saves the timestamp for next incremental sync
    await updateSyncState(syncType, {
      last_sync_timestamp: new Date().toISOString(),
      last_sync_status: 'success',
      last_sync_mode: syncMode,
      metadata: { 
        ...results,
        completed_at: new Date().toISOString(),
        historical_mode: isHistoricalMode
      }
    });
    
    // Show appropriate success message
    const newCount = results.new_bookings?.length || 0;
    const updatedCount = results.updated_bookings?.length || 0;
    const statusChangedCount = results.status_changed_bookings?.length || 0;
    const cancelledSkippedCount = results.cancelled_bookings_skipped?.length || 0;
    const duplicatesSkippedCount = results.duplicates_skipped?.length || 0;
    const eventsCreated = results.calendar_events_created || 0;
    
    if (newCount > 0 || updatedCount > 0 || statusChangedCount > 0) {
      const messages = [];
      if (newCount > 0) messages.push(`${newCount} new booking${newCount > 1 ? 's' : ''}`);
      if (updatedCount > 0) messages.push(`${updatedCount} updated`);
      if (statusChangedCount > 0) messages.push(`${statusChangedCount} status changed`);
      
      let description = `${messages.join(', ')} • ${(syncDurationMs / 1000).toFixed(1)}s`;
      if (eventsCreated > 0) {
        description += ` • ${eventsCreated} calendar events created`;
      }
      if (duplicatesSkippedCount > 0) {
        description += ` • ${duplicatesSkippedCount} duplicates skipped`;
      }
      if (cancelledSkippedCount > 0) {
        description += ` • ${cancelledSkippedCount} CANCELLED skipped`;
      }
      
      const syncTypeDisplay = isHistoricalMode ? 'Historical' : syncMode.charAt(0).toUpperCase() + syncMode.slice(1);
      toast.success(`${syncTypeDisplay} sync completed`, {
        description
      });
    } else {
      let description = `No changes found • ${(syncDurationMs / 1000).toFixed(1)}s`;
      if (duplicatesSkippedCount > 0) {
        description += ` • ${duplicatesSkippedCount} duplicates prevented`;
      }
      if (cancelledSkippedCount > 0) {
        description += ` • ${cancelledSkippedCount} CANCELLED skipped`;
      }
      
      const syncTypeDisplay = isHistoricalMode ? 'Historical' : syncMode.charAt(0).toUpperCase() + syncMode.slice(1);
      toast.success(`${syncTypeDisplay} sync completed`, {
        description
      });
    }

    return {
      success: true,
      results,
    };
  } catch (error) {
    console.error('Exception during import:', error);
    
    try {
      await updateSyncState(syncType, {
        last_sync_status: 'failed',
        metadata: { 
          error: error instanceof Error ? error.message : 'Unknown error',
          sync_mode: syncMode || 'unknown',
          duration_ms: Date.now() - startTime
        }
      });
    } catch (syncError) {
      console.error('Error updating sync state after failure:', syncError);
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during import',
    };
  }
};

/**
 * Force a historical synchronization (imports ALL bookings regardless of date)
 */
export const forceHistoricalSync = async (filters: Omit<ImportFilters, 'syncMode'> = {}): Promise<ImportResults> => {
  console.log('Starting HISTORICAL SYNC - will import all bookings regardless of age');
  return importBookings({ 
    ...filters, 
    syncMode: 'historical',
    forceHistoricalImport: true,
    includeHistorical: true
  });
};

/**
 * Import bookings quietly in the background, with intelligent sync mode selection
 */
export const quietImportBookings = async (filters: ImportFilters = {}): Promise<ImportResults> => {
  try {
    // Determine sync mode intelligently
    const syncMode = filters.syncMode || await getRecommendedSyncMode('booking_import');
    
    // Call the enhanced import with quiet flag
    const { data: resultData, error: functionError } = await supabase.functions.invoke(
      'import-bookings',
      {
        method: 'POST',
        body: { ...filters, quiet: true, syncMode }
      }
    );

    if (functionError) {
      console.error('Error calling import-bookings function:', functionError);
      return {
        success: false,
        error: `Import function error: ${functionError.message}`,
      };
    }

    if (resultData && resultData.error) {
      console.error('Error returned from import function:', resultData.error);
      const details = resultData.details || '';
      const status = resultData.status || 0;
      console.error(`Import error (${status}): ${resultData.error}`, details);
      
      return {
        success: false,
        error: `Import error: ${resultData.error}`,
        details: details,
        status: status
      };
    }

    // Only show toast if there are new or updated bookings
    if (resultData.results) {
      const newCount = resultData.results.new_bookings?.length || 0;
      const updatedCount = resultData.results.updated_bookings?.length || 0;
      const statusChangedCount = resultData.results.status_changed_bookings?.length || 0;
      const cancelledSkippedCount = resultData.results.cancelled_bookings_skipped?.length || 0;
      const productsCount = resultData.results.products_imported || 0;
      const attachmentsCount = resultData.results.attachments_imported || 0;
      
      if (newCount > 0 || updatedCount > 0) {
        const message = [];
        if (newCount > 0) message.push(`${newCount} new booking${newCount > 1 ? 's' : ''}`);
        if (updatedCount > 0) message.push(`${updatedCount} updated booking${updatedCount > 1 ? 's' : ''}`);
        
        let description = `${message.join(' and ')} found`;
        if (productsCount > 0 || attachmentsCount > 0) {
          description += ` • ${productsCount} products, ${attachmentsCount} attachments imported`;
        }
        if (cancelledSkippedCount > 0) {
          description += ` • ${cancelledSkippedCount} CANCELLED skipped`;
        }
        
        toast.success(`${syncMode.charAt(0).toUpperCase() + syncMode.slice(1)} sync completed`, {
          description
        });
      }
      
      // Show a different toast for status changes
      if (statusChangedCount > 0) {
        toast.warning('Booking status changes detected', {
          description: `${statusChangedCount} booking${statusChangedCount > 1 ? 's' : ''} changed status in external system`
        });
      }
      
      // Show info about cancelled bookings if any were skipped
      if (cancelledSkippedCount > 0 && newCount === 0 && updatedCount === 0) {
        toast.info('CANCELLED bookings filtered out', {
          description: `${cancelledSkippedCount} CANCELLED booking${cancelledSkippedCount > 1 ? 's' : ''} were not imported`
        });
      }
    }

    return {
      success: true,
      results: {
        ...resultData.results,
        sync_mode: syncMode
      },
    };
  } catch (error) {
    console.error('Exception during quiet import:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during import',
    };
  }
};

/**
 * Force a full synchronization (ignores incremental logic)
 */
export const forceFullSync = async (filters: Omit<ImportFilters, 'syncMode'> = {}): Promise<ImportResults> => {
  return importBookings({ ...filters, syncMode: 'full' });
};

/**
 * Get current sync state information
 */
export const getSyncStatus = async (): Promise<{
  lastSync: string | null;
  lastSyncMode: string | null;
  status: string | null;
  recommendedMode: SyncMode;
}> => {
  try {
    const syncState = await getSyncState('booking_import');
    const recommendedMode = await getRecommendedSyncMode('booking_import');
    
    return {
      lastSync: syncState?.last_sync_timestamp || null,
      lastSyncMode: syncState?.last_sync_mode || null,
      status: syncState?.last_sync_status || null,
      recommendedMode
    };
  } catch (error) {
    console.error('Error getting sync status:', error);
    return {
      lastSync: null,
      lastSyncMode: null,
      status: null,
      recommendedMode: 'full'
    };
  }
};

/**
 * Manually resync a specific booking calendar events
 */
export const resyncBookingCalendarEvents = async (bookingId: string): Promise<boolean> => {
  try {
    toast.info(`Resyncing booking ${bookingId} to calendar...`);
    
    // Import the sync function and call it properly
    const { syncSingleBookingToCalendar } = await import('./bookingCalendarService');
    await syncSingleBookingToCalendar(bookingId);
    
    toast.success(`Successfully resynced booking ${bookingId} calendar events`);
    return true;
  } catch (error) {
    console.error(`Error resyncing booking ${bookingId}:`, error);
    toast.error(`Error resyncing booking: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return false;
  }
};
