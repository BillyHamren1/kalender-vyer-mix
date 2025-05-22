
import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { assignStaffToTeam, removeStaffAssignment } from '@/services/staffService';

export const useStaffOperations = (currentDate: Date) => {
  const [staffAssignmentsUpdated, setStaffAssignmentsUpdated] = useState(false);

  // Handle staff drop for assignment
  const handleStaffDrop = useCallback(async (staffId: string, resourceId: string | null) => {
    console.log(`useStaffOperations.handleStaffDrop called with staffId=${staffId}, resourceId=${resourceId || 'unassigned'}`);
    
    try {
      // If both staffId and resourceId are empty, just trigger a refresh
      if (!staffId) {
        console.log('No staffId provided, triggering refresh');
        setStaffAssignmentsUpdated(prev => !prev);
        return Promise.resolve();
      }
      
      if (resourceId) {
        console.log(`Assigning staff ${staffId} to team ${resourceId}`);
        toast.info(`Assigning staff to team...`);
        await assignStaffToTeam(staffId, resourceId, currentDate);
        toast.success('Staff assigned to team successfully');
      } else {
        console.log(`Removing staff ${staffId} assignment`);
        toast.info(`Removing staff assignment...`);
        await removeStaffAssignment(staffId, currentDate);
        toast.success('Staff assignment removed successfully');
      }
      
      // Trigger a refresh of the staff assignments
      setStaffAssignmentsUpdated(prev => !prev);
      
      return Promise.resolve();
    } catch (error) {
      console.error('Error handling staff drop:', error);
      toast.error('Failed to update staff assignment');
      return Promise.reject(error);
    }
  }, [currentDate]);

  return {
    staffAssignmentsUpdated,
    handleStaffDrop
  };
};
