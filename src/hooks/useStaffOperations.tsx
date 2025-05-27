
import { useCallback, useState } from 'react';
import { assignStaffToTeam, removeStaffAssignment } from '@/services/staffService';
import { toast } from 'sonner';

export const useStaffOperations = (currentDate: Date) => {
  const [processingStaffIds, setProcessingStaffIds] = useState<string[]>([]);

  const handleStaffDrop = useCallback(async (staffId: string, resourceId: string | null) => {
    if (!staffId) return;

    setProcessingStaffIds(prev => [...prev, staffId]);

    try {
      const dateStr = currentDate.toISOString().split('T')[0];

      if (resourceId) {
        const toastId = toast.loading('Assigning staff...');
        await assignStaffToTeam(staffId, resourceId, currentDate);
        toast.success(`Staff assigned to ${resourceId}`, { id: toastId });
      } else {
        const toastId = toast.loading('Removing assignment...');
        await removeStaffAssignment(staffId, currentDate);
        toast.success('Assignment removed', { id: toastId });
      }

      // Reload calendar data directly after operation (important!)
      window.dispatchEvent(new Event("staff-assignment-updated"));

    } catch (error) {
      toast.error('Failed to update assignment');
      console.error(error);
    } finally {
      setProcessingStaffIds(prev => prev.filter(id => id !== staffId));
    }
  }, [currentDate]);

  return {
    processingStaffIds,
    handleStaffDrop
  };
};
