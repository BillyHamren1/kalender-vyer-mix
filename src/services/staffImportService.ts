
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface StaffImportResult {
  success: boolean;
  data?: any[];
  error?: string;
}

/**
 * Import staff data from external API via edge function
 */
export const importStaffData = async (): Promise<StaffImportResult> => {
  try {
    console.log('🔄 Starting staff import from external API...');
    
    const { data, error } = await supabase.functions.invoke('fetch_staff_for_planning', {
      method: 'POST',
      body: {
        date: new Date().toISOString().split('T')[0]
      }
    });

    if (error) {
      console.error('Error calling fetch_staff_for_planning function:', error);
      return {
        success: false,
        error: `Staff import function error: ${error.message}`
      };
    }

    if (data && data.error) {
      console.error('Error returned from staff import function:', data.error);
      return {
        success: false,
        error: `Staff import error: ${data.error}`
      };
    }

    const staffCount = data?.data?.length || 0;
    console.log(`✅ Staff import completed: ${staffCount} staff members processed`);
    
    toast.success(`Staff import completed`, {
      description: `${staffCount} staff members synchronized`
    });

    return {
      success: true,
      data: data?.data || []
    };
  } catch (error) {
    console.error('Exception during staff import:', error);
    toast.error('Failed to import staff data', {
      description: error instanceof Error ? error.message : 'Unknown error'
    });
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during staff import'
    };
  }
};

/**
 * Silent staff import (no user feedback)
 */
export const importStaffDataSilently = async (): Promise<StaffImportResult> => {
  try {
    console.log('🔄 Silent staff import starting...');
    
    const { data, error } = await supabase.functions.invoke('fetch_staff_for_planning', {
      method: 'POST',
      body: {
        date: new Date().toISOString().split('T')[0]
      }
    });

    if (error) {
      console.error('Silent staff import error:', error);
      return {
        success: false,
        error: error.message
      };
    }

    if (data && data.error) {
      console.error('Silent staff import function error:', data.error);
      return {
        success: false,
        error: data.error
      };
    }

    const staffCount = data?.data?.length || 0;
    console.log(`✅ Silent staff import completed: ${staffCount} staff members processed`);
    
    return {
      success: true,
      data: data?.data || []
    };
  } catch (error) {
    console.error('Exception during silent staff import:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during staff import'
    };
  }
};
