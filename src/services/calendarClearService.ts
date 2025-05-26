
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Clear all calendar events from the database
 */
export const clearAllCalendarEvents = async (): Promise<boolean> => {
  try {
    console.log('Clearing all calendar events...');
    
    const { error } = await supabase
      .from('calendar_events')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records (using a dummy condition that matches all)
    
    if (error) {
      console.error('Error clearing calendar events:', error);
      toast.error('Failed to clear calendar events');
      return false;
    }
    
    console.log('Successfully cleared all calendar events');
    toast.success('Calendar events cleared successfully');
    return true;
  } catch (error) {
    console.error('Exception while clearing calendar events:', error);
    toast.error('Error clearing calendar events');
    return false;
  }
};

/**
 * Clear calendar events and refresh the display
 */
export const clearAndRefreshCalendar = async (refreshCallback?: () => Promise<void>): Promise<void> => {
  const success = await clearAllCalendarEvents();
  
  if (success && refreshCallback) {
    // Wait a moment for the database to update
    setTimeout(() => {
      refreshCallback();
    }, 1000);
  }
};
