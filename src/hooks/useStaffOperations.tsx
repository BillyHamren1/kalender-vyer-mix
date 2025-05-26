
import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { assignStaffToTeam, removeStaffAssignment } from '@/services/staffService';

export const useStaffOperations = (currentDate: Date) => {
  const [staffAssignmentsUpdated, setStaffAssignmentsUpdated] = useState(false);
  const [processingStaffIds, setProcessingStaffIds] = useState<string[]>([]);

  // Handle staff drop for assignment with optimistic updates
  const handleStaffDrop = useCallback(async (staffId: string, resourceId: string | null) => {
    console.log(`useStaffOperations.handleStaffDrop called with staffId=${staffId}, resourceId=${resourceId || 'unassigned'}, date=${currentDate.toISOString().split('T')[0]}`);
    
    // If both staffId and resourceId are empty, just trigger a refresh
    if (!staffId) {
      console.log('No staffId provided, triggering refresh');
      setStaffAssignmentsUpdated(prev => !prev);
      return Promise.resolve();
    }

    // Track staff being processed
    setProcessingStaffIds(prev => [...prev, staffId]);
    
    try {
      if (resourceId) {
        console.log(`Assigning staff ${staffId} to team ${resourceId} for date ${currentDate.toISOString().split('T')[0]}`);
        // Show toast in background without blocking UI
        const toastId = toast.loading(`Assigning staff to team...`);
        
        await assignStaffToTeam(staffId, resourceId, currentDate);
        toast.success('Staff assigned successfully', { id: toastId });
      } else {
        console.log(`Removing staff ${staffId} assignment for date ${currentDate.toISOString().split('T')[0]}`);
        // Show toast in background without blocking UI
        const toastId = toast.loading(`Removing staff assignment...`);
        
        await removeStaffAssignment(staffId, currentDate);
        toast.success('Staff removed successfully', { id: toastId });
      }
      
      // Trigger a refresh of the staff assignments after backend update (ONLY refresh, no optimistic update)
      console.log('Staff operation successful, triggering UI refresh...');
      setStaffAssignmentsUpdated(prev => !prev);
      
      return Promise.resolve();
    } catch (error) {
      console.error('Error handling staff drop:', error);
      toast.error('Failed to update staff assignment');
      return Promise.reject(error);
    } finally {
      // Remove staff from processing list
      setProcessingStaffIds(prev => prev.filter(id => id !== staffId));
    }
  }, [currentDate]);

  return {
    staffAssignmentsUpdated,
    processingStaffIds,
    handleStaffDrop
  };
};
