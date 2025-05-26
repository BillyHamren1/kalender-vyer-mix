import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { assignStaffToTeam, removeStaffAssignment } from '@/services/staffService';

// DEPRECATED: This hook is being replaced by useReliableStaffOperations
// Keeping minimal functionality for backward compatibility
export const useStaffOperations = (currentDate: Date) => {
  const [staffAssignmentsUpdated, setStaffAssignmentsUpdated] = useState(false);
  const [processingStaffIds, setProcessingStaffIds] = useState<string[]>([]);

  // Simple refresh trigger for backward compatibility
  const handleStaffDrop = useCallback(async (staffId: string, resourceId: string | null) => {
    console.log(`useStaffOperations.handleStaffDrop (deprecated) called with staffId=${staffId}, resourceId=${resourceId || 'unassigned'}`);
    
    // If both staffId and resourceId are empty, just trigger a refresh
    if (!staffId) {
      console.log('No staffId provided, triggering refresh');
      setStaffAssignmentsUpdated(prev => !prev);
      return Promise.resolve();
    }

    // For actual operations, log a warning that this is deprecated
    console.warn('useStaffOperations is deprecated. Use useReliableStaffOperations instead.');
    
    // Track staff being processed
    setProcessingStaffIds(prev => [...prev, staffId]);
    
    try {
      if (resourceId) {
        console.log(`Assigning staff ${staffId} to team ${resourceId} for date ${currentDate.toISOString().split('T')[0]}`);
        const toastId = toast.loading(`Assigning staff to team...`);
        
        await assignStaffToTeam(staffId, resourceId, currentDate);
        toast.success('Staff assigned successfully', { id: toastId });
      } else {
        console.log(`Removing staff ${staffId} assignment for date ${currentDate.toISOString().split('T')[0]}`);
        const toastId = toast.loading(`Removing staff assignment...`);
        
        await removeStaffAssignment(staffId, currentDate);
        toast.success('Staff removed successfully', { id: toastId });
      }
      
      // Trigger a refresh of the staff assignments after backend update
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
