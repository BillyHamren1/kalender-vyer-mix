
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { resyncBookingToCalendar, deleteAllBookingEvents } from "./bookingCalendarService";
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
    new_bookings?: string[];
    updated_bookings?: string[];
    status_changed_bookings?: string[];
    errors?: { booking_id: string; error: string }[];
    sync_mode?: SyncMode;
    sync_duration_ms?: number;
  };
  error?: string;
  details?: string;
  status?: number;
}

// Type for filter options
export interface ImportFilters {
  startDate?: string;
  endDate?: string;
  clientName?: string;
  syncMode?: SyncMode; // Allow manual override of sync mode
}

/**
 * Handle status changes during import with calendar sync
 */
const handleImportStatusChange = async (bookingId: string, newStatus: string, previousStatus?: string): Promise<void> => {
  try {
    const normalizedNewStatus = newStatus.toUpperCase();
    const normalizedPreviousStatus = previousStatus?.toUpperCase();
    
    // Only handle calendar sync if status actually changed
    if (normalizedNewStatus === normalizedPreviousStatus) {
      return;
    }
    
    console.log(`Handling status change for booking ${bookingId}: ${normalizedPreviousStatus} -> ${normalizedNewStatus}`);
    
    switch (normalizedNewStatus) {
      case 'CONFIRMED':
        // When status becomes confirmed, sync to calendar
        console.log(`Syncing booking ${bookingId} to calendar (status: CONFIRMED)`);
        const syncResult = await resyncBookingToCalendar(bookingId);
        if (!syncResult) {
          console.warn(`Could not sync booking ${bookingId} to calendar - may be missing dates`);
        }
        break;

      case 'CANCELLED':
        // When status becomes cancelled, remove from calendar
        console.log(`Removing booking ${bookingId} from calendar (status: CANCELLED)`);
        await deleteAllBookingEvents(bookingId);
        break;

      case 'OFFER':
        // When status becomes offer, remove from calendar if previously confirmed
        if (normalizedPreviousStatus === 'CONFIRMED') {
          console.log(`Removing booking ${bookingId} from calendar (status changed from CONFIRMED to ${normalizedNewStatus})`);
          await deleteAllBookingEvents(bookingId);
        }
        break;

      default:
        console.warn(`Unknown status during import: ${normalizedNewStatus}`);
    }
  } catch (error) {
    console.error(`Error handling status change for booking ${bookingId}:`, error);
    // Don't throw here - import should continue even if calendar sync fails
  }
};

/**
 * Enhanced import bookings with intelligent sync modes and state tracking
 */
export const importBookings = async (filters: ImportFilters = {}): Promise<ImportResults> => {
  const syncType = 'booking_import';
  const startTime = Date.now();
  let syncMode: SyncMode; // Declare syncMode at function scope
  
  try {
    toast.info('Initializing booking synchronization...', {
      duration: 3000,
    });
    
    // Get or determine sync mode
    if (filters.syncMode) {
      syncMode = filters.syncMode;
      console.log(`Using manually specified sync mode: ${syncMode}`);
    } else {
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
          filters 
        }
      });
    } catch (error) {
      // If sync state doesn't exist, initialize it
      console.log('Initializing sync state for first time');
      await initializeSyncState(syncType, syncMode, 'in_progress');
    }
    
    // Adjust filters for incremental sync
    const enhancedFilters = { ...filters };
    if (syncMode === 'incremental') {
      try {
        const syncState = await getSyncState(syncType);
        if (syncState?.last_sync_timestamp) {
          // For incremental sync, only get bookings updated after last sync
          const lastSyncDate = new Date(syncState.last_sync_timestamp);
          // Go back 1 hour to account for clock skew
          lastSyncDate.setHours(lastSyncDate.getHours() - 1);
          enhancedFilters.startDate = lastSyncDate.toISOString().split('T')[0];
          console.log(`Incremental sync: fetching bookings updated since ${enhancedFilters.startDate}`);
        }
      } catch (error) {
        console.warn('Error setting up incremental sync, falling back to full sync:', error);
        syncMode = 'full';
      }
    }
    
    toast.info(`Starting ${syncMode} synchronization...`, {
      duration: 2000,
    });
    
    // Call the Supabase Edge Function with enhanced status handling
    const { data: resultData, error: functionError } = await supabase.functions.invoke(
      'import-bookings',
      {
        method: 'POST',
        body: { ...enhancedFilters, syncMode, handleStatusChanges: true }
      }
    );

    const syncDurationMs = Date.now() - startTime;

    if (functionError) {
      console.error('Error calling import-bookings function:', functionError);
      
      // Update sync state to failed
      await updateSyncState(syncType, {
        last_sync_status: 'failed',
        metadata: { 
          error: functionError.message,
          sync_mode: syncMode,
          duration_ms: syncDurationMs
        }
      });
      
      return {
        success: false,
        error: `Import function error: ${functionError.message}`,
      };
    }

    // If we got a response but it contains an error field
    if (resultData && resultData.error) {
      console.error('Error returned from import function:', resultData.error);
      
      const details = resultData.details || '';
      const status = resultData.status || 0;
      
      // Update sync state to failed
      await updateSyncState(syncType, {
        last_sync_status: 'failed',
        metadata: { 
          error: resultData.error,
          details,
          status,
          sync_mode: syncMode,
          duration_ms: syncDurationMs
        }
      });
      
      console.error(`Import error (${status}): ${resultData.error}`, details);
      
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
    
    // Handle status changes that occurred during import by calling our calendar sync
    if (results.status_changed_bookings && results.status_changed_bookings.length > 0) {
      console.log(`Processing ${results.status_changed_bookings.length} status changes for calendar sync`);
      
      // For each status changed booking, we need to handle calendar sync
      // Note: The import function should have already handled the calendar events,
      // but we'll add this as a safety net for any edge cases
      for (const bookingId of results.status_changed_bookings) {
        try {
          // Fetch the current booking to get its status
          const { data: booking } = await supabase
            .from('bookings')
            .select('status')
            .eq('id', bookingId)
            .single();
          
          if (booking) {
            // Handle calendar sync based on current status
            await handleImportStatusChange(bookingId, booking.status);
          }
        } catch (error) {
          console.error(`Error handling status change for booking ${bookingId}:`, error);
        }
      }
    }
    
    // Update sync state to success
    await updateSyncState(syncType, {
      last_sync_timestamp: new Date().toISOString(),
      last_sync_status: 'success',
      last_sync_mode: syncMode,
      metadata: { 
        ...results,
        completed_at: new Date().toISOString()
      }
    });
    
    // Show appropriate success message
    const newCount = results.new_bookings?.length || 0;
    const updatedCount = results.updated_bookings?.length || 0;
    const statusChangedCount = results.status_changed_bookings?.length || 0;
    
    if (newCount > 0 || updatedCount > 0 || statusChangedCount > 0) {
      const messages = [];
      if (newCount > 0) messages.push(`${newCount} new booking${newCount > 1 ? 's' : ''}`);
      if (updatedCount > 0) messages.push(`${updatedCount} updated`);
      if (statusChangedCount > 0) messages.push(`${statusChangedCount} status changed`);
      
      toast.success(`${syncMode.charAt(0).toUpperCase() + syncMode.slice(1)} sync completed`, {
        description: `${messages.join(', ')} • ${(syncDurationMs / 1000).toFixed(1)}s`
      });
    } else {
      toast.success(`${syncMode.charAt(0).toUpperCase() + syncMode.slice(1)} sync completed`, {
        description: `No changes found • ${(syncDurationMs / 1000).toFixed(1)}s`
      });
    }

    return {
      success: true,
      results,
    };
  } catch (error) {
    console.error('Exception during import:', error);
    
    // Update sync state to failed
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
      
      if (newCount > 0 || updatedCount > 0) {
        const message = [];
        if (newCount > 0) message.push(`${newCount} new booking${newCount > 1 ? 's' : ''}`);
        if (updatedCount > 0) message.push(`${updatedCount} updated booking${updatedCount > 1 ? 's' : ''}`);
        
        toast.success(`${syncMode.charAt(0).toUpperCase() + syncMode.slice(1)} sync completed`, {
          description: `${message.join(' and ')} found`
        });
      }
      
      // Show a different toast for status changes
      if (statusChangedCount > 0) {
        toast.warning('Booking status changes detected', {
          description: `${statusChangedCount} booking${statusChangedCount > 1 ? 's' : ''} changed status in external system`
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
    
    const success = await resyncBookingToCalendar(bookingId);
    
    if (success) {
      toast.success(`Successfully resynced booking ${bookingId} calendar events`);
    } else {
      toast.error(`Failed to resync booking ${bookingId}`);
    }
    
    return success;
  } catch (error) {
    console.error(`Error resyncing booking ${bookingId}:`, error);
    toast.error(`Error resyncing booking: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return false;
  }
};
