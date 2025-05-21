
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { resyncBookingToCalendar } from "./bookingCalendarService";

// Type for import results
export interface ImportResults {
  success: boolean;
  results?: {
    total: number;
    imported: number;
    failed: number;
    calendar_events_created: number;
    new_bookings?: string[];
    updated_bookings?: string[];
    status_changed_bookings?: string[];
    errors?: { booking_id: string; error: string }[];
  };
  error?: string;
  details?: string;
  status?: number;
}

// Type for filter options
export interface ImportFilters {
  startDate?: string;
  endDate?: string;
  clientName?: string;
}

/**
 * Import bookings from external API with improved error handling
 */
export const importBookings = async (filters: ImportFilters = {}): Promise<ImportResults> => {
  try {
    console.log('Starting importBookings with filters:', filters);
    
    toast.info('Connecting to external booking system...', {
      duration: 3000,
    });
    
    // Create an AbortController for timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 second timeout
    
    try {
      // Call the Supabase Edge Function
      // Remove the 'signal' property as it doesn't exist in FunctionInvokeOptions
      const { data: resultData, error: functionError } = await supabase.functions.invoke(
        'import-bookings',
        {
          method: 'POST',
          body: filters
        }
      );

      clearTimeout(timeoutId); // Clear the timeout if the request completes
      
      if (functionError) {
        console.error('Error calling import-bookings function:', functionError);
        return {
          success: false,
          error: `Import function error: ${functionError.message}`,
        };
      }

      // If we got a response but it contains an error field
      if (resultData && resultData.error) {
        console.error('Error returned from import function:', resultData.error);
        
        // More detailed error reporting
        const details = resultData.details || '';
        const status = resultData.status || 0;
        
        // Log the detailed error
        console.error(`Import error (${status}): ${resultData.error}`, details);
        
        return {
          success: false,
          error: `Import error: ${resultData.error}`,
          details: details,
          status: status
        };
      }

      console.log('Import completed successfully with results:', resultData.results);
      
      // Handle successful import
      return {
        success: true,
        results: resultData.results,
      };
    } catch (error) {
      clearTimeout(timeoutId); // Ensure the timeout is cleared
      
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.error('Import request timed out');
        return {
          success: false,
          error: 'Import request timed out after 25 seconds',
        };
      }
      
      throw error; // Re-throw for the outer catch to handle
    }
  } catch (error) {
    console.error('Exception during import:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during import',
    };
  }
};

/**
 * Import bookings quietly in the background, without showing toasts unless there are new/updated bookings
 */
export const quietImportBookings = async (filters: ImportFilters = {}): Promise<ImportResults> => {
  try {
    console.log('Starting quietImportBookings');
    
    // Create an AbortController for timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout for background imports
    
    try {
      // Call the Supabase Edge Function with quiet parameter
      // Remove the 'signal' property as it doesn't exist in FunctionInvokeOptions
      const { data: resultData, error: functionError } = await supabase.functions.invoke(
        'import-bookings',
        {
          method: 'POST',
          body: { ...filters, quiet: true }
        }
      );

      clearTimeout(timeoutId); // Clear the timeout if the request completes
      
      if (functionError) {
        console.error('Error calling import-bookings function in background:', functionError);
        return {
          success: false,
          error: `Import function error: ${functionError.message}`,
        };
      }

      // If we got a response but it contains an error field
      if (resultData && resultData.error) {
        console.error('Error returned from import function in background:', resultData.error);
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
        
        console.log('Background import results:', {
          newCount,
          updatedCount,
          statusChangedCount
        });
        
        if (newCount > 0 || updatedCount > 0) {
          const message = [];
          if (newCount > 0) message.push(`${newCount} new booking${newCount > 1 ? 's' : ''}`);
          if (updatedCount > 0) message.push(`${updatedCount} updated booking${updatedCount > 1 ? 's' : ''}`);
          
          toast.success('Bookings synchronized', {
            description: `${message.join(' and ')} found`
          });
        }
        
        // Show a different toast for status changes
        if (statusChangedCount > 0) {
          toast.warning('Booking status changes detected', {
            description: `${statusChangedCount} booking${statusChangedCount > 1 ? 's' : ''} changed status in external system`
          });
        }
      }

      // Handle successful import
      return {
        success: true,
        results: resultData.results,
      };
    } catch (error) {
      clearTimeout(timeoutId); // Ensure the timeout is cleared
      
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.error('Background import request timed out');
        return {
          success: false,
          error: 'Background import request timed out after 15 seconds',
        };
      }
      
      throw error; // Re-throw for the outer catch to handle
    }
  } catch (error) {
    console.error('Exception during quiet import:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during import',
    };
  }
};

/**
 * Manually resync a specific booking calendar events
 */
export const resyncBookingCalendarEvents = async (bookingId: string): Promise<boolean> => {
  try {
    toast.info(`Resyncing booking ${bookingId} to calendar...`);
    
    const success = await resyncBookingToCalendar(bookingId);
    
    if (success) {
      toast.success(`Successfully resynced booking ${bookingId} calendar events`);
    } else {
      toast.error(`Failed to resync booking ${bookingId}`);
    }
    
    return success;
  } catch (error) {
    console.error(`Error resyncing booking ${bookingId}:`, error);
    toast.error(`Error resyncing booking: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return false;
  }
};
