import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { isScannerApp } from "@/config/appMode";
import { 
  getSyncState, 
  updateSyncState, 
  getRecommendedSyncMode, 
  initializeSyncState,
  type SyncMode 
} from "./syncStateService";

/**
 * Detect "soft" timeouts from edge function (504 / IDLE_TIMEOUT).
 * import-bookings is long-running and frequently exceeds the 150s edge limit,
 * but it keeps processing on the server. We treat this as in-progress, not failed.
 */
const isEdgeTimeoutError = (err: unknown): boolean => {
  if (!err) return false;
  const msg = (err as { message?: string })?.message?.toLowerCase() ?? '';
  const ctx = (err as { context?: { status?: number; statusText?: string } })?.context;
  const status = ctx?.status;
  const statusText = (ctx?.statusText ?? '').toLowerCase();
  // FunctionsHttpError wraps any non-2xx — treat ALL of them as "still running"
  // for import-bookings since the server keeps processing past the 150s gateway cap.
  return (
    status === 504 ||
    status === 408 ||
    statusText.includes('timeout') ||
    msg.includes('idle_timeout') ||
    msg.includes('timeout') ||
    msg.includes('non-2xx') ||
    msg.includes('functionshttperror')
  );
};

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

const resolveImportOrganizationId = async (): Promise<string | null> => {
  try {
    // Dynamic import keeps this service free of React import cycle, but reuses
    // the shared in-memory cache used by hooks/components.
    const { getOrganizationId } = await import('@/hooks/useOrganizationId');
    return await getOrganizationId();
  } catch (error) {
    console.warn('Could not resolve organization_id for import:', error);
    return null;
  }
};

/**
 * In-flight coalescing map. Multiple callers triggering the same (org, mode)
 * import within the same tick reuse the in-flight promise instead of firing
 * a duplicate edge-function invocation. This stops the "two simultaneous
 * incremental syncs at login" pattern observed in the network logs.
 */
const inFlightImports = new Map<string, Promise<ImportResults>>();

const inFlightKey = (organizationId: string | null, filters: ImportFilters): string => {
  const mode = filters.syncMode ?? 'auto';
  const historical = filters.forceHistoricalImport || filters.includeHistorical || mode === 'historical' ? 'H' : 'N';
  return `${organizationId ?? 'noorg'}::${mode}::${historical}`;
};

/**
 * Enhanced import bookings with historical support and duplicate cleanup
 * @param filters - Import filter options
 * @param silent - If true, suppresses all toast notifications (for background imports)
 */
export const importBookings = async (filters: ImportFilters = {}, silent: boolean = false): Promise<ImportResults> => {
  // Scanner mode: never run booking imports
  if (isScannerApp) {
    return { success: true, results: { total: 0, imported: 0, failed: 0, calendar_events_created: 0 } };
  }

  // Coalesce concurrent identical imports (org + sync mode). We resolve the
  // organization_id eagerly so the key is stable across simultaneous callers.
  const earlyOrgId = await resolveImportOrganizationId();
  const key = inFlightKey(earlyOrgId, filters);
  const existing = inFlightImports.get(key);
  if (existing) {
    if (!silent) {
      console.info(`[importBookings] coalescing duplicate ${key}`);
    }
    return existing;
  }

  const promise = runImportBookings(filters, silent, earlyOrgId);
  inFlightImports.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlightImports.delete(key);
  }
};

const runImportBookings = async (filters: ImportFilters, silent: boolean, preResolvedOrgId: string | null): Promise<ImportResults> => {

  const syncType = 'booking_import';
  const startTime = Date.now();
  let syncMode: SyncMode;
  
  try {
    const organizationId = preResolvedOrgId ?? await resolveImportOrganizationId();
    if (!organizationId) {
      const message = 'Import skipped: authenticated user with organization_id is required.';
      if (!silent) {
        toast.error('Kunde inte starta synkronisering', {
          description: 'Ingen organisation kunde kopplas till den inloggade användaren.'
        });
      }

      return {
        success: false,
        error: message,
      };
    }

    // Handle historical import mode
    const isHistoricalMode = filters.syncMode === 'historical' || filters.includeHistorical || filters.forceHistoricalImport;
    
    if (isHistoricalMode) {
      syncMode = 'full';
      console.log('Running in HISTORICAL import mode - will import all bookings regardless of date');
      if (!silent) {
        toast.info('Starting historical import - this may take longer...', {
          duration: 5000,
        });
      }
    } else if (!silent) {
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
    
    // Update sync state to "in_progress" (non-blocking - sync state is optional)
    const stateResult = await updateSyncState(syncType, {
      last_sync_status: 'in_progress',
      metadata: { 
        started_at: new Date().toISOString(),
        sync_mode: syncMode,
        filters,
        historical_mode: isHistoricalMode
      }
    });
    if (!stateResult) {
      // Try to initialize if update found no rows
      await initializeSyncState(syncType, syncMode!, 'in_progress');
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
    
    if (!silent) {
      toast.info(`Starting ${isHistoricalMode ? 'historical' : syncMode} synchronization...`, {
        duration: 2000,
      });
    }
    
    // Call the Supabase Edge Function with improved duplicate handling
    const { data: resultData, error: functionError } = await supabase.functions.invoke(
      'import-bookings',
      {
        method: 'POST',
        body: { 
          ...enhancedFilters, 
          syncMode, 
          organization_id: organizationId,
          handleStatusChanges: true,
          preventDuplicateEvents: true,
          useTimestampFiltering: !isHistoricalMode,
          historicalMode: isHistoricalMode
        }
      }
    );

    const syncDurationMs = Date.now() - startTime;

    if (functionError) {
      // Treat edge timeouts as "still running" — server keeps processing.
      // Check FIRST so we don't trigger error boundaries via console.error.
      if (isEdgeTimeoutError(functionError)) {
        console.info('[import-bookings] gateway timeout — sync continues in background');
        if (!silent) {
          toast.info('Synkroniseringen körs vidare i bakgrunden — det kan ta några minuter.', {
            duration: 4000,
          });
        }
        return {
          success: true,
          results: { total: 0, imported: 0, failed: 0, calendar_events_created: 0 },
          error: 'background_processing',
        };
      }

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
    const queuedJobsCount = (results as typeof results & { queued_jobs?: number }).queued_jobs || 0;
    
    // Only show toasts if not in silent mode
    if (!silent) {
      if (queuedJobsCount > 0) {
        const syncTypeDisplay = isHistoricalMode ? 'Historical' : syncMode.charAt(0).toUpperCase() + syncMode.slice(1);
        toast.success(`${syncTypeDisplay} sync started`, {
          description: `${queuedJobsCount} bokningar köade för bakgrundssynk • ${(syncDurationMs / 1000).toFixed(1)}s`
        });
      } else if (newCount > 0 || updatedCount > 0 || statusChangedCount > 0) {
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
  // Scanner mode: never run booking imports
  if (isScannerApp) {
    return { success: true, results: { total: 0, imported: 0, failed: 0, calendar_events_created: 0 } };
  }
  try {
    const organizationId = await resolveImportOrganizationId();
    if (!organizationId) {
      return {
        success: false,
        error: 'Import skipped: authenticated user with organization_id is required.',
      };
    }

    // Determine sync mode intelligently
    const syncMode = filters.syncMode || await getRecommendedSyncMode('booking_import');
    
    // Call the enhanced import with quiet flag
    const { data: resultData, error: functionError } = await supabase.functions.invoke(
      'import-bookings',
      {
        method: 'POST',
        body: { ...filters, quiet: true, syncMode, organization_id: organizationId }
      }
    );

    if (functionError) {
      // Quiet background sync — swallow edge timeouts silently (no console.error to avoid error boundaries).
      if (isEdgeTimeoutError(functionError)) {
        console.info('[import-bookings] background sync still running on server (gateway timeout) — ignoring');
        return {
          success: true,
          results: { total: 0, imported: 0, failed: 0, calendar_events_created: 0 },
        };
      }

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
 * @deprecated Calendar sync is now fully backend-driven via import-bookings.
 */
export const resyncBookingCalendarEvents = async (_bookingId: string): Promise<boolean> => {
  console.warn('[importService] resyncBookingCalendarEvents — no-op (backend handles calendar sync)');
  toast.info('Kalendersynk hanteras nu av backend. Kontakta admin om data saknas.');
  return false;
};
