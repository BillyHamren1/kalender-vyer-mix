
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
    const { data: secretData, error: secretError } = await supabase.functions.invoke(
      'import-bookings',
      {
        method: 'POST',
        body: { ...filters }
      }
    );

    if (secretError) {
      console.error('Error importing bookings:', secretError);
      return {
        success: false,
        error: `Import failed: ${secretError.message}`,
      };
    }

    // Check if the response contains an error field
    if (secretData && secretData.error) {
      console.error('Error returned from import function:', secretData.error);
      return {
        success: false,
        error: `Import error: ${secretData.error}`,
      };
    }

    return {
      success: true,
      results: secretData.results,
    };
  } catch (error) {
    console.error('Exception during import:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during import',
    };
  }
};
