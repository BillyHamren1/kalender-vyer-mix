
import { useEffect, useRef, useState } from 'react';
import { quietImportBookings, importBookings, getSyncStatus, forceHistoricalSync } from '@/services/importService';
import { useQueryClient } from '@tanstack/react-query';

interface UseBackgroundImportOptions {
  intervalMs?: number;
  enableAutoImport?: boolean;
  onImportComplete?: (results: any) => void;
}

export const useBackgroundImport = (options: UseBackgroundImportOptions = {}) => {
  const {
    intervalMs = 2 * 60 * 1000, // 2 minutes default
    enableAutoImport = true,
    onImportComplete
  } = options;

  const [isImporting, setIsImporting] = useState(false);
  const [isHistoricalImporting, setIsHistoricalImporting] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Manual refresh function
  const performManualRefresh = async () => {
    try {
      setIsImporting(true);
      const result = await importBookings();
      
      if (result.success) {
        // Invalidate relevant queries to refresh data
        await queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
        await queryClient.invalidateQueries({ queryKey: ['bookings'] });
        await queryClient.invalidateQueries({ queryKey: ['bookings-for-status'] });
        
        if (onImportComplete) {
          onImportComplete(result.results);
        }
      }
      
      return result;
    } catch (error) {
      console.error('Manual refresh failed:', error);
      throw error;
    } finally {
      setIsImporting(false);
    }
  };

  // Historical import function
  const performHistoricalImport = async (startDate?: string, endDate?: string) => {
    try {
      setIsHistoricalImporting(true);
      const result = await forceHistoricalSync({
        startDate,
        endDate,
        includeHistorical: true
      });
      
      if (result.success) {
        // Invalidate relevant queries to refresh data
        await queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
        await queryClient.invalidateQueries({ queryKey: ['bookings'] });
        await queryClient.invalidateQueries({ queryKey: ['bookings-for-status'] });
        
        if (onImportComplete) {
          onImportComplete(result.results);
        }
      }
      
      return result;
    } catch (error) {
      console.error('Historical import failed:', error);
      throw error;
    } finally {
      setIsHistoricalImporting(false);
    }
  };

  // Background quiet import function
  const performQuietImport = async () => {
    try {
      const result = await quietImportBookings();
      
      if (result.success && result.results) {
        const hasNewData = (result.results.new_bookings?.length || 0) > 0 || 
                          (result.results.updated_bookings?.length || 0) > 0;
        
        if (hasNewData) {
          // Invalidate queries in background to refresh data
          await queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
          await queryClient.invalidateQueries({ queryKey: ['bookings-for-status'] });
        }
      }
    } catch (error) {
      console.error('Background import failed:', error);
    }
  };

  // Update sync status
  const updateSyncStatus = async () => {
    try {
      const status = await getSyncStatus();
      setLastSyncTime(status.lastSync);
      setSyncStatus(status.status);
    } catch (error) {
      console.error('Failed to get sync status:', error);
    }
  };

  // Setup background polling
  useEffect(() => {
    if (!enableAutoImport) return;

    // Initial sync status check
    updateSyncStatus();

    // Setup interval for background imports
    intervalRef.current = setInterval(() => {
      // Only run if page is visible to save resources
      if (!document.hidden) {
        performQuietImport();
        updateSyncStatus();
      }
    }, intervalMs);

    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enableAutoImport, intervalMs]);

  // Handle visibility change - resume imports when page becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && enableAutoImport) {
        // Immediately check for updates when page becomes visible
        performQuietImport();
        updateSyncStatus();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [enableAutoImport]);

  return {
    isImporting,
    isHistoricalImporting,
    lastSyncTime,
    syncStatus,
    performManualRefresh,
    performHistoricalImport,
    updateSyncStatus
  };
};
