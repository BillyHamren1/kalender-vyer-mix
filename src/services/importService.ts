
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
    
    // Call the Supabase Edge Function without custom Authorization header
    // The supabase client will automatically include authentication
    const { data: resultData, error: functionError } = await supabase.functions.invoke(
      'import-bookings',
      {
        method: 'POST',
        body: { ...filters }
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
