
import { useCallback, useState } from 'react';
import { assignStaffToTeam, removeStaffAssignment } from '@/services/staffService';
import { toast } from 'sonner';

export const useStaffOperations = (currentDate: Date) => {
  const [processingStaffIds, setProcessingStaffIds] = useState<string[]>([]);

  // `fromTeamId` (optional): when removing (resourceId === null), restrict
  // the removal to a single team-row so multi-team memberships are preserved.
  const handleStaffDrop = useCallback(async (
    staffId: string,
    resourceId: string | null,
    fromTeamId?: string,
  ) => {
    if (!staffId) return;

    setProcessingStaffIds(prev => [...prev, staffId]);

    try {
      if (resourceId) {
        const toastId = toast.loading('Assigning staff...');
        await assignStaffToTeam(staffId, resourceId, currentDate);
        toast.success(`Staff assigned to ${resourceId}`, { id: toastId });
      } else {
        const toastId = toast.loading('Removing assignment...');
        await removeStaffAssignment(staffId, currentDate, fromTeamId);
        toast.success(
          fromTeamId ? 'Removed from team' : 'Assignment removed',
          { id: toastId },
        );
      }

      window.dispatchEvent(new Event('staff-assignment-updated'));
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to update assignment';
      toast.error(errorMessage);
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
