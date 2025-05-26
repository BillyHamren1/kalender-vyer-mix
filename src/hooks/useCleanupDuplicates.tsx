
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const useCleanupDuplicates = () => {
  const hasRunCleanup = useRef(false);

  useEffect(() => {
    const cleanupDuplicates = async () => {
      // Only run once per session
      if (hasRunCleanup.current) return;
      hasRunCleanup.current = true;

      try {
        console.log('Starting duplicate cleanup...');
        
        // Use a SQL function to remove duplicates more efficiently
        const { data, error } = await supabase.rpc('cleanup_duplicate_events');
        
        if (error) {
          console.error('Error during cleanup:', error);
          return;
        }
        
        if (data && data > 0) {
          console.log(`Cleaned up ${data} duplicate events`);
          toast.success(`Cleaned up duplicate events`, {
            description: `Removed ${data} duplicate calendar entries`
          });
        }
      } catch (error) {
        console.error('Error in duplicate cleanup:', error);
      }
    };

    // Run cleanup after a short delay to ensure database is ready
    const timeoutId = setTimeout(cleanupDuplicates, 2000);
    
    return () => clearTimeout(timeoutId);
  }, []);

  return null; // This hook doesn't return anything, it just runs cleanup
};
