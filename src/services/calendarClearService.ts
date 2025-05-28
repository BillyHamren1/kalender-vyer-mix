
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
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records
    
    if (error) {
      console.error('Error clearing calendar events:', error);
      toast.error('Failed to clear calendar events');
      return false;
    }
    
    console.log('Successfully cleared all calendar events');
    return true;
  } catch (error) {
    console.error('Exception while clearing calendar events:', error);
    toast.error('Error clearing calendar events');
    return false;
  }
};

/**
 * Clear all staff assignments from the database
 */
export const clearAllStaffAssignments = async (): Promise<boolean> => {
  try {
    console.log('Clearing all staff assignments...');
    
    const { error } = await supabase
      .from('staff_assignments')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records
    
    if (error) {
      console.error('Error clearing staff assignments:', error);
      toast.error('Failed to clear staff assignments');
      return false;
    }
    
    console.log('Successfully cleared all staff assignments');
    return true;
  } catch (error) {
    console.error('Exception while clearing staff assignments:', error);
    toast.error('Error clearing staff assignments');
    return false;
  }
};

/**
 * Clear all booking staff assignments from the database
 */
export const clearAllBookingStaffAssignments = async (): Promise<boolean> => {
  try {
    console.log('Clearing all booking staff assignments...');
    
    const { error } = await supabase
      .from('booking_staff_assignments')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records
    
    if (error) {
      console.error('Error clearing booking staff assignments:', error);
      toast.error('Failed to clear booking staff assignments');
      return false;
    }
    
    console.log('Successfully cleared all booking staff assignments');
    return true;
  } catch (error) {
    console.error('Exception while clearing booking staff assignments:', error);
    toast.error('Error clearing booking staff assignments');
    return false;
  }
};

/**
 * Clear calendar events, staff assignments, and booking staff assignments, then refresh the display
 */
export const clearAndRefreshCalendar = async (refreshCallback?: () => Promise<void>): Promise<void> => {
  try {
    console.log('Starting comprehensive data clearing...');
    
    // Clear all data in sequence
    const calendarSuccess = await clearAllCalendarEvents();
    const staffSuccess = await clearAllStaffAssignments();
    const bookingStaffSuccess = await clearAllBookingStaffAssignments();
    
    if (calendarSuccess && staffSuccess && bookingStaffSuccess) {
      toast.success('All calendar events and staff assignments cleared successfully');
      
      if (refreshCallback) {
        // Wait a moment for the database to update
        setTimeout(() => {
          refreshCallback();
        }, 1000);
      }
    } else {
      toast.error('Some data could not be cleared. Please check the console for details.');
    }
  } catch (error) {
    console.error('Error in comprehensive data clearing:', error);
    toast.error('Error clearing data');
  }
};
