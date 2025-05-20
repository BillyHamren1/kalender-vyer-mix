
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { syncStaffMember } from '@/services/staffService';

// Interface for external staff from API
interface ExternalStaffMember {
  id: string;
  name: string;
  role: string;
  email: string | null;
  phone: string | null;
  isavailable: boolean;
}

interface StaffSyncManagerProps {
  currentDate: Date;
  onSyncComplete?: () => void;
}

/**
 * Component to handle staff synchronization with external system
 */
const StaffSyncManager: React.FC<StaffSyncManagerProps> = ({ 
  currentDate,
  onSyncComplete
}) => {
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);

  // Prefetch and sync all staff
  const ensureStaffSynced = async () => {
    try {
      setIsLoadingStaff(true);
      const formattedDate = currentDate.toISOString().split('T')[0];
      
      // Call the edge function to get all staff
      const { data, error } = await supabase.functions.invoke('fetch_staff_for_planning', {
        body: { date: formattedDate }
      });
      
      if (error) {
        console.error('Error fetching staff data:', error);
        return;
      }
      
      if (data && data.success && data.data) {
        // Sync all staff members to our database
        const staffList = data.data as ExternalStaffMember[];
        
        for (const staff of staffList) {
          await syncStaffMember(
            staff.id,
            staff.name,
            staff.email || undefined,
            staff.phone || undefined
          );
        }
        
        console.log(`Synced ${staffList.length} staff members`);
        if (onSyncComplete) onSyncComplete();
      }
    } catch (error) {
      console.error('Error syncing staff:', error);
    } finally {
      setIsLoadingStaff(false);
    }
  };
  
  // Make sure to sync staff when the component loads
  useEffect(() => {
    ensureStaffSynced();
  }, [currentDate]);

  // This is a utility component with no UI
  return null;
};

export default StaffSyncManager;
