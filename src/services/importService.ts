
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
 * Import bookings from external API
 */
export const importBookings = async (filters: ImportFilters = {}): Promise<ImportResults> => {
  try {
    toast.info('Connecting to external booking system...', {
      duration: 3000,
    });
    
    // Call the Supabase Edge Function
    const { data: resultData, error: functionError } = await supabase.functions.invoke(
      'import-bookings',
      {
        method: 'POST',
        body: filters
      }
    );

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

    // Handle successful import
    return {
      success: true,
      results: resultData.results,
    };
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
    // Call the Supabase Edge Function with quiet parameter
    const { data: resultData, error: functionError } = await supabase.functions.invoke(
      'import-bookings',
      {
        method: 'POST',
        body: { ...filters, quiet: true }
      }
    );

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
    console.error('Exception during quiet import:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during import',
    };
  }
};
