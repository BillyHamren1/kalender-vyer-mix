import { cleanupDuplicateCalendarEvents } from '@/services/bookingToCalendarSync';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Aggressive cleanup function to remove ALL duplicate calendar events
export const runAggressiveCalendarCleanup = async (): Promise<void> => {
  try {
    console.log('Starting AGGRESSIVE calendar cleanup...');
    toast.info('Removing ALL duplicate calendar events...');
    
    // First, get all events grouped by booking_id and event_type
    const { data: allEvents, error: fetchError } = await supabase
      .from('calendar_events')
      .select('*')
      .not('booking_id', 'is', null)
      .order('booking_id')
      .order('event_type')
      .order('created_at');

    if (fetchError) {
      console.error('Error fetching events:', fetchError);
      throw fetchError;
    }

    if (!allEvents || allEvents.length === 0) {
      toast.success('No events found to clean up');
      return;
    }

    // Group events by booking_id + event_type combination
    const eventGroups = allEvents.reduce((acc, event) => {
      const key = `${event.booking_id}-${event.event_type}`;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(event);
      return acc;
    }, {} as Record<string, any[]>);

    let totalDeleted = 0;

    // For each group, keep only the OLDEST event and delete all others
    for (const [key, events] of Object.entries(eventGroups)) {
      if (events.length > 1) {
        // Sort by created_at to keep the oldest
        events.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        
        // Keep the first (oldest) event, delete ALL others
        const eventsToDelete = events.slice(1);
        const idsToDelete = eventsToDelete.map(e => e.id);
        
        console.log(`AGGRESSIVE: Found ${events.length} events for ${key}, keeping oldest, deleting ${idsToDelete.length}`);
        
        // Delete in batches
        const batchSize = 50;
        for (let i = 0; i < idsToDelete.length; i += batchSize) {
          const batch = idsToDelete.slice(i, i + batchSize);
          
          const { error: deleteError } = await supabase
            .from('calendar_events')
            .delete()
            .in('id', batch);

          if (deleteError) {
            console.error(`Error deleting batch for ${key}:`, deleteError);
          } else {
            totalDeleted += batch.length;
            console.log(`Deleted batch of ${batch.length} events for ${key}`);
          }
        }
      }
    }

    toast.success(`CLEANUP COMPLETE! Removed ${totalDeleted} duplicate events`);
    console.log(`Aggressive cleanup completed: ${totalDeleted} duplicates removed`);
    
    // Set flags to indicate cleanup has been run
    localStorage.setItem('calendar-cleanup-completed', 'true');
    localStorage.setItem('aggressive-cleanup-completed', 'true');
    
  } catch (error) {
    console.error('Error during aggressive calendar cleanup:', error);
    toast.error('Failed to clean up calendar events');
  }
};

// Legacy cleanup function - now just calls the aggressive one
export const runCalendarCleanup = async (): Promise<void> => {
  return runAggressiveCalendarCleanup();
};

// Check if cleanup has been run and offer to run it
export const checkAndOfferCleanup = (): boolean => {
  const cleanupCompleted = localStorage.getItem('aggressive-cleanup-completed');
  return cleanupCompleted !== 'true';
};

// Emergency nuclear option - delete ALL calendar events
export const runNuclearCleanup = async (): Promise<void> => {
  try {
    console.log('Starting NUCLEAR cleanup - deleting ALL calendar events...');
    toast.info('NUCLEAR CLEANUP: Removing ALL calendar events...');
    
    const { error } = await supabase
      .from('calendar_events')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records
    
    if (error) {
      console.error('Error in nuclear cleanup:', error);
      throw error;
    }
    
    toast.success('NUCLEAR CLEANUP COMPLETE! All calendar events removed');
    console.log('Nuclear cleanup completed: ALL events removed');
    
    // Set flags
    localStorage.setItem('calendar-cleanup-completed', 'true');
    localStorage.setItem('aggressive-cleanup-completed', 'true');
    localStorage.setItem('nuclear-cleanup-completed', 'true');
    
  } catch (error) {
    console.error('Error during nuclear cleanup:', error);
    toast.error('Failed to perform nuclear cleanup');
  }
};
