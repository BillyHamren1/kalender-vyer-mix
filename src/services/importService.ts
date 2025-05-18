
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

// Type for staff assignment in export response
export interface StaffAssignment {
  date: string;
  event_type: 'rig' | 'event' | 'rigDown';
  team_id: string;
  staff: {
    id: string;
    name: string;
    uuid: string;
  }[];
}

// Type for exported booking
export interface ExportedBooking {
  id: string;
  client: string;
  rigdaydate: string;
  eventdate: string;
  rigdowndate: string;
  deliveryaddress?: string;
  internalnotes?: string;
  created_at: string;
  updated_at: string;
  products: {
    name: string;
    quantity: number;
    notes?: string;
  }[];
  attachments: {
    url: string;
    file_name: string;
    file_type: string;
    uploaded_at: string;
  }[];
  staff_assignments: StaffAssignment[];
}

// Type for export results
export interface ExportResults {
  count: number;
  bookings: ExportedBooking[];
}

/**
 * Export bookings with staff assignments from the system
 */
export const exportBookings = async (filters: ImportFilters = {}): Promise<ExportResults> => {
  try {
    // Prepare URL with query parameters
    const queryParams = new URLSearchParams();
    if (filters.startDate) queryParams.append('startDate', filters.startDate);
    if (filters.endDate) queryParams.append('endDate', filters.endDate);
    if (filters.clientName) queryParams.append('client', filters.clientName);
    
    // Get API key for export
    const { data: keyData, error: keyError } = await supabase.functions.invoke('get-api-key', {
      method: 'POST',
      body: { key_type: 'export' }
    });
    
    if (keyError || !keyData?.api_key) {
      console.error('Error getting export API key:', keyError || 'No key returned');
      throw new Error('Failed to get authorization for export');
    }
    
    // Call the export-bookings edge function
    const response = await fetch(
      `https://pihrhltinhewhoxefjxv.supabase.co/functions/v1/export-bookings?${queryParams.toString()}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': keyData.api_key
        }
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Error from export function:', errorData);
      throw new Error(`Export failed: ${errorData.error || response.statusText}`);
    }
    
    const exportData = await response.json() as ExportResults;
    console.log(`Exported ${exportData.count} bookings with staff assignments`);
    
    return exportData;
  } catch (error) {
    console.error('Exception during export:', error);
    throw error;
  }
};

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
    if (
      resultData.results && 
      (
        (resultData.results.new_bookings && resultData.results.new_bookings.length > 0) || 
        (resultData.results.updated_bookings && resultData.results.updated_bookings.length > 0)
      )
    ) {
      const newCount = resultData.results.new_bookings?.length || 0;
      const updatedCount = resultData.results.updated_bookings?.length || 0;
      
      if (newCount > 0 || updatedCount > 0) {
        const message = [];
        if (newCount > 0) message.push(`${newCount} new booking${newCount > 1 ? 's' : ''}`);
        if (updatedCount > 0) message.push(`${updatedCount} updated booking${updatedCount > 1 ? 's' : ''}`);
        
        toast.success('Bookings synchronized', {
          description: `${message.join(' and ')} found`
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

