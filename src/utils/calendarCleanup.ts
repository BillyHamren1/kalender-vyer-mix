import { CalendarEvent } from '@/components/Calendar/ResourceData';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Identifies and removes duplicate events from the database
 * @returns Promise with the number of duplicates removed
 */
export const cleanupDuplicateEvents = async (): Promise<number> => {
  try {
    console.log('Starting duplicate events cleanup...');
    
    // Fetch all events
    const { data: allEvents, error } = await supabase
      .from('calendar_events')
      .select('*');
      
    if (error) {
      console.error('Error fetching events for cleanup:', error);
      throw error;
    }
    
    // Track unique events by tracking seen event combinations
    const uniqueEventKeys = new Map<string, string>();
    const duplicateIds: string[] = [];
    
    // Identify duplicates - an event is a duplicate if it has the same title, 
    // resource_id, start_time and end_time as another event
    allEvents.forEach(event => {
      const eventKey = `${event.title}-${event.resource_id}-${event.start_time}-${event.end_time}`;
      
      if (uniqueEventKeys.has(eventKey)) {
        // This is a duplicate, mark it for deletion
        duplicateIds.push(event.id);
      } else {
        // This is the first occurrence, keep it
        uniqueEventKeys.set(eventKey, event.id);
      }
    });
    
    console.log(`Found ${duplicateIds.length} duplicate events to remove`);
    
    if (duplicateIds.length === 0) {
      return 0; // No duplicates found
    }
    
    // Delete duplicates in batches of 100 to avoid potential request size limits
    const batchSize = 100;
    for (let i = 0; i < duplicateIds.length; i += batchSize) {
      const batch = duplicateIds.slice(i, i + batchSize);
      const { error: deleteError } = await supabase
        .from('calendar_events')
        .delete()
        .in('id', batch);
        
      if (deleteError) {
        console.error(`Error deleting batch of duplicates:`, deleteError);
        throw deleteError;
      }
    }
    
    console.log(`Successfully removed ${duplicateIds.length} duplicate events`);
    return duplicateIds.length;
  } catch (error) {
    console.error('Error during duplicate event cleanup:', error);
    throw error;
  }
};
