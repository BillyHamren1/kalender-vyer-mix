
import { useState, useCallback } from 'react';
import { importBookings, ImportResults } from '@/services/importService';
import { toast } from 'sonner';

export const useCalendarImport = () => {
  const [isImporting, setIsImporting] = useState(false);
  const [lastImportResult, setLastImportResult] = useState<ImportResults | null>(null);

  // Manual import with user feedback
  const triggerImport = useCallback(async (silent = false) => {
    if (isImporting) return;
    
    setIsImporting(true);
    
    try {
      if (!silent) {
        toast.info('Refreshing booking data...');
      }
      
      const result = await importBookings({
        syncMode: 'incremental'
      });
      
      setLastImportResult(result);
      
      if (result.success) {
        const newCount = result.results?.new_bookings?.length || 0;
        const updatedCount = result.results?.updated_bookings?.length || 0;
        const queuedCount = (result.results as { queued_jobs?: number } | undefined)?.queued_jobs || 0;
        
        if (!silent && queuedCount > 0) {
          toast.success(`Refresh started: ${queuedCount} bookingar köade för bakgrundssynk`);
        } else if (!silent && (newCount > 0 || updatedCount > 0)) {
          toast.success(`Refresh completed: ${newCount} new, ${updatedCount} updated bookings`);
        } else if (!silent) {
          toast.success('Calendar data is up to date');
        }
      } else {
        if (!silent) {
          toast.error(`Refresh failed: ${result.error}`);
        }
      }
      
      return result;
    } catch (error) {
      console.error('Manual import error:', error);
      if (!silent) {
        toast.error('Kunde inte uppdatera bokningsdata');
      }
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    } finally {
      setIsImporting(false);
    }
  }, [isImporting]);

  // Silent import (no user feedback)
  const triggerSilentImport = useCallback(() => {
    return triggerImport(true);
  }, [triggerImport]);

  return {
    isImporting,
    lastImportResult,
    triggerImport,
    triggerSilentImport
  };
};
