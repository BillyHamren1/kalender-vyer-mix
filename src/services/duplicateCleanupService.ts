
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const cleanupDuplicateCalendarEvents = async (): Promise<void> => {
  try {
    console.log('Starting cleanup of duplicate calendar events...');
    
    // Call the database function to clean up duplicates
    const { data, error } = await supabase.rpc('cleanup_duplicate_calendar_events');
    
    if (error) {
      console.error('Error cleaning up duplicates:', error);
      toast.error('Failed to clean up duplicate events');
      return;
    }
    
    if (data && data.length > 0) {
      const totalRemoved = data.reduce((sum: number, item: any) => sum + item.duplicates_removed, 0);
      console.log('Cleanup results:', data);
      console.log(`Total duplicates removed: ${totalRemoved}`);
      
      toast.success(`Cleanup completed: ${totalRemoved} duplicate events removed`);
    } else {
      console.log('No duplicates found to clean up');
      toast.info('No duplicate events found');
    }
  } catch (error) {
    console.error('Error during cleanup:', error);
    toast.error('Failed to clean up duplicate events');
  }
};

export const getDuplicateStats = async (): Promise<{
  totalDuplicates: number;
  duplicatesByBooking: Array<{ booking_id: string; count: number; event_type: string }>
}> => {
  try {
    const { data, error } = await supabase
      .from('calendar_events')
      .select('booking_id, event_type')
      .not('booking_id', 'is', null);
    
    if (error) {
      console.error('Error fetching events for stats:', error);
      return { totalDuplicates: 0, duplicatesByBooking: [] };
    }
    
    // Count duplicates by booking_id and event_type
    const countMap = new Map<string, number>();
    data?.forEach(event => {
      const key = `${event.booking_id}-${event.event_type}`;
      countMap.set(key, (countMap.get(key) || 0) + 1);
    });
    
    const duplicatesByBooking = Array.from(countMap.entries())
      .filter(([_, count]) => count > 1)
      .map(([key, count]) => {
        const [booking_id, event_type] = key.split('-', 2);
        return { booking_id, event_type, count };
      });
    
    const totalDuplicates = duplicatesByBooking.reduce((sum, item) => sum + (item.count - 1), 0);
    
    return { totalDuplicates, duplicatesByBooking };
  } catch (error) {
    console.error('Error calculating duplicate stats:', error);
    return { totalDuplicates: 0, duplicatesByBooking: [] };
  }
};
