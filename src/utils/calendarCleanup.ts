
import { cleanupDuplicateCalendarEvents } from '@/services/bookingToCalendarSync';
import { toast } from 'sonner';

// One-time cleanup function to remove duplicate calendar events
export const runCalendarCleanup = async (): Promise<void> => {
  try {
    console.log('Starting calendar cleanup...');
    toast.info('Cleaning up duplicate calendar events...');
    
    const deletedCount = await cleanupDuplicateCalendarEvents();
    
    if (deletedCount > 0) {
      toast.success(`Cleanup complete! Removed ${deletedCount} duplicate events`);
      console.log(`Calendar cleanup completed: ${deletedCount} duplicates removed`);
    } else {
      toast.success('No duplicate events found - calendar is clean!');
      console.log('Calendar cleanup completed: no duplicates found');
    }
    
    // Set a flag to indicate cleanup has been run
    localStorage.setItem('calendar-cleanup-completed', 'true');
    
  } catch (error) {
    console.error('Error during calendar cleanup:', error);
    toast.error('Failed to clean up calendar events');
  }
};

// Check if cleanup has been run and offer to run it
export const checkAndOfferCleanup = (): boolean => {
  const cleanupCompleted = localStorage.getItem('calendar-cleanup-completed');
  return cleanupCompleted !== 'true';
};
